/**
 * Clean URL — 移除追蹤參數、格式清理、行動版轉桌面版、短網址偵測。
 * 純函式(不發網路請求);短網址展開另外用 expandShortUrl(opt-in)。
 */
import type { CleanedUrl } from "../types.js";

/**
 * 要移除的追蹤參數。
 * ⚠️ fleet 級行為:CLEAN_URL 是 feed 總表 gate 的 key、groupKey fallback 也吃它——
 * 這個 Set 增刪一個參數,三個 consumer 的同片可能清出不同 CLEAN_URL(gate 漏擋)
 * 或不同 URL 被誤合併。契約向量不覆蓋追蹤參數;守門在 tests/cleanUrl.test.ts 的
 * 「TRACKING_PARAMS 行為快照」——改這裡必須同步改快照,讓增刪是有意識的決定。
 */
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "msclkid",
  "twclid",
  "li_fat_id",
  // Meta / Instagram / Threads 分享追蹤碼
  "igsh",
  "igshid",
  "xmt",
  "slof",
  // 小紅書(xiaohongshu)分享指紋 / 時效性 token
  "xsec_token",
  "xsec_source",
  // 2026-07-06 對齊 feed(終審 #8 收斂雙向 drift):TikTok/X 分享後綴 + FB 分享/轉址追蹤碼。
  // 不砍會讓同片不同分享碼清出不同 CLEAN_URL → feed 總表 gate 漏擋、重複回流(gate 命門)。
  "tt_from",
  "s",
  "mibextid",
  "rdid",
]);

/** 行動版 → 桌面版 host 對照。 */
const MOBILE_TO_DESKTOP: Record<string, string> = {
  "m.tiktok.com": "www.tiktok.com",
  "m.facebook.com": "www.facebook.com",
  "m.youtube.com": "www.youtube.com",
  "mobile.twitter.com": "twitter.com",
};

/**
 * 已知短網址服務 host(core 與 feed-collector 兩份必須一致)。
 * 用途:不展開的話短鏈跟展開後長鏈算出不同去重 key → 漏去重。EXPAND_SHORT_URLS=true 時
 * 用 expandShortUrl(follow redirect)展開;展開失敗會優雅退回原值(不會更糟)。
 * 2026-06-27 補台/中常見分享短鏈(實測會 302 到目標):reurl.cc/pse.is/lihi*.cc/s.id/
 * tiny.cc/rb.gy/cutt.ly,以及 xhslink.com(小紅書分享短鏈,展開成 xiaohongshu.com/explore/<id>)。
 * 刻意不收:forms.gle(Google 表單)、a.co(Amazon)—— 非影片分享、收了只是徒增展開噪音。
 */
const SHORT_URL_HOSTS = new Set([
  "bit.ly",
  "tinyurl.com",
  "tiny.cc",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "t.co",
  "short.link",
  "cutt.ly",
  "rb.gy",
  "s.id",
  // 台灣常見分享短鏈(reurl / PicSee / lihi 全網域;實測會 302 到目標)
  "reurl.cc",
  "pse.is",
  "pros.is",
  "lihi.cc",
  "lihi1.cc",
  "lihi2.cc",
  "lihi3.cc",
  "lihi.io",
  "lihi.biz",
  "lihi.tv",
  "myppt.cc",
  // TikTok 短連結:無 /video/<id>,展開成正規 /video/ 連結才抽得到 id。
  "vm.tiktok.com",
  "vt.tiktok.com",
  // 抖音 App 分享短連結:展開成 douyin.com/video/<id> 才抽得到 douyin_<id> 去重。
  "v.douyin.com",
  // 小紅書分享短鏈:展開成 xiaohongshu.com/explore/<hex> 才抽得到 xhs_<hex> 去重。
  "xhslink.com",
  // Facebook 官方短鏈(302 到 facebook.com 目標)。detectPlatform 一直把它列為 FB 域,
  // 但之前漏收在這裡 → 永不展開、抽不到 fb id、永遠退路徑 key(2026-07-13 audit LOW 收進)。
  "fb.me",
]);

/**
 * Facebook 轉址解開:`l.facebook.com/l.php?u=<編碼真網址>` → 還原內層真網址。
 * 非 FB 轉址回 null。`searchParams.get` 已 percent-decode,直接用(不再 decodeURIComponent
 * 雙重解碼)。概念借自 feed-collector —— 從 FB app 分享 IG/TikTok/YT 等「本來就支援」的連結
 * 常被包成這種轉址,不解會落 fallback + unknown_ 垃圾列。
 */
function unwrapFacebookRedirect(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host !== "l.facebook.com" && host !== "lm.facebook.com") return null;
  return url.searchParams.get("u");
}

/** 是否為已知短網址服務(供 collect 決定要不要展開)。 */
export function hasShortHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  return SHORT_URL_HOSTS.has(host);
}

/**
 * 清理網址。傳回乾淨網址 + 是否為短網址。
 * 解析失敗(非合法 URL)時退回字串層級清理,盡量不丟資料。
 */
export function cleanUrl(input: string): CleanedUrl {
  let raw = (input ?? "").trim();
  // 確保有 https:// 前綴
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }

  const isShortUrl = hasShortHost(raw);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // 不是合法 URL → 走純字串清理
    return { cleanUrl: stringCleanup(raw), isShortUrl };
  }

  // Facebook 轉址解開:還原成內層真網址後,重走完整清理(去追蹤參數/行動版/偵測短網址)。
  // 內層 host 不會再是 l.facebook → 不會無限遞迴;isShortUrl 改以內層判定(內層可能是 vm.tiktok)。
  const fbInner = unwrapFacebookRedirect(url);
  if (fbInner != null) {
    return cleanUrl(fbInner);
  }

  // 行動版轉桌面版
  const desktopHost = MOBILE_TO_DESKTOP[url.hostname.toLowerCase()];
  if (desktopHost) {
    url.hostname = desktopHost;
  }

  // 移除追蹤參數
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }

  // 去掉 fragment(#…):groupKey 會砍 #,但 CLEAN_URL 若殘留 #Echobox=/#xtor= 這類
  // 追蹤片段,同片內容會清出不同 CLEAN_URL → feed 總表 gate 漏擋。
  url.hash = "";

  let out = url.toString();
  out = stringCleanup(out);
  return { cleanUrl: out, isShortUrl };
}

/**
 * 字串層級清理:去尾斜線、去空 `?`、合併多個 `&`、修正 `?&` → `?`。
 * URL 物件正規化後通常已乾淨,這層是保險(含非標準 URL)。
 */
function stringCleanup(s: string): string {
  let out = s;
  // fragment 永遠在 query 之後、URL 最末段;砍第一個 # 到結尾即為完整 fragment,
  // 不會誤傷前面合法的 ?v=(非法 URL 走這層 fallback 時也一致去 #frag)。
  out = out.replace(/#.*$/, ""); // 去 fragment(#…)
  out = out.replace(/\?&/g, "?"); // ?& → ?
  out = out.replace(/&{2,}/g, "&"); // 多個 & 合併
  out = out.replace(/[?&]+$/g, ""); // 去尾端孤立的 ? 或 &
  // path 與 query 間多餘斜線 /? → ?:**只**處理真正的 query 邊界(字串中第一個 `?`,
  // fragment 已去掉所以它必是分隔符)。之前的 /\/(\?)/g global 會連 query 值內的
  // 字面 `/?` 一起改寫(如 `?next=/a/?b` 被變造成 `?next=/a?b`),污染參數值。
  const qIdx = out.indexOf("?");
  if (qIdx > 0 && out[qIdx - 1] === "/") {
    out = out.slice(0, qIdx - 1) + out.slice(qIdx);
  }
  // 去尾斜線(不動協定後的 //;真實情況不會只剩 https://)
  out = out.replace(/\/+$/, "");
  return out;
}
