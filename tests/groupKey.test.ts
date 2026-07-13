import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { detectPlatform } from "../src/pipeline/detectPlatform.js";
import { extractVideoId } from "../src/pipeline/extractVideoId.js";
import { groupKey } from "../src/pipeline/groupKey.js";

describe("groupKey 分群", () => {
  it("同支 YouTube 影片不同形態 + 追蹤碼收斂同 key", () => {
    const k = groupKey("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(groupKey("https://youtu.be/dQw4w9WgXcQ")).toBe(k);
    expect(groupKey("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(k);
    expect(groupKey("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s")).toBe(k);
  });

  it("跨平台同數字 id 不撞(命名空間;推翻『裸 id 撞群』誤判)", () => {
    const tt = groupKey("https://www.tiktok.com/@u/video/7234567890123456789");
    const dy = groupKey("https://www.douyin.com/video/7234567890123456789");
    expect(tt).not.toBe(dy);
  });

  it("IG /tv/(IGTV)抽得到 id(canonical 補 tv,對齊引擎)", () => {
    expect(groupKey("https://www.instagram.com/tv/CabcXYZ1234")).toBe("ig_cabcxyz1234");
  });

  it("XHS 小寫 hex id 整段抽(canonical hex)", () => {
    expect(groupKey("https://www.xiaohongshu.com/explore/663ed2b2000000001e0102a3")).toBe(
      "xhs_663ed2b2000000001e0102a3",
    );
  });

  it("XHS 大寫 hex id 不截斷、收斂成與小寫同群(i flag,2026-06-29 修)", () => {
    // 缺 i flag 時大寫會在第一個非 a-f 字母截斷成 xhs_663 → 不同筆記假合併。
    expect(groupKey("https://www.xiaohongshu.com/explore/663ED2B2000000001E0102A3")).toBe(
      "xhs_663ed2b2000000001e0102a3",
    );
    // 兩支前綴相同但實際不同的大寫 id 必須分群(回歸防護:不可塌成 xhs_663)。
    const a = groupKey("https://www.xiaohongshu.com/explore/663ED2B2000000001E0102A3");
    const b = groupKey("https://www.xiaohongshu.com/explore/663FFFFF000000001E0102A3");
    expect(a).not.toBe(b);
  });

  it("YT 非 11 碼(畸形)退路徑 key(11碼右邊界,對齊引擎)", () => {
    expect(groupKey("https://youtu.be/dQw4w9WgXcQX")).toBe("https://youtu.be/dqw4w9wgxcqx");
    expect(groupKey("https://youtu.be/abc123")).toBe("https://youtu.be/abc123");
  });

  it("認不出平台退路徑 key(砍 query、去尾斜線、lower)", () => {
    expect(groupKey("https://EXAMPLE.com/a/?utm=1")).toBe("https://example.com/a");
  });
});

describe("groupKey(url, pre?) 預計算 overload:與預設路徑分群等價", () => {
  /** 照 assembleDraft 的姿勢組 pre:同一條 url 先跑 detect,domain_match 才抽 id。 */
  function precompute(url: string): { platform: ReturnType<typeof detectPlatform>; videoId?: ReturnType<typeof extractVideoId> } {
    const platform = detectPlatform(url);
    return platform.method === "domain_match"
      ? { platform, videoId: extractVideoId(platform.platform, url) }
      : { platform };
  }

  it("id 路徑(domain_match + 抽到 id):pre 與預設同 key", () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    expect(groupKey(url, precompute(url))).toBe(groupKey(url));
  });

  it("只傳 platform 不傳 videoId:videoId 自算,同 key", () => {
    const url = "https://www.tiktok.com/@u/video/7234567890123456789";
    expect(groupKey(url, { platform: detectPlatform(url) })).toBe(groupKey(url));
  });

  it("unsupported(domain_match 但抽不到 id)退路徑 key,同 key", () => {
    const url = "https://www.facebook.com/some.profile.page";
    expect(groupKey(url, precompute(url))).toBe(groupKey(url));
  });

  it("fallback(認不出平台)退路徑 key,同 key", () => {
    const url = "https://EXAMPLE.com/a/?utm=1";
    expect(groupKey(url, precompute(url))).toBe(groupKey(url));
  });

  // 契約向量全掃(唯讀 vendored JSON):pre 路徑對每一條向量 URL 都必須與預設路徑同 key。
  // 這保證 overload 不可能讓契約向量變紅 —— 等價成立則 dedupConformance 的結論自動延伸。
  it("契約向量全數等價(pre 路徑 ≡ 預設路徑)", () => {
    const vectors: {
      same_group: { urls: string[] }[];
      distinct: { urls: string[] }[];
      edge_cases: { url: string }[];
    } = JSON.parse(
      readFileSync(new URL("../contracts/voc/dedup_vectors.json", import.meta.url), "utf8"),
    );
    const urls = [
      ...vectors.same_group.flatMap((g) => g.urls),
      ...vectors.distinct.flatMap((g) => g.urls),
      ...vectors.edge_cases.map((e) => e.url),
    ];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(groupKey(url, precompute(url))).toBe(groupKey(url));
    }
  });
});
