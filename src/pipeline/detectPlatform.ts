/**
 * Detect Platform — 依優先序比對 **hostname**(不是子字串)判斷平台。
 * 比對不到 → fallback 到 Unknown(confidence=low)。不再像舊 n8n 誤猜 Instagram
 * (那會把 threads 等未列平台標成假 Instagram;voc 下游雖會自我校正,源頭誠實才對)。
 *
 * 用 hostname 結尾比對,避免 `netflix.com` 命中 `x.com`、`tiktok.com.evil.com`
 * 被當成 tiktok 這種子字串誤判。
 */
import { PLATFORM_CODE, type Platform, type PlatformInfo } from "../types.js";

interface Rule {
  platform: Platform;
  /** 命中其一即判定(比對 hostname 是否等於或結尾為此網域)。 */
  domains: string[];
}

/** 順序即優先序,先命中先贏。 */
const RULES: Rule[] = [
  { platform: "TikTok", domains: ["tiktok.com"] },
  { platform: "YouTube", domains: ["youtube.com", "youtu.be"] },
  { platform: "Facebook", domains: ["facebook.com", "fb.com", "fb.watch", "fb.me"] },
  { platform: "Instagram", domains: ["instagram.com"] },
  { platform: "Threads", domains: ["threads.net", "threads.com"] },
  { platform: "X", domains: ["x.com", "twitter.com"] },
  { platform: "抖音", domains: ["douyin.com"] },
  { platform: "小紅書", domains: ["xhslink.com", "xiaohongshu.com"] },
];

/**
 * 平台顯示名 → 圖示。改用顯式字面 + `satisfies`(不再 `as` cast):往 Platform union 加
 * 平台卻忘了在此補一列,TS 會編譯期報錯,不會像舊 cast 那樣執行期吐 undefined 傳染三個 bot。
 */
export const PLATFORM_ICON = {
  TikTok: "🎵",
  YouTube: "📺",
  Facebook: "📘",
  Instagram: "📸",
  Threads: "🧵",
  X: "🐦",
  抖音: "🎶",
  小紅書: "📕",
  Unknown: "❓",
} satisfies Record<Platform, string>;

/**
 * 下游統一小寫碼 → 圖示(SSoT 派生自 PLATFORM_CODE × PLATFORM_ICON)。
 * 三個 bot 原本各自用 PLATFORM_CODE+PLATFORM_ICON 手組同一份 code→icon 反查表、會漂移;
 * 由 core 匯出單一份,消費端改 import 即可(新平台只需在此二表補一次)。
 */
export const ICON_BY_CODE: Record<string, string> = Object.fromEntries(
  (Object.keys(PLATFORM_CODE) as Platform[]).map((p) => [PLATFORM_CODE[p], PLATFORM_ICON[p]]),
);

/** hostname 是否等於或為某網域的子網域(`www.youtube.com` ⊂ `youtube.com`)。 */
function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** 從乾淨連結取 hostname(小寫、去 www 無妨);解析失敗回 null。 */
function hostnameOf(cleanUrl: string): string | null {
  try {
    return new URL(cleanUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function detectPlatform(cleanUrl: string): PlatformInfo {
  const host = hostnameOf(cleanUrl);
  if (!host) {
    return { platform: "Unknown", method: "error" };
  }
  for (const rule of RULES) {
    if (rule.domains.some((d) => hostMatches(host, d))) {
      return { platform: rule.platform, method: "domain_match" };
    }
  }
  // fallback:認不得的網域標 Unknown(不誤猜 Instagram)。
  // 注意:fallback 時 assembleDraft 不會跑抽 id(method!=="domain_match"),故落 unsupported。
  return { platform: "Unknown", method: "fallback" };
}
