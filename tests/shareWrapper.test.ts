/**
 * 分享包裝轉址(share wrapper)→ 去重鍵的端到端行為。
 *
 * 包裝網址的身分 **100% 住在 `?u=` 裡**。沒拆開的話 groupKey 退路徑 fallback,而 fallback
 * 會砍掉 query —— 於是同一個 wrapper host 的每一則分享都算出同一把 key(如
 * `https://l.instagram.com`),第一筆收進去之後,後來每一支不同影片都被判定為重複、
 * 靜默丟棄(參考池是全表比對、無時間窗)。平台也會被誤標:`l.instagram.com` 命中
 * `.instagram.com` 網域規則 → 即使包的是 TikTok 影片也標成 Instagram。
 *
 * 本檔對「所有 wrapper host」參數化跑同一組斷言,讓下一個 wrapper 不能再靜默漏掉。
 */
import { describe, expect, it } from "vitest";

import { cleanUrl, REDIRECT_WRAPPER_HOSTS } from "../src/pipeline/cleanUrl.js";
import { detectPlatform } from "../src/pipeline/detectPlatform.js";
import { groupKey } from "../src/pipeline/groupKey.js";

// 手抄鏡像 cleanUrl.ts 的 REDIRECT_WRAPPER_HOSTS(用意同 TRACKING_PARAMS 行為快照:
// 增刪 host 必須同步改這份清單,讓擴張/縮減是 PR diff 上看得見的決定,不是順手一行)。
const WRAPPER_HOSTS = [
  "l.facebook.com",
  "lm.facebook.com",
  "l.instagram.com",
  "lm.instagram.com",
  "l.messenger.com",
];

const TT = "https://www.tiktok.com/@u/video/7111111111111111111";
const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const wrap = (host: string, inner: string, path = "/l.php") =>
  `https://${host}${path}?u=${encodeURIComponent(inner)}`;

describe("分享包裝轉址:清單快照", () => {
  it("手抄鏡像 == cleanUrl.ts 的 REDIRECT_WRAPPER_HOSTS(增刪必須同步改本檔)", () => {
    // 只靠「對清單裡每個 host 跑行為」擋不住縮減 —— 從 Set 刪一個 host,迴圈也跟著少跑一圈、
    // 全綠。這條等值斷言把兩邊釘在一起:加或減都會紅,逼人正視 fleet 級去重影響。
    expect([...REDIRECT_WRAPPER_HOSTS].sort()).toEqual([...WRAPPER_HOSTS].sort());
  });
});

describe("分享包裝轉址:每個 wrapper host 都要拆開 ?u=", () => {
  for (const host of WRAPPER_HOSTS) {
    it(`${host} —— /l.php 與根路徑兩種形態都拆`, () => {
      expect(cleanUrl(wrap(host, TT)).cleanUrl).toBe(TT);
      expect(cleanUrl(wrap(host, TT, "/")).cleanUrl).toBe(TT);
    });

    it(`${host} —— 包不同影片必須是不同去重鍵(不得塌成同一把)`, () => {
      const a = groupKey(cleanUrl(wrap(host, TT)).cleanUrl);
      const b = groupKey(cleanUrl(wrap(host, YT)).cleanUrl);
      expect(a).toBe("tiktok_7111111111111111111");
      expect(b).toBe("yt_dqw4w9wgxcq");
    });

    it(`${host} —— 平台以內層判定(不是被 wrapper host 的網域帶著走)`, () => {
      const platform = detectPlatform(cleanUrl(wrap(host, TT)).cleanUrl).platform;
      expect(platform).toBe("TikTok");
    });
  }
});

describe("分享包裝轉址:facebook.com 系的 /l.php 規則", () => {
  it("m.facebook.com/l.php 也是包裝(不論行動版改寫的先後)", () => {
    // 舊實作只認 host 白名單,而白名單比對跑在 MOBILE_TO_DESKTOP 之前 → m.facebook.com
    // 永遠對不上,之後被改寫成 www.facebook.com,最後落成一個沒有 id 的 FB 連結。
    // 路徑規則(/l.php on *.facebook.com)同時解掉「漏 host」與「順序依賴」兩件事。
    expect(cleanUrl(wrap("m.facebook.com", TT)).cleanUrl).toBe(TT);
  });

  it("www.facebook.com/l.php 與裸 facebook.com/l.php 也是包裝", () => {
    expect(cleanUrl(wrap("www.facebook.com", TT)).cleanUrl).toBe(TT);
    expect(cleanUrl(wrap("facebook.com", TT)).cleanUrl).toBe(TT);
  });

  it("巢狀包裝(FB 包 IG 包 TikTok)逐層拆到底", () => {
    const lvl1 = wrap("l.instagram.com", TT, "/");
    expect(cleanUrl(wrap("l.facebook.com", lvl1)).cleanUrl).toBe(TT);
  });
});

describe("分享包裝轉址:負向(不該亂拆)", () => {
  it("wrapper host 但沒有 u= → 不拆,當一般連結處理", () => {
    expect(cleanUrl("https://l.instagram.com/foo").cleanUrl).toContain("l.instagram.com");
    expect(cleanUrl("https://l.facebook.com/somewhere").cleanUrl).toContain("l.facebook.com");
  });

  it("u= 存在但空 → 不拆(否則遞迴進 cleanUrl('') 產生 https: 垃圾列)", () => {
    expect(cleanUrl("https://l.instagram.com/?u=").cleanUrl).toContain("l.instagram.com");
    expect(cleanUrl("https://l.instagram.com/?u=%20%20").cleanUrl).toContain("l.instagram.com");
  });

  it("facebook.com 的非 /l.php 路徑不因為帶了 u= 就被拆", () => {
    const out = cleanUrl(`https://www.facebook.com/watch?v=1122334455&u=${encodeURIComponent(TT)}`).cleanUrl;
    expect(out).toContain("facebook.com/watch");
    expect(groupKey(out)).toBe("fb_1122334455");
  });

  it("非 wrapper 的 instagram host 不受影響", () => {
    expect(cleanUrl("https://www.instagram.com/reel/CxYz_-1").cleanUrl).toBe(
      "https://www.instagram.com/reel/CxYz_-1",
    );
  });
});
