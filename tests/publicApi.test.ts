import { describe, expect, it } from "vitest";

import * as core from "../src/index.js";

describe("public API 與平台顯示契約", () => {
  it("index 匯出跨 collector 使用的去重 API 與平台碼", () => {
    expect(core.groupKey).toBeTypeOf("function");
    expect(core.PLATFORM_CODE).toBeDefined();
  });

  it("平台顯示名、小寫碼與圖示維持完整映射", () => {
    expect(core.PLATFORM_CODE).toEqual({
      TikTok: "tiktok",
      YouTube: "youtube",
      Facebook: "facebook",
      Instagram: "instagram",
      Threads: "threads",
      X: "x",
      抖音: "douyin",
      小紅書: "xiaohongshu",
      Unknown: "unknown",
    });
    expect(core.PLATFORM_ICON.YouTube).toBe("📺");
    expect(core.iconFor("youtube")).toBe("📺");
    expect(core.iconFor("not-a-platform")).toBe("•");
  });
});
