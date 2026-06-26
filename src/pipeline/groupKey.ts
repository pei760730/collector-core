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
import { detectPlatform } from "./detectPlatform.js";
import { extractVideoId } from "./extractVideoId.js";

export function groupKey(url: string): string {
  const u = (url ?? "").trim();
  const platform = detectPlatform(u);
  if (platform.method === "domain_match") {
    const vid = extractVideoId(platform.platform, u);
    if (!vid.unsupported) return vid.videoId.trim().toLowerCase();
  }
  return u
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}
