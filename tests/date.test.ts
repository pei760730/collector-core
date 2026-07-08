import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

// 匯入 date.js 會執行其 dayjs.extend(utc/timezone) 副作用,故本檔 dayjs.tz 亦可用。
import { TZ, ageInDays, parseSheetDate, todayIsoTaipei } from "../src/utils/date.js";

describe("date utils（台北牆鐘）", () => {
  it("ISO 與 YYYY/M/D 同日、且以台北牆鐘解析（午夜=0）", () => {
    const iso = parseSheetDate("2026-07-08")!;
    const slash = parseSheetDate("2026/7/8")!;
    expect(iso.format("YYYY-MM-DD")).toBe("2026-07-08");
    expect(slash.format("YYYY-MM-DD")).toBe("2026-07-08");
    // 牆鐘解析 → 台北當地 00:00。舊寫法 dayjs(s).tz(TZ) 位移瞬時,在 UTC 上得 08:00（off-by-one 根因）。
    expect(iso.tz(TZ).hour()).toBe(0);
    expect(iso.startOf("day").isSame(slash.startOf("day"), "day")).toBe(true);
  });

  it("空/非法字串 → null", () => {
    expect(parseSheetDate("")).toBeNull();
    expect(parseSheetDate("   ")).toBeNull();
    expect(parseSheetDate("not-a-date")).toBeNull();
  });

  it("ageInDays：注入 now、跨日邊界、非法→Infinity", () => {
    const now = dayjs.tz("2026-07-08 09:00", TZ).valueOf();
    expect(ageInDays("2026-07-08", now)).toBe(0);
    expect(ageInDays("2026-07-07", now)).toBe(1);
    expect(ageInDays("2026/7/1", now)).toBe(7);
    expect(ageInDays("garbage", now)).toBe(Infinity);
    expect(ageInDays("", now)).toBe(Infinity);
  });

  it("溢位日期(dayjs 會靜默向前滾動)→ null,不接受滾動後結果", () => {
    // dayjs 把 2026/2/30 滾成 2026-03-02 且 isValid()=true;回寫比對才擋得住。
    expect(parseSheetDate("2026/2/30")).toBeNull();
    expect(parseSheetDate("2026-02-30")).toBeNull();
    expect(parseSheetDate("2026/13/45")).toBeNull();
    // 溢位日期經 ageInDays → Infinity(視為超出任何窗格)。
    const now = dayjs.tz("2026-07-08 09:00", TZ).valueOf();
    expect(ageInDays("2026/2/30", now)).toBe(Infinity);
    expect(ageInDays("2026-02-30", now)).toBe(Infinity);
  });

  it("todayIsoTaipei：UTC 前一晚仍算台北當天", () => {
    // 2026-07-07T17:00Z = 2026-07-08 01:00 台北
    expect(todayIsoTaipei(Date.UTC(2026, 6, 7, 17, 0, 0))).toBe("2026-07-08");
  });
});
