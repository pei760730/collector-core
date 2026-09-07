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
    expect(cleanUrl("https://m.facebook.com/reel/123").cleanUrl).toContain(
      "www.facebook.com",
    );
  });

  it("補 https 前綴", () => {
    expect(cleanUrl("tiktok.com/@u/video/1").cleanUrl).toMatch(/^https:\/\//);
  });

  it("非法網址不是短網址", () => {
    expect(cleanUrl("https://%").isShortUrl).toBe(false);
  });

  it("去尾斜線", () => {
    expect(cleanUrl("https://x.com/a/").cleanUrl).toBe("https://x.com/a");
    expect(cleanUrl("https://x.com/a///").cleanUrl).toBe("https://x.com/a");
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
    // Facebook 官方短鏈(fb.me):detectPlatform 列為 FB 域但先前漏收於 SHORT_URL_HOSTS →
    // 永不展開、永遠退路徑 key(2026-07-13 收進)。fb.watch 是正規影片域,不是短鏈。
    expect(cleanUrl("https://fb.me/AbCdEf").isShortUrl).toBe(true);
    expect(cleanUrl("https://fb.watch/xYz123").isShortUrl).toBe(false);
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

// ── TRACKING_PARAMS 快照 tripwire ─────────────────────────────────────────────
// CLEAN_URL 是 feed 總表 gate 的 key、groupKey fallback 也吃它:TRACKING_PARAMS
// 增刪一個參數 = 全艦隊(svb/clip/feed)同片可能清出不同 CLEAN_URL → gate 漏擋或
// 誤合併。契約向量(contracts/voc/dedup_vectors.json)目前不覆蓋追蹤參數,所以
// 這裡用行為快照釘死清單:改 cleanUrl.ts 的 Set 必須同步改這份清單——逼「有意識
// 的決定」,不是順手刪一行靜默過關。
describe("TRACKING_PARAMS 行為快照", () => {
  const SNAPSHOT = [
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
    "igsh",
    "igshid",
    "xmt",
    "slof",
    "xsec_token",
    "xsec_source",
    "tt_from",
    "s",
    "mibextid",
    "rdid",
    // 2026-09-08:TikTok「複製連結」實際會附上的參數。舊清單只有 tt_from / s,
    // 而那兩個都不是網頁版或 App 版複製連結真正帶的東西 —— 同一支影片因此清出三種
    // 不同的 CLEAN_URL,of 引擎的回流閘門(拿 CLEAN_URL 對總表做精確字串比對)整個穿透。
    "is_from_webapp",
    "sender_device",
    "web_id",
    "_r",
    "_t",
    "share_app_id",
    "share_link_id",
    "share_item_id",
    "u_code",
    "refer",
  ];

  it("快照裡每個參數都被剝除(少剝一個 = 有人從 Set 刪了東西)", () => {
    for (const p of SNAPSHOT) {
      const out = cleanUrl(`https://example.com/a?${p}=x&keep=1`).cleanUrl;
      expect(out, `param ${p} 應被剝除`).toBe("https://example.com/a?keep=1");
    }
  });

  it("非快照參數不被剝除(多剝 = 有人往 Set 加了東西沒更新快照)", () => {
    // 探測一批「像追蹤碼但不在清單」的名字,防止 Set 被悄悄擴張:
    // 擴張本身可能是對的,但必須同步更新本快照 + 想清楚 fleet dedup 影響。
    // ⚠️ 名字相近但**刻意分開**的三組,別順手合併:
    //   - `ref` 不砍 / `refer` 砍(只砍 TikTok 真的會附的那個確切名字)
    //   - `share_id` 不砍 / `share_app_id`+`share_link_id`+`share_item_id` 砍
    //   - `modal_id` 不砍:那是抖音的,可能攜帶影片身分,砍了會把不同影片誤合併
    for (const p of ["ref", "source", "from", "share_id", "si", "feature", "modal_id"]) {
      const out = cleanUrl(`https://example.com/a?${p}=x&keep=1`).cleanUrl;
      expect(out, `param ${p} 不在快照,不該被剝`).toBe(
        `https://example.com/a?${p}=x&keep=1`,
      );
    }
  });
});

// ── TikTok 分享參數:同一支影片必須清出同一個 CLEAN_URL ──────────────────────
// voc/tbvoc 不受影響(groupKey 用 video id),但 **of 引擎的回流閘門是拿 CLEAN_URL 對
// 總表做精確字串比對** —— 一支已經產製過的影片從不同裝置再分享一次,就會直接穿過閘門、
// 重新收進暫存區,正是 TRACKING_PARAMS 那行註解說這個 Set 存在就是要擋的「重複回流」。
describe("TikTok 複製連結:三種裝置同一個 CLEAN_URL", () => {
  const CANON = "https://www.tiktok.com/@user/video/7234567890123456789";

  it("網頁版 / App 版 / 分享面板的參數都清乾淨", () => {
    const variants = [
      CANON,
      `${CANON}?is_from_webapp=1&sender_device=pc&web_id=7300000000000000000`,
      `${CANON}?_r=1&_t=8qABCdEf`,
      `${CANON}?share_app_id=1233&share_link_id=abc&share_item_id=999&u_code=xyz&refer=web`,
      `${CANON}?tt_from=copy&s=h5`,
    ];
    for (const v of variants) {
      expect(cleanUrl(v).cleanUrl, `分享形態未收斂:${v}`).toBe(CANON);
    }
    expect(new Set(variants.map((v) => cleanUrl(v).cleanUrl)).size).toBe(1);
  });

  it("web_id(TikTok 的裝置指紋)不得被寫進 CLEAN_URL 欄", () => {
    const out = cleanUrl(`${CANON}?web_id=7300000000000000000`).cleanUrl;
    expect(out).not.toContain("web_id");
  });

  it("控制組:抖音的 modal_id 保留(可能攜帶影片身分,砍了會誤合併不同影片)", () => {
    const out = cleanUrl("https://www.douyin.com/discover?modal_id=7234567890123456789").cleanUrl;
    expect(out).toContain("modal_id=7234567890123456789");
  });
});

describe("Facebook 轉址空 u=(audit #5)", () => {
  it("u= 空字串 → 不當轉址,不產生 'https:' 垃圾", () => {
    const { cleanUrl: out } = cleanUrl("https://l.facebook.com/l.php?u=");
    expect(out).not.toBe("https:");
    expect(out).toContain("facebook.com");
  });
  it("u= 有值 → 照舊解開內層真網址", () => {
    const { cleanUrl: out } = cleanUrl(
      "https://l.facebook.com/l.php?u=" +
        encodeURIComponent("https://www.tiktok.com/@x/video/111"),
    );
    expect(out).toContain("tiktok.com");
  });
});
