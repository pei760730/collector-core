/**
 * makeSerializer —— collector collect.ts/ingest.ts 模組級 serialize 的語意釘住:
 * 依呼叫順序一次跑一個、前一個失敗不卡鎖、回傳值/拒絕原樣透傳、各 serializer 互不影響。
 */
import { describe, it, expect } from "vitest";
import { makeSerializer } from "../src/utils/serialize.js";

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 讓已排隊的微任務跑完(serialize 全鏈 promise、無 timer)。 */
async function flushMicrotasks(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

describe("makeSerializer", () => {
  it("重疊呼叫被串行化:第二個 fn 要等第一個 settle 才開跑", async () => {
    const serialize = makeSerializer();
    const events: string[] = [];
    const gate = deferred();
    const p1 = serialize(async () => {
      events.push("a-start");
      await gate.promise;
      events.push("a-end");
      return "a";
    });
    const p2 = serialize(async () => {
      events.push("b-start");
      return "b";
    });
    await flushMicrotasks();
    expect(events).toEqual(["a-start"]); // b 還沒開跑(a 佔著鎖)
    gate.resolve();
    expect(await p1).toBe("a");
    expect(await p2).toBe("b");
    expect(events).toEqual(["a-start", "a-end", "b-start"]);
  });

  it("前一個失敗不卡鎖:拒絕透傳給自己的呼叫者,下一個照常跑", async () => {
    const serialize = makeSerializer();
    const p1 = serialize(async () => {
      throw new Error("寫入失敗");
    });
    const p2 = serialize(async () => "ok");
    await expect(p1).rejects.toThrow("寫入失敗");
    expect(await p2).toBe("ok");
  });

  it("不同 serializer 各自有鎖,互不阻塞", async () => {
    const s1 = makeSerializer();
    const s2 = makeSerializer();
    const events: string[] = [];
    const gate = deferred();
    const p1 = s1(async () => {
      events.push("s1-start");
      await gate.promise;
      return 1;
    });
    const p2 = s2(async () => {
      events.push("s2-ran");
      return 2;
    });
    await flushMicrotasks();
    expect(events).toContain("s2-ran"); // s1 佔著自己的鎖,s2 不受影響
    gate.resolve();
    expect(await p1).toBe(1);
    expect(await p2).toBe(2);
  });
});
