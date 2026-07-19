/**
 * 傳輸層無關的退避重試 helper —— 不引 googleapis、零新依賴。
 *
 * `isTransient`:判斷錯誤是否「暫態」(429 / 5xx,或取 token / 連線時的網路型錯誤
 * `Premature close`、ECONNRESET、ETIMEDOUT、EPIPE、ECONNREFUSED、EAI_AGAIN、ENOTFOUND、
 * socket hang up、network…)。其餘(4xx、表頭不符等真錯)維持 fail-fast 直接丟。
 * 這是三個 collector 各自 isTransient 的嚴格聯集(superset),沒有任何 repo 在收編後掉覆蓋。
 *
 * `withRetry`:對暫態錯誤做指數退避重試。`alreadyDone` 是冪等護欄 —— 非冪等寫入(append)
 * 可能「寫成功但回應遺失」觸發重試導致雙寫;重試前先問一次「上次其實成功了嗎?」是就視為完成。
 */
import { logger } from "./logger.js";

/**
 * 403 只有在「配額/速率」語意下才暫態;純權限 403 維持 fail-fast。
 * 訊號:回了 Retry-After 表頭,或 Google reason ∈ rate/quota exhausted。
 */
function isQuota403(e: {
  response?: { headers?: Record<string, unknown>; data?: unknown };
  errors?: Array<{ reason?: string }>;
}): boolean {
  const headers = e?.response?.headers ?? {};
  if (headers["retry-after"] != null || headers["Retry-After"] != null) return true;
  const data = e?.response?.data as
    | { error?: { errors?: Array<{ reason?: string }>; status?: string } }
    | undefined;
  const reason =
    e?.errors?.[0]?.reason ?? data?.error?.errors?.[0]?.reason ?? data?.error?.status;
  return (
    typeof reason === "string" &&
    /rateLimitExceeded|userRateLimitExceeded|quotaExceeded|RESOURCE_EXHAUSTED/i.test(reason)
  );
}

export function isTransient(err: unknown): boolean {
  const e = err as {
    code?: number | string;
    response?: { status?: number; headers?: Record<string, unknown>; data?: unknown };
    errors?: Array<{ reason?: string }>;
    message?: string;
  };
  const httpCode = typeof e?.code === "number" ? e.code : e?.response?.status;
  if (httpCode === 429 || (typeof httpCode === "number" && httpCode >= 500 && httpCode < 600)) {
    return true;
  }
  // 403 quota:Google Sheets/Drive 的 userRateLimitExceeded 常回 403(非 429),舊碼一律
  // fail-fast → parseRetryAfterMs 的「403 quota」分支永遠打不到。只在帶配額訊號時暫態,
  // 純權限 403 仍 fail-fast(不重試打不開的權限)。
  if (httpCode === 403 && isQuota403(e)) return true;
  const codeStr = typeof e?.code === "string" ? e.code : "";
  const msg = String(e?.message ?? "");
  return (
    /Premature close/i.test(msg) ||
    /ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up|network/i.test(
      `${codeStr} ${msg}`,
    )
  );
}

// 退避基準。一般暫態(5xx / 網路)用 500ms 起跳的指數退避即可;但 429 quota 不同 ——
// Google Sheets 寫入配額是「每分鐘」制(60/min),舊的 500·2^n(0.5/1/2s,合計~3.5s)
// 全燒在 3.5s 窗內,永遠等不到 60s 配額窗滾動,4 次注定失敗、還反過來拖慢配額復原。
// 對 429:優先聽 Google 回的 Retry-After(它明說何時可再打),沒有才用「秒級」較長退避,
// 才有機會跨過分鐘邊界真的復原。上限夾在 60s 避免無界等待。
const BACKOFF_BASE_MS = 500; // 一般暫態(5xx / 網路)
const BACKOFF_BASE_429_MS = 5_000; // 每分鐘配額 429:秒級起跳
const BACKOFF_CAP_MS = 60_000; // Retry-After 與退避上限

function httpStatus(err: unknown): number | undefined {
  const e = err as { code?: number | string; response?: { status?: number } };
  return typeof e?.code === "number" ? e.code : e?.response?.status;
}

/**
 * 解析 Google/HTTP 在 429(或 403 quota)回的 Retry-After —— 支援秒數與 HTTP-date 兩種格式,
 * 也吃 gaxios 風格的 `err.retryAfter`。解不出來回 undefined(交回退避預設)。夾上限 60s。
 */
function parseRetryAfterMs(err: unknown, now: number = Date.now()): number | undefined {
  const e = err as {
    retryAfter?: number | string;
    response?: { headers?: Record<string, string | number | undefined> };
  };
  const headers = e?.response?.headers ?? {};
  const raw = e?.retryAfter ?? headers["retry-after"] ?? headers["Retry-After"];
  if (raw == null || raw === "") return undefined;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? Math.min(BACKOFF_CAP_MS, raw * 1000) : undefined;
  }
  const s = String(raw).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.min(BACKOFF_CAP_MS, Number(s) * 1000);
  const t = Date.parse(s); // HTTP-date
  if (Number.isFinite(t)) return Math.min(BACKOFF_CAP_MS, Math.max(0, t - now));
  return undefined;
}

/** 本次重試前該等多久:Retry-After 優先;否則配額錯誤(429 或 403 quota)走秒級基準、
 * 其餘走 500ms 基準,均加 full jitter。403 quota 與 429 同屬「每分鐘配額」語意,若掉回 500ms
 * 基準會 0.5/1/2s 全燒在配額窗內、4 次注定失敗(見上 429 註解),故與 429 同層。 */
function backoffMs(err: unknown, attempt: number): number {
  const retryAfter = parseRetryAfterMs(err);
  if (retryAfter !== undefined) return retryAfter;
  const st = httpStatus(err);
  const isQuotaTier =
    st === 429 || (st === 403 && isQuota403(err as Parameters<typeof isQuota403>[0]));
  const base = isQuotaTier ? BACKOFF_BASE_429_MS : BACKOFF_BASE_MS;
  const exp = Math.min(BACKOFF_CAP_MS, base * 2 ** (attempt - 1));
  const jitter = Math.floor(Math.random() * base); // full jitter,打散同時觸發的多 writer
  return Math.min(BACKOFF_CAP_MS, exp + jitter);
}

export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts: { tries?: number; alreadyDone?: () => Promise<boolean> } = {},
): Promise<T> {
  // tries 至少 1:呼叫端傳 0 / 負數(邊界/誤用)時,若不夾住則迴圈一次都不跑、
  // 最後 `throw lastErr` 會丟出 undefined(非 Error),極難追。夾到 1 保證 fn 至少執行一次。
  const tries = Math.max(1, Math.trunc(opts?.tries ?? 4));
  let lastErr: unknown;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = isTransient(err);
      if (!retryable || attempt === tries) throw err;
      // 冪等護欄「每次重試前」都查一次是刻意的:每一次 fn 重打都是一次可能的雙寫,
      // 護欄必須在每次重打前擋。挪成「只在放棄前查一次」會讓中間幾次盲目重打 append =
      // 放大雙寫,反而傷資料正確性。429 storm 下多這幾次讀的代價,由上面拉長的退避
      // (Retry-After / 秒級 backoff → 更少、更晚的重打)抵掉。
      if (opts.alreadyDone) {
        try {
          if (await opts.alreadyDone()) {
            logger.warn(`${label} 第 ${attempt} 次回應遺失但寫入已存在,視為成功(不重打)`);
            return undefined as T;
          }
        } catch {
          // 護欄查詢本身失敗就照常重試,不放大故障。
        }
      }
      const backoff = backoffMs(err, attempt);
      logger.warn(`${label} 第 ${attempt}/${tries} 次失敗,${backoff}ms 後重試`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}
