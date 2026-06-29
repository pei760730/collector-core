import { describe, expect, it } from "vitest";

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
