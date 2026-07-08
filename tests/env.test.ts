/**
 * env helpers 測試。核心 = chatIdsEnv 嚴格純整數解析(公開 repo 防灌池閘門,
 * 打錯一項就該紅燈,不能靠 Number() 把 "1e5"/"0x10"/"12.0" 默默吞成錯 id)。
 * 由三個 collector 的 config.ts 逐字副本抽進 core,行為需一致。
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  required,
  optional,
  boolEnv,
  enumEnv,
  chatIdsEnv,
} from "../src/config/env.js";

const KEY = "TEST_ENV_HELPER_KEY";

afterEach(() => {
  delete process.env[KEY];
});

function set(raw: string | undefined): void {
  if (raw === undefined) delete process.env[KEY];
  else process.env[KEY] = raw;
}

describe("chatIdsEnv:嚴格純整數解析", () => {
  function parse(raw: string): number[] {
    process.env[KEY] = raw;
    return chatIdsEnv(KEY);
  }

  it("純十進位整數(含負號)通過", () => {
    expect(parse("123")).toEqual([123]);
    expect(parse("-100")).toEqual([-100]);
    expect(parse("123,-100, 456 ")).toEqual([123, -100, 456]);
  });

  it("未設 / 空字串 / 全空白 → 空陣列", () => {
    delete process.env[KEY];
    expect(chatIdsEnv(KEY)).toEqual([]);
    expect(parse("")).toEqual([]);
    expect(parse("   ")).toEqual([]);
  });

  // Number() 會把這些吞成合法整數 → 必須被 regex 擋下,否則白名單靜默失準
  it.each(["1e5", "0x10", "12.0", "0b1", "0o17", "1_000", "12abc", "abc", "+5", "１２３"])(
    "非純整數字面 '%s' → 丟錯",
    (bad) => {
      expect(() => parse(bad)).toThrow(/非整數 chat id/);
    },
  );

  it("有效項中夾一個壞項也整組丟錯(fail-fast)", () => {
    expect(() => parse("123,1e5,456")).toThrow(/非整數 chat id/);
  });
});

describe("required", () => {
  it("有值 → 回去頭尾空白的值", () => {
    set("  hello  ");
    expect(required(KEY)).toBe("hello");
  });
  it("未設 / 空白 → 丟錯", () => {
    set(undefined);
    expect(() => required(KEY)).toThrow(/缺少必要環境變數/);
    set("   ");
    expect(() => required(KEY)).toThrow(/缺少必要環境變數/);
  });
});

describe("optional", () => {
  it("有值 → trim 後回傳", () => {
    set("  v  ");
    expect(optional(KEY, "fb")).toBe("v");
  });
  it("未設 / 空白 → fallback", () => {
    set(undefined);
    expect(optional(KEY, "fb")).toBe("fb");
    set("   ");
    expect(optional(KEY, "fb")).toBe("fb");
  });
});

describe("boolEnv", () => {
  it.each(["1", "true", "TRUE", "yes", "on", " On "])("'%s' → true", (v) => {
    set(v);
    expect(boolEnv(KEY, false)).toBe(true);
  });
  it.each(["0", "false", "no", "off", "banana"])("'%s' → false", (v) => {
    set(v);
    expect(boolEnv(KEY, true)).toBe(false);
  });
  it("未設 / 空白 → fallback", () => {
    set(undefined);
    expect(boolEnv(KEY, true)).toBe(true);
    expect(boolEnv(KEY, false)).toBe(false);
    set("  ");
    expect(boolEnv(KEY, true)).toBe(true);
  });
});

describe("enumEnv", () => {
  const allowed = ["sheets", "memory"] as const;
  it("白名單值 → 回傳", () => {
    set("memory");
    expect(enumEnv(KEY, allowed, "sheets")).toBe("memory");
  });
  it("未設 / 空白 → fallback", () => {
    set(undefined);
    expect(enumEnv(KEY, allowed, "sheets")).toBe("sheets");
    set("   ");
    expect(enumEnv(KEY, allowed, "sheets")).toBe("sheets");
  });
  it("不在白名單 → 丟錯", () => {
    set("nope");
    expect(() => enumEnv(KEY, allowed, "sheets")).toThrow(/只能是/);
  });
});
