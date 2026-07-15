/**
 * env helpers 測試。核心 = chatIdsEnv 嚴格純整數解析(公開 repo 防灌池閘門,
 * 打錯一項就該紅燈,不能靠 Number() 把 "1e5"/"0x10"/"12.0" 默默吞成錯 id)。
 * 由三個 collector 的 config.ts 逐字副本抽進 core,行為需一致。
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  required,
  optional,
  boolEnv,
  enumEnv,
  chatIdsEnv,
  loadGoogleCredentials,
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
  it.each(["0", "false", "FALSE", "no", "off", " Off "])("'%s' → false", (v) => {
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
  // 白名單制(fail-fast,同 chatIdsEnv 哲學):打錯的值不准默默變 false ——
  // "ture"/"enabled" 這種手滑會讓「以為開了的開關」靜默失效。
  it.each(["ture", "enabled", "banana", "2", "t", "y"])("白名單外 '%s' → 丟錯", (v) => {
    set(v);
    expect(() => boolEnv(KEY, true)).toThrow(/不是合法布林值/);
    expect(() => boolEnv(KEY, false)).toThrow(/不是合法布林值/);
  });
  it("錯誤訊息列出收到什麼與接受什麼", () => {
    set("ture");
    expect(() => boolEnv(KEY, false)).toThrow(/'ture'/);
    expect(() => boolEnv(KEY, false)).toThrow(/1\/true\/yes\/on/);
    expect(() => boolEnv(KEY, false)).toThrow(/0\/false\/no\/off/);
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

describe("loadGoogleCredentials:三來源優先序 + 驗證(純環境變數,不碰真檔案憑證)", () => {
  const VARS = [
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64",
    "GOOGLE_SERVICE_ACCOUNT_FILE",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const v of VARS) {
      saved[v] = process.env[v];
      delete process.env[v];
    }
  });
  afterEach(() => {
    for (const v of VARS) {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    }
  });

  const creds = (email: string): string =>
    JSON.stringify({ client_email: email, private_key: "-----KEY-----" });
  const b64 = (s: string): string => Buffer.from(s, "utf-8").toString("base64");

  it("JSON 字串來源:解析並回傳 client_email/private_key", () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = creds("json@sa.test");
    expect(loadGoogleCredentials()).toEqual({
      client_email: "json@sa.test",
      private_key: "-----KEY-----",
    });
  });

  it("base64 來源:decode 後解析", () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 = b64(creds("b64@sa.test"));
    expect(loadGoogleCredentials().client_email).toBe("b64@sa.test");
  });

  it("優先序 JSON > base64:兩者都設時用 JSON(base64 即使是壞值也不會被碰)", () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = creds("json@sa.test");
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 = "!!!not-base64!!!";
    expect(loadGoogleCredentials().client_email).toBe("json@sa.test");
  });

  it("優先序 base64 > file:兩者都設時用 base64(file 指向不存在路徑也不會被讀)", () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 = b64(creds("b64@sa.test"));
    process.env.GOOGLE_SERVICE_ACCOUNT_FILE = "/definitely/not/a/real/file.json";
    expect(loadGoogleCredentials().client_email).toBe("b64@sa.test");
  });

  it("只設 file 且路徑不存在 → readFileSync 丟錯(file 分支有被走到)", () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_FILE = "/definitely/not/a/real/file.json";
    expect(() => loadGoogleCredentials()).toThrow();
  });

  it("private_key 內字面 \\n 還原成真正換行(.env 單行貼法)", () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "nl@sa.test",
      private_key: "-----BEGIN-----\\nAAA\\nBBB\\n-----END-----",
    });
    expect(loadGoogleCredentials().private_key).toBe(
      "-----BEGIN-----\nAAA\nBBB\n-----END-----",
    );
  });

  it("三來源皆無 → 丟錯(fail-fast)", () => {
    expect(() => loadGoogleCredentials()).toThrow(/缺少 Google 憑證/);
  });

  it("空白字串視同未設(trim 後為空 → 落到下一來源/丟錯)", () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "   ";
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 = b64(creds("b64@sa.test"));
    expect(loadGoogleCredentials().client_email).toBe("b64@sa.test");
  });

  it("壞 JSON → 丟解析錯誤(不默默吞)", () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "{not json";
    expect(() => loadGoogleCredentials()).toThrow(/JSON 解析失敗/);
  });

  it("base64 decode 出來不是合法 JSON → 同樣丟解析錯誤", () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 = b64("{not json");
    expect(() => loadGoogleCredentials()).toThrow(/JSON 解析失敗/);
  });

  it("缺 client_email 或 private_key → 丟錯", () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: "x@sa.test" });
    expect(() => loadGoogleCredentials()).toThrow(/缺 client_email \/ private_key/);
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ private_key: "k" });
    expect(() => loadGoogleCredentials()).toThrow(/缺 client_email \/ private_key/);
  });
});

describe("chatIdsEnv 安全整數(audit #3)", () => {
  const KEY = "TEST_CHAT_IDS_SAFEINT";
  afterEach(() => {
    delete process.env[KEY];
  });
  it("正常 id 照舊解析", () => {
    process.env[KEY] = "660156312,-100200300";
    expect(chatIdsEnv(KEY)).toEqual([660156312, -100200300]);
  });
  it("超過 2^53 的 id → 丟錯,不靜默進位", () => {
    process.env[KEY] = "9007199254740993"; // MAX_SAFE_INTEGER + 2
    expect(() => chatIdsEnv(KEY)).toThrow(/安全整數/);
  });
});
