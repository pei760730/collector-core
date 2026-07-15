import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isTransient, withRetry } from "../src/utils/retry.js";

describe("isTransient 暫態判斷", () => {
  it("429 / 5xx 數字 code 視為暫態", () => {
    expect(isTransient({ code: 429 })).toBe(true);
    expect(isTransient({ code: 503 })).toBe(true);
    expect(isTransient({ response: { status: 502 } })).toBe(true);
  });

  it("404 / 4xx 非暫態", () => {
    expect(isTransient({ code: 404 })).toBe(false);
    expect(isTransient({ response: { status: 400 } })).toBe(false);
  });

  it("網路型 errno code / 訊息視為暫態(含 superset 的 ENOTFOUND / network)", () => {
    expect(isTransient({ code: "ECONNRESET" })).toBe(true);
    expect(isTransient({ code: "ENOTFOUND" })).toBe(true);
    expect(isTransient({ message: "Premature close" })).toBe(true);
    expect(isTransient({ message: "socket hang up" })).toBe(true);
    expect(isTransient(new Error("network error talking to host"))).toBe(true);
  });

  it("一般錯誤(無暫態 code/訊息)非暫態,維持 fail-fast", () => {
    expect(isTransient(new Error("表頭不符"))).toBe(false);
    expect(isTransient({})).toBe(false);
    expect(isTransient(null)).toBe(false);
  });
});

describe("withRetry 退避重試", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("連兩次暫態後成功(假計時器跑完退避)", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n += 1;
      if (n <= 2) throw { code: 503 };
      return "ok";
    });
    const p = withRetry("讀資料", fn);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("非暫態錯誤立即丟,不重試", async () => {
    const fn = vi.fn(async () => {
      throw new Error("表頭不符");
    });
    await expect(withRetry("寫表頭", fn)).rejects.toThrow("表頭不符");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("暫態錯誤重試到 tries 用盡後丟", async () => {
    const fn = vi.fn(async () => {
      throw { code: 500 };
    });
    const p = withRetry("append", fn, { tries: 3 });
    const assertion = expect(p).rejects.toMatchObject({ code: 500 });
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("alreadyDone()===true 短路為 resolve undefined(冪等護欄擋雙寫)", async () => {
    const fn = vi.fn(async () => {
      throw { code: 503 };
    });
    const alreadyDone = vi.fn(async () => true);
    const p = withRetry("append", fn, { alreadyDone });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(alreadyDone).toHaveBeenCalledTimes(1);
  });

  it("tries=1:只執行一次、暫態錯誤直接丟原錯(不吞成 undefined)", async () => {
    const fn = vi.fn(async () => {
      throw { code: 503 };
    });
    await expect(withRetry("t1", fn, { tries: 1 })).rejects.toMatchObject({ code: 503 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("tries<=0(邊界/誤用)夾到至少一次執行,不丟出 undefined", async () => {
    // 未夾住時迴圈一次都不跑 → 最後 `throw lastErr` 丟出 undefined(非 Error)極難追。
    const ok = vi.fn(async () => "ok");
    await expect(withRetry("t0", ok, { tries: 0 })).resolves.toBe("ok");
    expect(ok).toHaveBeenCalledTimes(1);

    const boom = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(withRetry("tneg", boom, { tries: -5 })).rejects.toThrow("boom");
    expect(boom).toHaveBeenCalledTimes(1);
  });

  it("alreadyDone 自身丟錯則照常重試,不放大故障", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n += 1;
      if (n === 1) throw { code: 503 };
      return "ok";
    });
    const alreadyDone = vi.fn(async () => {
      throw new Error("護欄查詢失敗");
    });
    const p = withRetry("append", fn, { alreadyDone });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(alreadyDone).toHaveBeenCalledTimes(1);
  });

  it("429 quota:退避基準為秒級(遠大於一般 500ms 起跳,才等得到每分鐘配額窗滾動)", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const fn = vi.fn(async () => {
      throw { code: 429 };
    });
    const p = withRetry("append", fn, { tries: 2 });
    const assertion = expect(p).rejects.toMatchObject({ code: 429 });
    await vi.runAllTimersAsync();
    await assertion;
    // 首次退避應 >= 5000ms(秒級起跳),證明不再用舊的 500ms·2^n(0.5s)硬窗打 429。
    const delays = setTimeoutSpy.mock.calls.map((c) => c[1]);
    expect(delays.some((d) => typeof d === "number" && d >= 5000)).toBe(true);
  });

  it("429 帶 Retry-After 時聽 Google 給的秒數(不過早重打、逐字尊重配額窗)", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const fn = vi.fn(async () => {
      throw { code: 429, response: { headers: { "retry-after": "30" } } };
    });
    const p = withRetry("append", fn, { tries: 2 });
    const assertion = expect(p).rejects.toMatchObject({ code: 429 });
    await vi.runAllTimersAsync();
    await assertion;
    // Retry-After: 30(秒)→ 精確等 30000ms,不加 jitter、不用退避預設。
    const delays = setTimeoutSpy.mock.calls.map((c) => c[1]);
    expect(delays).toContain(30000);
  });

  it("一般 5xx 暫態仍走 500ms 起跳的短退避(429 的秒級基準不外溢到非配額錯誤)", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const fn = vi.fn(async () => {
      throw { code: 503 };
    });
    const p = withRetry("read", fn, { tries: 2 });
    const assertion = expect(p).rejects.toMatchObject({ code: 503 });
    await vi.runAllTimersAsync();
    await assertion;
    // 退避 500..999ms(500 + full jitter),明顯 < 429 的 5000ms 秒級基準。
    const nums = setTimeoutSpy.mock.calls
      .map((c) => c[1])
      .filter((d): d is number => typeof d === "number");
    expect(nums.some((d) => d >= 500 && d < 5000)).toBe(true);
    expect(nums.every((d) => d < 5000)).toBe(true);
  });
});

describe("403 quota 暫態(audit #1)", () => {
  it("403 帶 Retry-After 表頭 → 暫態(配額)", () => {
    expect(
      isTransient({ code: 403, response: { status: 403, headers: { "retry-after": "30" } } }),
    ).toBe(true);
  });
  it("403 帶 rateLimit reason → 暫態", () => {
    expect(isTransient({ code: 403, errors: [{ reason: "userRateLimitExceeded" }] })).toBe(true);
    expect(
      isTransient({
        response: { status: 403, data: { error: { errors: [{ reason: "rateLimitExceeded" }] } } },
      }),
    ).toBe(true);
  });
  it("純權限 403(無配額訊號)仍 fail-fast", () => {
    expect(isTransient({ code: 403 })).toBe(false);
    expect(
      isTransient({ response: { status: 403, data: { error: { status: "PERMISSION_DENIED" } } } }),
    ).toBe(false);
  });
});
