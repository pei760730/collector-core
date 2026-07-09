import { describe, it, expect } from "vitest";
import { parseMessage, NoUrlError } from "../src/pipeline/parse.js";

describe("parseMessage", () => {
  it("抽出網址與備註", () => {
    const r = parseMessage({
      text: "https://www.tiktok.com/@u/video/123 健身梗很好笑",
    });
    expect(r.rawUrl).toBe("https://www.tiktok.com/@u/video/123");
    expect(r.note).toBe("健身梗很好笑");
  });

  it("備註在前、網址在後也能抽", () => {
    const r = parseMessage({ text: "好笑 https://youtu.be/abc" });
    expect(r.rawUrl).toBe("https://youtu.be/abc");
    expect(r.note).toBe("好笑");
  });

  it("沒網址丟 NoUrlError", () => {
    expect(() => parseMessage({ text: "今天天氣真好" })).toThrow(NoUrlError);
  });

  it("連結後黏中文(沒空格)→ 不吃進 URL", () => {
    const r = parseMessage({ text: "https://youtu.be/dQw4w9WgXcQ。很好笑" });
    expect(r.rawUrl).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(r.note).toContain("很好笑");
  });

  it("剝掉尾端標點", () => {
    expect(parseMessage({ text: "看 https://x.com/a/status/1)" }).rawUrl).toBe(
      "https://x.com/a/status/1",
    );
    expect(parseMessage({ text: "https://x.com/a/status/1, lol" }).rawUrl).toBe(
      "https://x.com/a/status/1",
    );
  });

  it("https:// 後面全是標點 → 視為沒網址", () => {
    expect(() => parseMessage({ text: "https://。。。" })).toThrow(NoUrlError);
  });

  it("連結直接黏 CJK 備註 → 備註不留開頭分隔標點", () => {
    const r = parseMessage({ text: "https://youtu.be/dQw4w9WgXcQ。健身梗" });
    expect(r.rawUrl).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(r.note).toBe("健身梗"); // 不再是「。健身梗」
  });

  it("連結被括號包住 → 備註不留殘餘括號", () => {
    const r = parseMessage({ text: "(https://youtu.be/dQw4w9WgXcQ)" });
    expect(r.rawUrl).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(r.note).toBe("");
  });

  it("備註結尾語氣標點要保留", () => {
    const r = parseMessage({ text: "https://youtu.be/dQw4w9WgXcQ 太好笑了!" });
    expect(r.note).toBe("太好笑了!");
  });

  it("備註裡含與 URL 相同片段不被誤切", () => {
    const r = parseMessage({ text: "看 https://x.com/a 這個 x.com 帳號" });
    expect(r.rawUrl).toBe("https://x.com/a");
    expect(r.note).toBe("看 這個 x.com 帳號");
  });

  it("畸形 URL(new URL 解不了)→ NoUrlError,不放行髒值給下游", () => {
    // regex `^https?://\S` 會誤放行,嚴格 `new URL()` 驗證擋掉。
    expect(() => parseMessage({ text: "https://[" })).toThrow(NoUrlError);
  });

  it("首 URL 畸形 + 次 URL 合法 → 收錄次 URL(不整則誤判 NoUrlError)", () => {
    const r = parseMessage({ text: "https://[ https://youtu.be/dQw4w9WgXcQ 好片" });
    expect(r.rawUrl).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(r.note).toContain("好片");
  });

  it("所有候選 URL 都畸形 → 仍 NoUrlError", () => {
    expect(() => parseMessage({ text: "https://[ 然後 https://。。。" })).toThrow(NoUrlError);
  });

  it("正常訊息 truncated=false", () => {
    const r = parseMessage({ text: "https://youtu.be/abc 好片" });
    expect(r.truncated).toBe(false);
  });

  it("超長 URL → 截斷並標記 truncated(fanout-safety)", () => {
    const longUrl = `https://x.com/a?q=${"a".repeat(5000)}`;
    const r = parseMessage({ text: longUrl });
    expect(r.rawUrl.length).toBeLessThanOrEqual(2048);
    expect(r.truncated).toBe(true);
  });

  it("超長備註 → 截斷並標記 truncated", () => {
    const r = parseMessage({ text: `https://youtu.be/abc ${"哈".repeat(3000)}` });
    expect(r.note.length).toBeLessThanOrEqual(2000);
    expect(r.truncated).toBe(true);
  });

  it("備註截斷點正好劈開 emoji surrogate pair → 回退一位,不留 lone surrogate", () => {
    // 備註 = "a" + 1200 個 😀(每個佔 2 code unit)→ 長度 2401;
    // slice(0, 2000) 會正好切在第 1000 個 😀 的 pair 中間,尾端留 lone high surrogate。
    const r = parseMessage({ text: `https://youtu.be/abc a${"😀".repeat(1200)}` });
    expect(r.truncated).toBe(true);
    expect(r.note.length).toBe(1999); // 2000 劈在 pair 中間 → 回退一位
    const last = r.note.charCodeAt(r.note.length - 1);
    const isLoneHighSurrogate = last >= 0xd800 && last <= 0xdbff;
    expect(isLoneHighSurrogate).toBe(false);
    expect(r.note.endsWith("😀")).toBe(true); // 尾端是完整 emoji
  });

  it("備註截斷點沒劈開 pair → 照常截在 2000", () => {
    const r = parseMessage({ text: `https://youtu.be/abc ${"哈".repeat(2500)}` });
    expect(r.note.length).toBe(2000);
    expect(r.truncated).toBe(true);
  });
});
