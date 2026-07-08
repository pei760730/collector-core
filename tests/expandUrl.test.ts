import { afterEach, describe, expect, it, vi } from "vitest";

import { expandShortUrl } from "../src/utils/expandUrl.js";

afterEach(() => vi.unstubAllGlobals());

function mockFetch(impl: (url: string, opts: { method: string }) => Promise<{ url?: string }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, opts: { method: string }) => impl(url, opts)),
  );
}

describe("expandShortUrl", () => {
  it("HEAD 跨 host 展開 → 直接回展開後網址,不跑 GET", async () => {
    const methods: string[] = [];
    mockFetch(async (_url, opts) => {
      methods.push(opts.method);
      return { url: "https://www.tiktok.com/@u/video/123" };
    });
    const out = await expandShortUrl("https://vm.tiktok.com/ZABC/");
    expect(out).toBe("https://www.tiktok.com/@u/video/123");
    expect(methods).toEqual(["HEAD"]);
  });

  it("HEAD 沒展開（host 沒變,如 405）→ 退回 GET 再試一次", async () => {
    const methods: string[] = [];
    mockFetch(async (_url, opts) => {
      methods.push(opts.method);
      if (opts.method === "HEAD") return { url: "https://v.douyin.com/ABC/" }; // 沒展開
      return { url: "https://www.douyin.com/video/456" }; // GET 展開
    });
    const out = await expandShortUrl("https://v.douyin.com/ABC/");
    expect(methods).toEqual(["HEAD", "GET"]);
    expect(out).toBe("https://www.douyin.com/video/456");
  });

  it("HEAD 沒展開、GET 也丟錯 → 沿用 HEAD 結果", async () => {
    mockFetch(async (_url, opts) => {
      if (opts.method === "HEAD") return { url: "https://v.douyin.com/ABC/" };
      throw new Error("network");
    });
    const out = await expandShortUrl("https://v.douyin.com/ABC/");
    expect(out).toBe("https://v.douyin.com/ABC/");
  });

  it("HEAD 丟錯 → 沿用原網址", async () => {
    mockFetch(async () => {
      throw new Error("network");
    });
    const url = "https://v.douyin.com/ABC/";
    expect(await expandShortUrl(url)).toBe(url);
  });
});
