import { describe, it, expect } from "vitest";
import { cleanUrl } from "../src/pipeline/cleanUrl.js";

describe("cleanUrl", () => {
  it("移除追蹤參數但保留真參數", () => {
    const { cleanUrl: out } = cleanUrl(
      "https://www.youtube.com/watch?v=abc&utm_source=ig&fbclid=xyz",
    );
    expect(out).toContain("v=abc");
    expect(out).not.toContain("utm_source");
    expect(out).not.toContain("fbclid");
  });

  it("2026-07-06 對齊 feed 補的四個分享追蹤碼(tt_from/s/mibextid/rdid)", () => {
    // TikTok 分享後綴 + X ?s=20 + FB mibextid/rdid:不砍會讓同片不同分享碼
    // 清出不同 CLEAN_URL → feed 總表 gate 漏擋(重複回流)。
    const tiktok = cleanUrl("https://www.tiktok.com/@u/video/123?tt_from=copy&s=v2").cleanUrl;
    expect(tiktok).not.toContain("tt_from");
    expect(tiktok).not.toContain("s=");
    const x = cleanUrl("https://x.com/a/status/99?s=20").cleanUrl;
    expect(x).not.toContain("s=20");
    const fb = cleanUrl("https://www.facebook.com/reel/42?mibextid=abc&rdid=def").cleanUrl;
    expect(fb).not.toContain("mibextid");
    expect(fb).not.toContain("rdid");
    // 真參數不受波及(YouTube ?v= 白名單語意)
    expect(cleanUrl("https://www.youtube.com/watch?v=abcdefghijk&s=x").cleanUrl).toContain("v=abcdefghijk");
  });

  it("行動版轉桌面版", () => {
    expect(cleanUrl("https://m.tiktok.com/v/123").cleanUrl).toContain("www.tiktok.com");
    expect(cleanUrl("https://mobile.twitter.com/a/status/1").cleanUrl).toContain(
      "twitter.com",
    );
    expect(cleanUrl("https://m.youtube.com/watch?v=abcdefghijk").cleanUrl).toContain(
      "www.youtube.com",
    );
  });

  it("補 https 前綴", () => {
    expect(cleanUrl("tiktok.com/@u/video/1").cleanUrl).toMatch(/^https:\/\//);
  });

  it("去尾斜線", () => {
    expect(cleanUrl("https://x.com/a/").cleanUrl).toBe("https://x.com/a");
  });

  it("偵測短網址", () => {
    expect(cleanUrl("https://bit.ly/abc").isShortUrl).toBe(true);
    expect(cleanUrl("https://t.co/abc").isShortUrl).toBe(true);
    expect(cleanUrl("https://www.tiktok.com/x").isShortUrl).toBe(false);
    // TikTok 短連結要被認出來,EXPAND_SHORT_URLS 才會展開 → 短/長連結去重一致。
    expect(cleanUrl("https://vm.tiktok.com/ZGJabc/").isShortUrl).toBe(true);
    expect(cleanUrl("https://vt.tiktok.com/ZSabc/").isShortUrl).toBe(true);
    // 抖音 App 分享短連結同理。
    expect(cleanUrl("https://v.douyin.com/iAbCdEf/").isShortUrl).toBe(true);
    // 2026-06-27 補:小紅書分享短鏈 + 台/中常見分享短鏈(實測會 302 到目標)。
    expect(cleanUrl("https://xhslink.com/a/AbC123").isShortUrl).toBe(true);
    expect(cleanUrl("https://reurl.cc/AbC123").isShortUrl).toBe(true);
    expect(cleanUrl("https://pse.is/ABCDEF").isShortUrl).toBe(true);
    expect(cleanUrl("https://lihi3.cc/AbCdE").isShortUrl).toBe(true);
    expect(cleanUrl("https://lihi.io/AbCdE").isShortUrl).toBe(true);
    expect(cleanUrl("https://pros.is/ABCDEF").isShortUrl).toBe(true);
    expect(cleanUrl("https://myppt.cc/AbCdE").isShortUrl).toBe(true);
    expect(cleanUrl("https://s.id/abcde").isShortUrl).toBe(true);
    // 刻意不收的非影片分享短鏈 → false。
    expect(cleanUrl("https://forms.gle/AbCdEf").isShortUrl).toBe(false);
    expect(cleanUrl("https://a.co/d/abcDEf").isShortUrl).toBe(false);
  });

  it("只移除追蹤參數後不留空 ?", () => {
    const { cleanUrl: out } = cleanUrl("https://x.com/a?utm_source=ig");
    expect(out).toBe("https://x.com/a");
  });

  it("path→query 邊界的 /? 收斂,但 query 值內的字面 /? 不被變造", () => {
    // 之前 /\/(\?)/g global 會把 ?next=/a/?b 變造成 ?next=/a?b(污染參數值)。
    expect(cleanUrl("https://x.com/login/?next=/a/?b").cleanUrl).toBe(
      "https://x.com/login?next=/a/?b",
    );
    // query 值內含 /? 但邊界本來就乾淨 → 完全不動。
    expect(cleanUrl("https://x.com/login?next=/a/?b").cleanUrl).toBe(
      "https://x.com/login?next=/a/?b",
    );
    // 一般 path→query 邊界照舊收斂(與既有行為一致)。
    expect(cleanUrl("https://x.com/a/?v=1").cleanUrl).toBe("https://x.com/a?v=1");
    // 非法 URL(host 解析失敗)走 fallback 字串清理,也只收斂第一個邊界、不動 query 值。
    expect(cleanUrl("https://%/a/?next=/x/?y").cleanUrl).toBe("https://%/a?next=/x/?y");
  });

  it("清掉 Meta/Threads 分享追蹤碼(xmt/slof/igsh)", () => {
    const out = cleanUrl(
      "https://www.threads.com/@u/post/DZwtc9Jk7Yf?xmt=AQG0abc&slof=1",
    ).cleanUrl;
    expect(out).toBe("https://www.threads.com/@u/post/DZwtc9Jk7Yf");
    expect(cleanUrl("https://www.instagram.com/reel/ABC?igsh=xx").cleanUrl).toBe(
      "https://www.instagram.com/reel/ABC",
    );
  });

  it("清掉小紅書分享指紋(xsec_token/xsec_source)", () => {
    const out = cleanUrl(
      "https://www.xiaohongshu.com/explore/abc?xsec_token=XYZ&xsec_source=pc_feed",
    ).cleanUrl;
    expect(out).toBe("https://www.xiaohongshu.com/explore/abc");
  });

  it("去掉 fragment(#…)但保留合法 query", () => {
    // #Echobox= 這類追蹤片段殘留會讓同片清出不同 CLEAN_URL → feed gate 漏擋。
    expect(
      cleanUrl("https://www.instagram.com/reel/ABC123?igsh=x#Echobox=99").cleanUrl,
    ).toBe("https://www.instagram.com/reel/ABC123");
    // ?v=X 是保留參數:去 #frag 但留 ?v=X。
    expect(
      cleanUrl("https://www.youtube.com/watch?v=abcdefghijk#frag").cleanUrl,
    ).toBe("https://www.youtube.com/watch?v=abcdefghijk");
  });

  describe("Facebook 轉址解開(l.facebook.com/l.php?u=…)", () => {
    it("還原內層 IG reel(外層 fbclid 也清掉)", () => {
      const inner = "https://www.instagram.com/reel/CxYz_-1";
      const wrapped = `https://l.facebook.com/l.php?u=${encodeURIComponent(inner)}&fbclid=abc`;
      expect(cleanUrl(wrapped).cleanUrl).toBe(inner);
    });

    it("還原內層後續走完整清理(內層自己的追蹤參數也清)", () => {
      const inner = "https://www.instagram.com/reel/CxYz_-1?igsh=zzz";
      const wrapped = `https://l.facebook.com/l.php?u=${encodeURIComponent(inner)}`;
      expect(cleanUrl(wrapped).cleanUrl).toBe("https://www.instagram.com/reel/CxYz_-1");
    });

    it("內層是 TikTok 短連結 → isShortUrl 以內層判定(true)", () => {
      const inner = "https://vm.tiktok.com/ZGJabc/";
      const wrapped = `https://lm.facebook.com/l.php?u=${encodeURIComponent(inner)}`;
      const r = cleanUrl(wrapped);
      expect(r.cleanUrl).toContain("vm.tiktok.com");
      expect(r.isShortUrl).toBe(true);
    });

    it("l.facebook 但沒有 u 參數 → 不解開(當一般 facebook 連結)", () => {
      const out = cleanUrl("https://l.facebook.com/somewhere").cleanUrl;
      expect(out).toContain("l.facebook.com");
    });
  });
});
