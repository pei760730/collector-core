import { describe, it, expect } from "vitest";
import { extractVideoId } from "../src/pipeline/extractVideoId.js";

describe("extractVideoId", () => {
  it("TikTok video/<id>", () => {
    expect(extractVideoId("TikTok", "https://www.tiktok.com/@u/video/7234567890").videoId).toBe(
      "tiktok_7234567890",
    );
  });

  it("TikTok item_id=(query)2026-06-27 不再抽 → unsupported(query 注入面,四語對齊只認 path /video/)", () => {
    const r = extractVideoId("TikTok", "https://www.tiktok.com/x?item_id=12345");
    expect(r.unsupported).toBe(true);
    expect(r.videoId).toBe("");
  });

  it("TikTok 19 位純數字短路徑 2026-06-27 不再抽 → unsupported(靠展開成 /video/;真實短碼非純數字)", () => {
    const r = extractVideoId("TikTok", "https://vt.tiktok.com/1234567890123456789");
    expect(r.unsupported).toBe(true);
    expect(r.videoId).toBe("");
  });

  it("Instagram /reel/<code>(取 code 那組,非 reel)", () => {
    expect(extractVideoId("Instagram", "https://www.instagram.com/reel/CxYz_-1").videoId).toBe(
      "ig_CxYz_-1",
    );
  });

  it("Instagram /p/<code> 取 code", () => {
    const v = extractVideoId("Instagram", "https://www.instagram.com/p/AbC123_-x").videoId;
    expect(v).toBe("ig_AbC123_-x");
  });

  it("YouTube watch?v=", () => {
    expect(
      extractVideoId("YouTube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ").videoId,
    ).toBe("yt_dQw4w9WgXcQ");
  });

  it("YouTube youtu.be 短鏈", () => {
    expect(extractVideoId("YouTube", "https://youtu.be/dQw4w9WgXcQ").videoId).toBe(
      "yt_dQw4w9WgXcQ",
    );
  });

  it("YouTube shorts", () => {
    expect(
      extractVideoId("YouTube", "https://www.youtube.com/shorts/dQw4w9WgXcQ").videoId,
    ).toBe("yt_dQw4w9WgXcQ");
  });

  it("YouTube 11 碼後接 query 參數仍可抽", () => {
    expect(extractVideoId("YouTube", "https://youtu.be/dQw4w9WgXcQ?si=abc").videoId).toBe(
      "yt_dQw4w9WgXcQ",
    );
  });

  it("YouTube 非 11 碼(12 碼)→ 不截斷,落 unknown_(unsupported)", () => {
    const r = extractVideoId("YouTube", "https://www.youtube.com/watch?v=AAAAAAAAAAAA");
    expect(r.unsupported).toBe(true);
    expect(r.videoId).toBe("");
  });

  it("YouTube shorts 13 碼 → 不截斷,落 unsupported", () => {
    expect(
      extractVideoId("YouTube", "https://www.youtube.com/shorts/ABCDEFGHIJKLM").unsupported,
    ).toBe(true);
  });

  it("小紅書 /explore/<id>", () => {
    expect(
      extractVideoId("小紅書", "https://www.xiaohongshu.com/explore/abc123").videoId,
    ).toBe("xhs_abc123");
  });

  it("小紅書 /discovery/item/<id>", () => {
    expect(
      extractVideoId("小紅書", "https://www.xiaohongshu.com/discovery/item/def456").videoId,
    ).toBe("xhs_def456");
  });

  it("小紅書 大寫 hex id 整段抽不截斷(i flag,2026-06-29 修)", () => {
    // 缺 i flag 時 663ED2B2… 會在 E 截斷成 xhs_663;有 i 則整段抽(大小寫由 groupKey 收斂)。
    expect(
      extractVideoId("小紅書", "https://www.xiaohongshu.com/explore/663ED2B2000000001E0102A3")
        .videoId,
    ).toBe("xhs_663ED2B2000000001E0102A3");
  });

  it("Facebook fb.watch/<code> → fbw_", () => {
    const r = extractVideoId("Facebook", "https://fb.watch/xyz");
    expect(r.unsupported).toBe(false);
    expect(r.videoId).toBe("fbw_xyz");
  });

  it("Facebook /reel|/reels|/videos/<n> → fb_", () => {
    expect(
      extractVideoId("Facebook", "https://www.facebook.com/reel/1234567890").videoId,
    ).toBe("fb_1234567890");
    expect(
      extractVideoId("Facebook", "https://www.facebook.com/u/videos/987654321").videoId,
    ).toBe("fb_987654321");
  });

  it("Facebook /share/[rvp]/<code> → fbs_", () => {
    expect(
      extractVideoId("Facebook", "https://www.facebook.com/share/r/AbC-1_x").videoId,
    ).toBe("fbs_AbC-1_x");
    expect(
      extractVideoId("Facebook", "https://www.facebook.com/share/v/9z8Y").videoId,
    ).toBe("fbs_9z8Y");
  });

  it("Facebook watch?v= / story_fbid → fb_", () => {
    expect(
      extractVideoId("Facebook", "https://www.facebook.com/watch?v=1122334455").videoId,
    ).toBe("fb_1122334455");
    expect(
      extractVideoId("Facebook", "https://www.facebook.com/story.php?story_fbid=55667788").videoId,
    ).toBe("fb_55667788");
  });

  it("Facebook 同時有 story_fbid 與 v 時以 story_fbid 為準", () => {
    // 2026-09-08:原 fixture 用 story_fbid=story123 / v=video456,兩者都不是真實形態的 FB id。
    // query id 改成驗值之後那組值會整組落 unsupported —— 換成真實形態,這條測試釘的
    // 「優先序」本意不變(值的合法性由下面「必須驗值」那組守)。
    expect(
      extractVideoId(
        "Facebook",
        "https://www.facebook.com/story.php?story_fbid=122100493388920531&v=1122334455",
      ).videoId,
    ).toBe("fb_122100493388920531");
  });

  it("Facebook 純個人頁(四形態皆不中)→ unknown + unsupported", () => {
    const r = extractVideoId("Facebook", "https://www.facebook.com/someuser");
    expect(r.unsupported).toBe(true);
    expect(r.videoId).toBe("");
  });

  it("抓不到 → 空 videoId + unsupported", () => {
    const r = extractVideoId("TikTok", "https://www.tiktok.com/discover");
    expect(r.unsupported).toBe(true);
    expect(r.videoId).toBe("");
  });

  it("X(Twitter)/status/<id> → x_", () => {
    expect(
      extractVideoId("X", "https://x.com/someone/status/1234567890123456789").videoId,
    ).toBe("x_1234567890123456789");
    expect(
      extractVideoId("X", "https://twitter.com/i/web/status/55667788").videoId,
    ).toBe("x_55667788");
  });

  it("X 個人頁(無 status)→ 空 videoId + unsupported", () => {
    const r = extractVideoId("X", "https://x.com/someone");
    expect(r.unsupported).toBe(true);
    expect(r.videoId).toBe("");
  });

  it("抖音 /video/<id> → douyin_", () => {
    expect(
      extractVideoId("抖音", "https://www.douyin.com/video/7234567890123456789").videoId,
    ).toBe("douyin_7234567890123456789");
  });

  it("抖音 19 位純數字短路徑 2026-06-27 不再抽 → unsupported(同 TikTok,只認 path /video/)", () => {
    const r = extractVideoId("抖音", "https://www.douyin.com/share/1234567890123456789");
    expect(r.unsupported).toBe(true);
    expect(r.videoId).toBe("");
  });

  it("抖音 個人頁(無影片)→ 空 videoId + unsupported", () => {
    const r = extractVideoId("抖音", "https://www.douyin.com/user/MS4wLjAxlong");
    expect(r.unsupported).toBe(true);
    expect(r.videoId).toBe("");
  });

  it("Threads /post/<id>", () => {
    const r = extractVideoId("Threads", "https://www.threads.com/@u/post/DZwtc9Jk7Yf");
    expect(r.videoId).toBe("threads_DZwtc9Jk7Yf");
    expect(r.unsupported).toBe(false);
  });

  it("YouTube channel/@user 不該被當成影片", () => {
    expect(extractVideoId("YouTube", "https://www.youtube.com/channel/UCabcdefghij").unsupported).toBe(true);
    expect(extractVideoId("YouTube", "https://www.youtube.com/@someuser11").unsupported).toBe(true);
  });

  it("TikTok ?sec_uid=<19位> 不該被偽造成影片 id", () => {
    const r = extractVideoId("TikTok", "https://www.tiktok.com/@u?sec_uid=1234567890123456789");
    expect(r.unsupported).toBe(true);
    expect(r.videoId).toBe("");
  });

  it("TikTok 20 位數字不該截前 19 位當 id", () => {
    const r = extractVideoId("TikTok", "https://www.tiktok.com/x/12345678901234567890");
    expect(r.unsupported).toBe(true);
  });

  it("TikTok discover 搜尋頁(帶 ?)不是影片 → unsupported", () => {
    const r = extractVideoId("TikTok", "https://www.tiktok.com/discover/funny?lang=en");
    expect(r.unsupported).toBe(true);
    expect(r.videoId).toBe("");
  });
});

// ── Facebook query id 的「值」驗證 ─────────────────────────────────────────────
// 只驗參數「名」不驗「值」的話,粉專分頁網址(?v=timeline / info / wall / app_<n>)會產出
// 一個自信的、非 unsupported 的 `fb_<分頁名>` id。groupKey 拿它當去重鍵 → 每一個不同粉專
// 只要帶同一個分頁關鍵字就塌成同一把鍵,第一筆之後全部被永久判定重複、靜默丟棄。
// YouTube 分支一直有做值驗證(youtubeQueryId gates on YOUTUBE_V_ID),FB 分支只是漏了。
describe("Facebook query id 必須驗值,不是只驗參數名", () => {
  // 舊版粉專 / 社團的分頁網址關鍵字(?v=<tab>),不是影片 id。
  const PAGE_TABS = ["timeline", "info", "wall", "photos", "app_2405167945", "page_internal"];

  it("?v=<粉專分頁關鍵字> 不得產出 id(退 unsupported → 走連結路徑 key)", () => {
    for (const tab of PAGE_TABS) {
      const r = extractVideoId("Facebook", `https://www.facebook.com/PageAlpha/?v=${tab}`);
      expect(r.unsupported, `?v=${tab} 不該被當成影片 id`).toBe(true);
      expect(r.videoId).toBe("");
    }
  });

  it("控制組:?v=<純數字> 仍照抽(別把合法的 watch?v= 一起擋掉)", () => {
    expect(extractVideoId("Facebook", "https://www.facebook.com/watch?v=1122334455").videoId).toBe(
      "fb_1122334455",
    );
  });

  it("story_fbid 只認純數字或 pfbid…", () => {
    expect(
      extractVideoId(
        "Facebook",
        "https://www.facebook.com/story.php?story_fbid=122100493388920531&id=61558439087436",
      ).videoId,
    ).toBe("fb_122100493388920531");
    expect(
      extractVideoId(
        "Facebook",
        "https://www.facebook.com/story.php?story_fbid=pfbid0abcXYZ789&id=61558439087436",
      ).videoId,
    ).toBe("fb_pfbid0abcXYZ789");
    expect(
      extractVideoId(
        "Facebook",
        "https://www.facebook.com/story.php?story_fbid=timeline&id=61558439087436",
      ).unsupported,
    ).toBe(true);
  });

  it("story_fbid 不合法但 v 合法 → 退用 v(不是整組放棄)", () => {
    expect(
      extractVideoId(
        "Facebook",
        "https://www.facebook.com/story.php?story_fbid=timeline&v=1122334455",
      ).videoId,
    ).toBe("fb_1122334455");
  });
});
