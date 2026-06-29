/**
 * Extract Video ID — 從乾淨網址抽出帶平台前綴的唯一 ID。
 * 抓不到 → videoId 留空且標 unsupported(unsupported 時 dedupKey 不讀 videoId,退連結路徑 key)。
 */
import type { Platform, VideoIdInfo } from "../types.js";

/** 依序試多個 pattern,回傳第一個命中的 capture group。 */
function firstMatch(url: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = url.match(re);
    if (m) {
      // 取最後一個非空 capture group(有些 pattern 第 2 組才是 id)
      for (let i = m.length - 1; i >= 1; i--) {
        if (m[i]) return m[i] as string;
      }
    }
  }
  return null;
}

// Task1(2026-06-27):path 型 id pattern 只比對 **host+pathname**(不吃 query),擋
// `?redirect=/video/<n>`、`?ref=/videos/<n>`、`?from=/reel/<code>` 之類 query 注入造假 id。
// 合法的 query id(YouTube `?v=`、Facebook `story_fbid`/`v`)另以白名單從 searchParams 抽。
// TikTok 只認 path /video/<id>:item_id=(query 注入面)、裸 19 碼(真實短碼非純數字)2026-06-27 砍除。
const TIKTOK_PATTERNS = [/\/video\/(\d+)/];
// reel / reels(複數)/ p / tv(IGTV 舊形態)—— 對齊引擎 voc/tbvoc normalize `(?:reels?|p|tv)`。
const INSTAGRAM_PATTERNS = [/\/(reels?|p|tv)\/([a-zA-Z0-9_-]+)/];
// YouTube path 型形態(shorts/youtu.be/embed/live);watch?v= 走 query 白名單(見 youtubeQueryId)。
// 結尾 (?![a-zA-Z0-9_-]) 右邊界:YouTube ID 恰 11 碼。非 11 碼(如 12 碼)整段不命中 → 落 unsupported。
const YOUTUBE_PATH_PATTERNS = [
  /shorts\/([a-zA-Z0-9_-]{11})(?![a-zA-Z0-9_-])/,
  /youtu\.be\/([a-zA-Z0-9_-]{11})(?![a-zA-Z0-9_-])/,
  /\/embed\/([a-zA-Z0-9_-]{11})(?![a-zA-Z0-9_-])/,
  /\/live\/([a-zA-Z0-9_-]{11})(?![a-zA-Z0-9_-])/,
];
const YOUTUBE_V_ID = /^[a-zA-Z0-9_-]{11}$/;
// 小紅書筆記兩種正規路徑:/explore/<id> 與 /discovery/item/<id>。id 是 24 碼 hex
// (真實 id 為小寫,但 share 工具偶有大寫)。`i` flag 對齊引擎 voc/tbvoc normalize 的
// `[a-f0-9]` + `re.I`:大寫 hex 整段抽(再由 groupKey 的 toLowerCase 收斂),避免遇大寫字母
// 截斷成殘 id → 兩支不同筆記假合併成同群(2026-06-29 修)。
const XHS_PATTERNS = [/\/explore\/([a-f0-9]+)/i, /\/discovery\/item\/([a-f0-9]+)/i];
const THREADS_PATTERNS = [/\/post\/([a-zA-Z0-9_-]+)/];
// X(Twitter)推文 id(port 自 yt-dlp TwitterIE):/status/<數字>。涵蓋 /user/status/、i/web/status/。
const X_PATTERNS = [/\/status\/(\d+)/];
// 抖音(Douyin = TikTok 中國版;port 自 yt-dlp DouyinIE):只認 path /video/<id>
// (裸 19 碼 2026-06-27 砍除,同 TikTok)。短連結 v.douyin.com 需展開,非此處負責。
const DOUYIN_PATTERNS = [/\/video\/(\d+)/];

/** 把乾淨網址拆成 host+pathname(去 query/fragment)與 searchParams。非合法 URL → 字串退路。 */
function splitUrl(url: string): { pathPart: string; params: URLSearchParams | null } {
  try {
    const u = new URL(url);
    return { pathPart: `${u.host}${u.pathname}`, params: u.searchParams };
  } catch {
    return { pathPart: url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/[?#].*$/, ""), params: null };
  }
}

/** YouTube watch?v= 走 query 白名單:取 top-level `v`、且恰 11 碼才算(非 11 碼不抽,落 unsupported)。 */
function youtubeQueryId(params: URLSearchParams | null): string | null {
  const v = params?.get("v") ?? "";
  return YOUTUBE_V_ID.test(v) ? v : null;
}

/**
 * Facebook 抽 ID(比 n8n 版「Facebook 一律 unknown」強)。
 * 四種形態依序試,各帶不同前綴讓 dedup key 不互撞(前綴只進去重 key,不寫 Sheet):
 *   A. fb.watch/<code>            → fbw_   (host+pathname)
 *   B. /(reel|reels|videos)/<n>   → fb_    (host+pathname)
 *   C. /share/[rvp]/<code>        → fbs_   (host+pathname)
 *   D. query story_fbid 或 v      → fb_    (query 白名單)
 * 四種都不中(如純個人頁 / 社團)→ 回 null,退 unknown_ + 連結路徑去重。
 */
function extractFacebook(pathPart: string, params: URLSearchParams | null): string | null {
  const fbw = pathPart.match(/fb\.watch\/([A-Za-z0-9_-]+)/);
  if (fbw) return `fbw_${fbw[1]}`;
  const vids = pathPart.match(/\/(?:reel|reels|videos)\/(\d+)/);
  if (vids) return `fb_${vids[1]}`;
  const share = pathPart.match(/\/share\/[rvp]\/([A-Za-z0-9_-]+)/);
  if (share) return `fbs_${share[1]}`;
  const story = params?.get("story_fbid") ?? params?.get("v");
  if (story) return `fb_${story}`;
  return null;
}

export function extractVideoId(platform: Platform, cleanUrl: string): VideoIdInfo {
  const { pathPart, params } = splitUrl(cleanUrl ?? "");
  let raw: string | null = null;
  let prefix = "";

  switch (platform) {
    case "TikTok":
      prefix = "tiktok";
      raw = firstMatch(pathPart, TIKTOK_PATTERNS);
      break;
    case "Instagram":
      prefix = "ig";
      raw = firstMatch(pathPart, INSTAGRAM_PATTERNS);
      break;
    case "YouTube":
      prefix = "yt";
      raw = firstMatch(pathPart, YOUTUBE_PATH_PATTERNS) ?? youtubeQueryId(params);
      break;
    case "小紅書":
      prefix = "xhs";
      raw = firstMatch(pathPart, XHS_PATTERNS);
      break;
    case "Threads":
      prefix = "threads";
      raw = firstMatch(pathPart, THREADS_PATTERNS);
      break;
    case "Facebook": {
      // FB id 已自帶前綴(fbw_/fb_/fbs_)→ 直接回,不再套 `${prefix}_`。
      const fbId = extractFacebook(pathPart, params);
      if (fbId) return { videoId: fbId, unsupported: false };
      raw = null; // 四形態皆不中 → 退 unknown_
      break;
    }
    case "X":
      prefix = "x";
      raw = firstMatch(pathPart, X_PATTERNS);
      break;
    case "抖音":
      prefix = "douyin";
      raw = firstMatch(pathPart, DOUYIN_PATTERNS);
      break;
    // 其餘(Unknown 等):無抽取規則 → 視為不支援,去重退連結路徑 key
    default:
      raw = null;
  }

  if (!raw) {
    return { videoId: "", unsupported: true };
  }
  return { videoId: `${prefix}_${raw}`, unsupported: false };
}
