/**
 * 表頭飄移防護(drift-catcher):欄位對映改「依實際表頭具名解析」後,重排 / 前面多一欄
 * (legacy id)/ 後面空欄 都不該再把值寫到錯欄或整輪打掛;只有必要欄「整個缺席」才 fail-fast。
 * 對映用純函式,免 mock googleapis。鏡射三個 bot 的 headerMap.test.ts,行為需一致。
 */
import { describe, it, expect } from "vitest";
import {
  colLetter,
  resolveHeaderIndexes,
  placeRow,
  readNamedRow,
} from "../src/sheets/headerMap.js";

// bot 專屬欄常數留各 bot;測試自帶一組代表性欄名。
const COLUMNS = ["平台", "連結", "挑", "加入日期"] as const;

describe("colLetter:0-based 欄索引 → A1 欄字母", () => {
  it("0→A, 25→Z, 26→AA", () => {
    expect(colLetter(0)).toBe("A");
    expect(colLetter(25)).toBe("Z");
    expect(colLetter(26)).toBe("AA");
    expect(colLetter(51)).toBe("AZ");
    expect(colLetter(52)).toBe("BA");
    expect(colLetter(701)).toBe("ZZ");
    expect(colLetter(702)).toBe("AAA");
  });
});

describe("resolveHeaderIndexes:依名解析", () => {
  it("正規表頭 → 索引照欄序", () => {
    const layout = resolveHeaderIndexes(["平台", "連結", "挑", "加入日期"], COLUMNS, "參考池");
    expect(layout.indexOf).toEqual({ 平台: 0, 連結: 1, 挑: 2, 加入日期: 3 });
    expect(layout.width).toBe(4);
  });

  it("欄位被重排 → 仍對到正確具名欄", () => {
    const layout = resolveHeaderIndexes(["連結", "加入日期", "平台", "挑"], COLUMNS, "參考池");
    expect(layout.indexOf).toEqual({ 連結: 0, 加入日期: 1, 平台: 2, 挑: 3 });
  });

  it("前面多一欄 legacy id + 後面有空欄 → 容忍,索引平移", () => {
    const layout = resolveHeaderIndexes(["id", "平台", "連結", "挑", "加入日期", ""], COLUMNS, "參考池");
    expect(layout.indexOf).toEqual({ 平台: 1, 連結: 2, 挑: 3, 加入日期: 4 });
    expect(layout.width).toBe(6);
  });

  it("必要欄整個缺席 → fail-fast(避免錯欄毀資料)", () => {
    expect(() => resolveHeaderIndexes(["平台", "連結", "挑"], COLUMNS, "參考池")).toThrow(/加入日期/);
  });
});

describe("placeRow / readNamedRow:飄移列來回對得上", () => {
  const layout = resolveHeaderIndexes(["id", "平台", "連結", "挑", "加入日期"], COLUMNS, "參考池");

  it("placeRow 把值塞到正確具名欄(legacy id 欄留空)", () => {
    const cells = placeRow(
      { 平台: "youtube", 連結: "https://youtu.be/x", 挑: "", 加入日期: "2026-06-26" },
      COLUMNS,
      layout,
    );
    expect(cells).toEqual(["", "youtube", "https://youtu.be/x", "", "2026-06-26"]);
  });

  it("readNamedRow 從飄移列讀回正確欄值", () => {
    const row = readNamedRow(
      ["R001", "youtube", "https://youtu.be/x", "", "2026-06-26"],
      COLUMNS,
      layout,
    );
    expect(row).toEqual({ 平台: "youtube", 連結: "https://youtu.be/x", 挑: "", 加入日期: "2026-06-26" });
  });

  it("placeRow → readNamedRow round-trip 保值", () => {
    const original = { 平台: "tiktok", 連結: "https://t/1", 挑: "V", 加入日期: "2026-07-08" };
    const cells = placeRow(original, COLUMNS, layout);
    expect(readNamedRow(cells, COLUMNS, layout)).toEqual(original);
  });
});
