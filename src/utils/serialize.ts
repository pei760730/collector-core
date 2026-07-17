/**
 * 同進程串行鎖 —— 自 collector 上移(#9 三併一後殼 src/bot/handlers/collect.ts 與
 * vendored of 引擎 src/engines/of/bot/handlers/ingest.ts 的模組級 serialize 逐字雙份;
 * target 無關 → 收進 core,factory 化讓每個呼叫端有自己的鎖)。
 *
 * 用途:序列化 dedup→append,避免同一連結極短時間連發時兩條都過去重再雙寫。
 * (跨進程要靠單一 bot 實例;polling / drain 都是單實例。)
 *
 * 語意(逐字保留):
 * - 依呼叫順序一次跑一個 fn;前一個 fn 失敗不卡鎖(`lock.then(fn, fn)` 兩路都接)。
 * - 回傳值/拒絕原樣透傳給各自呼叫者;鎖本身吞掉結果(`() => undefined` 兩路歸零)。
 */
export function makeSerializer(): <T>(fn: () => Promise<T>) => Promise<T> {
  let lock: Promise<unknown> = Promise.resolve();
  return function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = lock.then(fn, fn);
    lock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}
