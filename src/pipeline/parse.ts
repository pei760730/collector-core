/**
 * Parse — 從 Telegram 訊息文字抽出第一個網址 + 備註。
 * 純函式,無副作用,好測試。
 */
import type { ParsedMessage } from "../types.js";

/** 抓訊息中第一個 http(s) 網址。 */
const URL_RE = /https?:\/\/\S+/;

// 1) 截斷在第一個「非 URL 合法字元」—— CJK 等必須 %-encode 的字不會出現在裸 URL,
//    所以遇到就代表後面是備註。把 `…/abc。很好笑` 切回 `…/abc`。
const NON_URL_CHAR = /[^A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%].*$/u;
// 2) 再剝掉尾端句讀(這些雖是合法 URL 字元,但黏在連結尾幾乎都是標點)。
const TRAILING_PUNCT = /[.,;:!?)\]'"}>]+$/u;

/** 把訊息抓到的裸 URL 修乾淨:截斷非法字元 + 剝尾端標點。 */
export function tidyUrl(raw: string): string {
  return raw.replace(NON_URL_CHAR, "").replace(TRAILING_PUNCT, "");
}

/** scheme 允許清單 —— 只放行 http/https;javascript:/data:/file: 等一律擋。 */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * 嚴格驗證:必須 `new URL()` 可解析、scheme ∈ {http,https}、且有 host。
 * regex(`^https?://…`)只保證前綴長相,擋不掉 `https://[` 這類畸形或
 * `javascript:`/`data:` 之類非 http(s) 捕獲。這層用真解析把髒值擋在 core 邊界,
 * 否則會直穿三個下游 collector(short-video-bot / clip-collector / feed-collector)。
 */
export function isValidHttpUrl(s: string): boolean {
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return false;
  }
  return ALLOWED_PROTOCOLS.has(u.protocol) && u.hostname.length > 0;
}

// 外部字串上限(fanout-safety):被匹配的裸 URL / 備註來自外部訊息,無界長度會把
// 超大 / 注入 payload 原封不動散給每個消費端。在 core 邊界截斷 + 標記 truncated。
// URL 上限取常見瀏覽器上限(2048);超長 URL 幾乎必是垃圾/攻擊,截斷後多半解析失敗被擋。
const MAX_URL_LEN = 2048;
// 備註只是 display-only 附註,2000 字綽綽有餘。
const MAX_NOTE_LEN = 2000;

// 備註頭部:連結與備註之間殘留的分隔標點(含 CJK)一律剝掉,如 `…/abc。健身梗` 的 `。`、
// 包裹連結的 `(…)` 殘餘。含句末語氣標點(. , ! ?。!?)以便清掉純標點殘渣。
const NOTE_LEAD_SEP = /^[\s.,;:!?、。，．！？；：（）()[\]{}<>「」『』《》〈〉"'　]+/u;
// 備註尾部:只剝括號/引號/分隔標點與空白,**保留**句末語氣標點(備註「哈哈!」的 `!` 要留)。
const NOTE_TRAIL_SEP = /[\s、，；：（）()[\]{}<>「」『』《》〈〉"'　]+$/u;

/** 清理備註:收斂連續空白、剝頭尾殘留分隔標點(尾端保留語氣標點)。 */
export function cleanNote(s: string): string {
  return s
    .replace(/[ \t]{2,}/g, " ")
    .replace(NOTE_LEAD_SEP, "")
    .replace(NOTE_TRAIL_SEP, "")
    .trim();
}

export class NoUrlError extends Error {
  constructor() {
    super("訊息中找不到網址");
    this.name = "NoUrlError";
  }
}

export interface ParseInput {
  text: string;
}

/**
 * @throws {NoUrlError} 訊息沒有網址(格式錯誤)。
 */
export function parseMessage(input: ParseInput): ParsedMessage {
  const text = (input.text ?? "").trim();
  const match = text.match(URL_RE);
  if (!match) {
    throw new NoUrlError();
  }
  const token = match[0];
  const tidied = tidyUrl(token);
  let truncated = false;
  // 先界定長度(fanout-safety),再嚴格驗證:超長 URL 截斷後多半 parse 失敗被擋。
  let rawUrl = tidied;
  if (rawUrl.length > MAX_URL_LEN) {
    rawUrl = rawUrl.slice(0, MAX_URL_LEN);
    truncated = true;
  }
  if (!isValidHttpUrl(rawUrl)) {
    // 整段被剝光(`https://` 後全是標點)或非 http(s)/畸形 URL → 視為沒有有效網址
    throw new NoUrlError();
  }
  // 備註 = 用「位置」切掉被匹配的整個 token,再把 tidyUrl 從 token 尾端截掉的備註正文補回。
  // 不用 text.replace(rawUrl):replace 只換首個出現、且會誤切備註裡與 URL 相同的片段。
  // urlTail 用「未截斷」的 tidied 長度算,避免把超長 URL 的截斷尾段灌進備註。
  const before = text.slice(0, match.index ?? 0);
  const after = text.slice((match.index ?? 0) + token.length);
  const urlTail = token.slice(tidied.length); // tidyUrl 砍掉的尾段(備註開頭 / 包裹標點)
  let note = cleanNote(`${before}${urlTail}${after}`);
  if (note.length > MAX_NOTE_LEN) {
    note = note.slice(0, MAX_NOTE_LEN);
    truncated = true;
  }
  return { rawUrl, note, truncated };
}
