/**
 * 短網址展開(opt-in,EXPAND_SHORT_URLS=true 才用)。
 * 先用 HEAD 跟隨 redirect 取真實網址;失敗就原樣退回,不擋流程。
 * vm.tiktok.com / v.douyin.com / xhslink.com 這類分享短鏈的轉址伺服器常對 HEAD 回
 * 405 或不發 302(只認 GET)→ HEAD 的 res.url 退回短鏈本身、host 沒變 → 退回 GET 再試一次
 * (GET 較貴,只在 HEAD 沒跨 host 展開時才跑),避免短鏈與長鏈算出不同 key 而漏去重。
 */
import { logger } from "./logger.js";

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return a === b;
  }
}

async function follow(url: string, method: "HEAD" | "GET", timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, redirect: "follow", signal: controller.signal });
    const finalUrl = res.url || url;
    // GET fallback 會把整個目標頁下載進 body;不消費/取消就會佔著 socket 直到 GC。
    // 讀完 res.url 就取消 body 串流。用 optional chaining:HEAD 無 body、測試 stub 亦無 body。
    res.body?.cancel().catch(() => {});
    return finalUrl;
  } finally {
    clearTimeout(timer);
  }
}

export async function expandShortUrl(url: string, timeoutMs = 5000): Promise<string> {
  try {
    const headUrl = await follow(url, "HEAD", timeoutMs);
    if (!sameHost(headUrl, url)) return headUrl; // HEAD 已跨 host 展開,完成。
    // HEAD 沒展開(405 / 不發 302)→ 退回 GET 再試;GET 也失敗就沿用 HEAD 結果。
    try {
      return await follow(url, "GET", timeoutMs);
    } catch {
      return headUrl;
    }
  } catch (err) {
    logger.warn(`短網址展開失敗,沿用原網址:${url}`, err);
    return url;
  }
}
