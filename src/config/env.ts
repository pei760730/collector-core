/**
 * 環境變數讀取 helpers —— 三個 collector 的 config.ts 原本各自持一份逐字副本,抽進 core。
 *
 * 純函式,直接讀 `process.env`;**不**在 import 時呼叫 `dotenv.config()`(那是副作用,
 * 該由各 bot 的 entrypoint/config 自行決定)。core 只提供「讀 + 型別化 + fail-fast 驗證」。
 *
 * `chatIdsEnv` 用嚴格 `/^-?\d+$/`:Number("1e5"/"0x10"/"12.0") 都會過 Number.isInteger,
 * 讓打錯的 id 默默變成錯的數字(白名單靜默失準、防灌池 gate 開錯口)。只認純十進位整數字面。
 */
import { readFileSync } from "node:fs";

/** 必要環境變數:缺(未設/空白)即丟錯(fail fast)。回傳去頭尾空白的值。 */
export function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`缺少必要環境變數:${name}(請參考 .env.example)`);
  }
  return v.trim();
}

/** 選用環境變數:未設/空白 → fallback;否則回去頭尾空白的值。 */
export function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

/** 布林環境變數:1/true/yes/on(不分大小寫)為 true;未設/空白 → fallback。 */
export function boolEnv(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v == null || v.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

/** 限定值環境變數;不在白名單直接丟錯。 */
export function enumEnv<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const v = (process.env[name] ?? "").trim();
  if (v === "") return fallback;
  if (!(allowed as readonly string[]).includes(v)) {
    throw new Error(`環境變數 ${name} 只能是 ${allowed.join(" / ")},收到:'${v}'`);
  }
  return v as T;
}

/**
 * 逗號分隔的 chat/user id 白名單(來源授權)。非整數項直接丟錯(fail-fast,
 * 別讓打錯的 id 默默失效後還「以為有保護」)。空字串 → 空陣列(是否強制由呼叫端決定)。
 */
export function chatIdsEnv(name: string): number[] {
  const v = (process.env[name] ?? "").trim();
  if (v === "") return [];
  return v.split(",").map((s) => {
    const t = s.trim();
    // 先驗字面純數字:Number("1e5"/"0x10"/"12.0"/"0b1") 都會過 Number.isInteger,
    // 讓打錯的 id 默默變成錯的數字(白名單靜默失準)。用 /^-?\d+$/ 擋掉
    // 空字串/小數/十六進位/科學記號,只收純十進位整數字面。
    if (!/^-?\d+$/.test(t)) {
      throw new Error(`環境變數 ${name} 內含非整數 chat id:'${t}'(請用逗號分隔的純數字 id)`);
    }
    return Number(t);
  });
}

/** service account 憑證的最小形狀(bot 只用到這兩欄:建 JWT)。 */
export interface GoogleServiceAccountCredentials {
  client_email: string;
  private_key: string;
}

/**
 * 取得 Google service account 憑證。優先序:JSON 字串 > base64 > 檔案路徑。
 * 三來源皆無 → 丟錯;JSON 非法 / 缺 client_email|private_key → 丟錯。
 * private_key 內的字面 `\n` 會還原成真正換行(.env 常見的單行貼法)。
 */
export function loadGoogleCredentials(): GoogleServiceAccountCredentials {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();

  let jsonText: string | undefined;
  if (raw) {
    jsonText = raw;
  } else if (b64) {
    jsonText = Buffer.from(b64, "base64").toString("utf-8");
  } else if (file) {
    jsonText = readFileSync(file, "utf-8");
  } else {
    throw new Error(
      "缺少 Google 憑證:請設 GOOGLE_SERVICE_ACCOUNT_JSON / _BASE64 / _FILE 其一",
    );
  }

  let parsed: { client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("GOOGLE service account JSON 解析失敗(格式不是合法 JSON)");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("service account JSON 缺 client_email / private_key");
  }
  return {
    client_email: parsed.client_email,
    // .env 內的 \n 換行還原
    private_key: parsed.private_key.replace(/\\n/g, "\n"),
  };
}
