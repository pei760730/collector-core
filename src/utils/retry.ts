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

export function isTransient(err: unknown): boolean {
  const e = err as { code?: number | string; response?: { status?: number }; message?: string };
  const httpCode = typeof e?.code === "number" ? e.code : e?.response?.status;
  if (httpCode === 429 || (typeof httpCode === "number" && httpCode >= 500 && httpCode < 600)) {
    return true;
  }
  const codeStr = typeof e?.code === "string" ? e.code : "";
  const msg = String(e?.message ?? "");
  return (
    /Premature close/i.test(msg) ||
    /ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up|network/i.test(
      `${codeStr} ${msg}`,
    )
  );
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
      const backoff = 500 * 2 ** (attempt - 1); // 0.5s,1s,2s
      logger.warn(`${label} 第 ${attempt}/${tries} 次失敗,${backoff}ms 後重試`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}
