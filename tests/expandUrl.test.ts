import { afterEach, describe, expect, it, vi } from "vitest";

import { expandShortUrl } from "../src/utils/expandUrl.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

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

  it("HEAD 同 host 但已正規化路徑、GET 失敗 → 沿用 HEAD 結果而非原網址", async () => {
    mockFetch(async (_url, opts) => {
      if (opts.method === "HEAD") return { url: "https://v.douyin.com/canonical/" };
      throw new Error("network");
    });
    expect(await expandShortUrl("https://v.douyin.com/ABC/")).toBe(
      "https://v.douyin.com/canonical/",
    );
  });

  it("空的 response.url 退回請求網址", async () => {
    mockFetch(async () => ({ url: "" }));
    expect(await expandShortUrl("https://vm.tiktok.com/ZABC/")).toBe(
      "https://vm.tiktok.com/ZABC/",
    );
  });

  it("預設 timeout 為 5000ms，且請求完成後清除 timer", async () => {
    const setTimer = vi.spyOn(globalThis, "setTimeout");
    const clearTimer = vi.spyOn(globalThis, "clearTimeout");
    mockFetch(async () => ({ url: "https://www.tiktok.com/@u/video/123" }));
    await expandShortUrl("https://vm.tiktok.com/ZABC/");
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 5000);
    expect(clearTimer).toHaveBeenCalledTimes(1);
  });

  it("HEAD 丟錯 → 沿用原網址", async () => {
    mockFetch(async () => {
      throw new Error("network");
    });
    const url = "https://v.douyin.com/ABC/";
    expect(await expandShortUrl(url)).toBe(url);
  });

  it.each([
    {
      name: "URL path and query",
      url: "https://vm.tiktok.com/private-path/?share=private-query",
      host: "vm.tiktok.com",
    },
    {
      name: "credentials, port, and fragment",
      url: "https://private-user:private-password@vm.tiktok.com:8443/private-path/#private-fragment",
      host: "vm.tiktok.com",
    },
    {
      name: "invalid URL",
      url: "invalid-private-input",
      host: "unknown-host",
    },
  ])("HEAD failure logs only the host: $name", async ({ url, host }) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("LOG_LEVEL", "warn");
    mockFetch(async () => {
      throw Object.assign(new Error(`request failed: ${url}`), {
        cause: { input: url, detail: "private-cause" },
      });
    });

    expect(await expandShortUrl(url)).toBe(url);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(
        new RegExp(`^\\[.*\\] WARN 短網址展開失敗\\(host=${host.replaceAll(".", "\\.")}\\),沿用原網址$`),
      ),
    );
  });
});
