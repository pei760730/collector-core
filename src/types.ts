/**
 * collector-core 共用型別(引擎無關)。
 *
 * 只放「三個 collector 共通、與下游引擎無關」的純型別 —— 平台判定、各 pipeline 階段輸出。
 * 與引擎綁定的東西(參考池 RefRow / 暫存區 StagingRow / schema 欄位)不在這裡 ——
 * adapter 預備設計已解散(PR #12),per-engine 型別留在各 collector 自己的 repo。
 */

/** 支援的平台(內部判定用顯示名;寫進 Sheet 的小寫碼見 PLATFORM_CODE)。 */
export type Platform =
  | "TikTok"
  | "YouTube"
  | "Facebook"
  | "Instagram"
  | "Threads"
  | "X"
  | "抖音"
  | "小紅書"
  /** 認不得的網域(fallback / 解析失敗)。不誤猜。 */
  | "Unknown";

export type DetectionMethod = "domain_match" | "fallback" | "error";

/**
 * 平台顯示名 → 全系統下游統一的小寫代碼。
 * 三個引擎(voc / TeaBus-VOC / of-content-engine)都用這組碼;碼集合的 SSoT 在引擎側
 * schema.json 的 platformCodes(voc normalize._PLATFORM_RULES),adapter 寫入前轉碼並驗 ∈ schema。
 */
export const PLATFORM_CODE: Record<Platform, string> = {
  TikTok: "tiktok",
  YouTube: "youtube",
  Facebook: "facebook",
  Instagram: "instagram",
  Threads: "threads",
  X: "x",
  抖音: "douyin",
  小紅書: "xiaohongshu",
  Unknown: "unknown",
};

/** Parse 階段輸出。 */
export interface ParsedMessage {
  /** 原始(未清理)網址,給 cleanUrl 當輸入。 */
  rawUrl: string;
  /** 訊息文字移除網址後的備註(display-only;是否寫入由 adapter 決定)。 */
  note: string;
}

/** Clean URL 階段輸出。 */
export interface CleanedUrl {
  cleanUrl: string;
  /** 是否為已知短網址服務(bit.ly 等)。 */
  isShortUrl: boolean;
}

/** Detect Platform 階段輸出。 */
export interface PlatformInfo {
  platform: Platform;
  method: DetectionMethod;
}

/** Extract Video ID 階段輸出。 */
export interface VideoIdInfo {
  /** 帶平台前綴的唯一 ID,如 tiktok_7234...;抓不到(unsupported)留空(groupKey 退連結路徑)。 */
  videoId: string;
  /** 抓不到 ID(平台不支援或格式異常)。 */
  unsupported: boolean;
}
