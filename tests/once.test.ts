/**
 * oncePromise —— 一次性 async 快取:成功快取、失敗不快取(可重試)、
 * 併發共用同一次執行、同步 throw 走 rejection 路徑。
 */
import { describe, it, expect } from "vitest";
import { oncePromise } from "../src/utils/once.js";

describe("oncePromise", () => {
  it("成功後快取:多次呼叫只執行一次 fn、回同一結果", async () => {
    let calls = 0;
    const load = oncePromise(async () => {
      calls += 1;
      return { n: calls };
    });
    const a = await load();
    const b = await load();
    expect(calls).toBe(1);
    expect(b).toBe(a); // 同一份(同 promise 快取)
  });

  it("併發呼叫共用同一次執行(不會重入)", async () => {
    let calls = 0;
    const load = oncePromise(async () => {
      calls += 1;
      await Promise.resolve();
      return "v";
    });
    const [a, b] = await Promise.all([load(), load()]);
    expect(calls).toBe(1);
    expect(a).toBe("v");
    expect(b).toBe("v");
  });

  it("失敗不快取:第一次 reject 後,下一次呼叫重新執行(可重試)", async () => {
    let calls = 0;
    const load = oncePromise(async () => {
      calls += 1;
      if (calls === 1) throw new Error("init 失敗");
      return "recovered";
    });
    await expect(load()).rejects.toThrow("init 失敗");
    expect(await load()).toBe("recovered");
    expect(calls).toBe(2);
    // 恢復成功後恢復快取行為
    expect(await load()).toBe("recovered");
    expect(calls).toBe(2);
  });

  it("fn 同步 throw 也走 rejection(不炸同步例外)、同樣不快取", async () => {
    let calls = 0;
    const load = oncePromise(() => {
      calls += 1;
      if (calls === 1) throw new Error("同步炸");
      return Promise.resolve("ok");
    });
    await expect(load()).rejects.toThrow("同步炸");
    expect(await load()).toBe("ok");
  });

  it("併發期間失敗:所有等待者拿同一個 rejection,之後的新呼叫才重試", async () => {
    let calls = 0;
    const load = oncePromise(async () => {
      calls += 1;
      await Promise.resolve();
      throw new Error(`第 ${calls} 次失敗`);
    });
    const results = await Promise.allSettled([load(), load()]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(calls).toBe(1); // 併發共用同一次
    await expect(load()).rejects.toThrow("第 2 次失敗"); // 之後重試才第二次執行
  });
});
