/**
 * capList / clipTelegramText —— collector 殼/of 引擎 stats.ts 雙份積木的語意釘住:
 * 計數排行限筆數(分隔符注入保留全/半形分岔)、3900 surrogate-safe 截斷。
 */
import { describe, it, expect } from "vitest";
import { capList, clipTelegramText } from "../src/utils/text.js";

describe("capList", () => {
  it("依計數 desc 排序、預設全形冒號(殼版文案)", () => {
    expect(capList({ ig: 1, tiktok: 3, yt: 2 })).toEqual(["  tiktok：3", "  yt：2", "  ig：1"]);
  });

  it("超出上限 → 截前 max 行 + 一行「其餘 N 類」", () => {
    expect(capList({ a: 5, b: 4, c: 3, d: 2 }, 2)).toEqual(["  a：5", "  b：4", "  …(其餘 2 類)"]);
  });

  it("剛好等於上限 → 不補「其餘」行", () => {
    expect(capList({ a: 2, b: 1 }, 2)).toEqual(["  a：2", "  b：1"]);
  });

  it("分隔符可注入(of 引擎半形冒號分岔採用時保留)", () => {
    expect(capList({ ig: 1 }, 15, ":")).toEqual(["  ig:1"]);
  });

  it("空計數表 → 空陣列", () => {
    expect(capList({})).toEqual([]);
  });
});

describe("clipTelegramText(Telegram 單則 4096 上限;3900 保險硬切)", () => {
  it("未超限原樣返回(含剛好 3900)", () => {
    expect(clipTelegramText("短訊息")).toBe("短訊息");
    const exact = "x".repeat(3900);
    expect(clipTelegramText(exact)).toBe(exact);
  });

  it("超限 → 截斷 + 「…(已截斷)」後綴", () => {
    const out = clipTelegramText("x".repeat(4000));
    expect(out).toBe("x".repeat(3900) + "\n…(已截斷)");
  });

  it("surrogate-safe:切點落在 emoji 上不吐孤兒 surrogate(Telegram 會回 400)", () => {
    // 3899 個單碼 + 2 個 emoji(各佔 2 UTF-16 code unit)→ length=3903 超限;
    // code point 切 3900 = 3899 單碼 + 完整的第 1 個 emoji。
    const out = clipTelegramText("x".repeat(3899) + "😀😀");
    expect(out).toBe("x".repeat(3899) + "😀\n…(已截斷)");
    // 全字串無孤兒 surrogate(high 後面必須跟 low)。
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(out)).toBe(
      false,
    );
  });

  it("limit 可注入", () => {
    expect(clipTelegramText("abcdef", 3)).toBe("abc\n…(已截斷)");
  });
});
