/**
 * 連結 → 去重分群 key(direct 寫入模型用;對齊引擎 `dedup_key`,跨語言分群等價)。
 *
 * 抽 video id 成功(domain_match)→ 用 extractVideoId 的「平台前綴_影片id」當 key:
 *   - **已帶平台命名空間**(`tiktok_…`/`douyin_…`),跨平台同數字 id 不會誤撞。
 *   - 同支影片不同形態(youtu.be/shorts/watch?v=)收斂同 key。
 * 抽不到 id(平台不支援 / 連結沒帶 id)→ 退連結路徑 key:砍 query/fragment、去尾斜線、lower。
 *
 * 候選列與既有列都走這支(吃同樣乾淨連結)→ 兩邊算出的 key 一致才能正確去重。
 * 格式(分隔符 `_` vs 引擎 `:`)允許不同,只保證**分群等價** —— 引擎側 contracts/dedup_vectors.json
 * 跨語言守門(各 collector 的 conformance 對著跑)。
 */
import type { PlatformInfo, VideoIdInfo } from "../types.js";
import { detectPlatform } from "./detectPlatform.js";
import { extractVideoId } from "./extractVideoId.js";

/**
 * groupKey 的預計算輸入(效能用,opt-in)。assembleDraft 這類呼叫端本來就先跑過
 * detectPlatform / extractVideoId(同一條 URL),再叫 groupKey 會整套重跑
 * (`new URL` ×2 + regex 比對,~4-5 次解析/列)——傳進來即可跳過重算。
 * ⚠️ 正確性契約:兩欄都必須是用**同一個 url 參數**算出來的結果;傳別條 URL 的結果
 * 進來 = 分群直接錯。不確定就別傳(預設路徑自算,行為不變)。
 */
export interface GroupKeyPrecomputed {
  /** `detectPlatform(url)` 的結果。 */
  platform: PlatformInfo;
  /** `extractVideoId(platform.platform, url)` 的結果;省略則自算(僅 domain_match 用到)。 */
  videoId?: VideoIdInfo;
}

// 顯式 overload:讓 `urls.map(groupKey)` 這種 point-free 用法(map 會多塞 index)
// 仍能匹配單參數簽名 —— 選用參數版單一簽名會讓既有呼叫端型別紅掉。
export function groupKey(url: string): string;
export function groupKey(url: string, pre: GroupKeyPrecomputed): string;
export function groupKey(url: string, pre?: GroupKeyPrecomputed): string {
  const u = (url ?? "").trim();
  const platform = pre?.platform ?? detectPlatform(u);
  if (platform.method === "domain_match") {
    const vid = pre?.videoId ?? extractVideoId(platform.platform, u);
    if (!vid.unsupported) return vid.videoId.trim().toLowerCase();
  }
  return u
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}
