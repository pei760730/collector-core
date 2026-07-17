/**
 * 一次性 async 快取 —— 成功結果快取(之後永遠回同一個 promise)、失敗不快取
 * (下次呼叫重新執行 fn,可重試)。init/config 這類「載一次、失敗要能重來」的積木。
 *
 * 併發語意:進行中的 promise 也共用 —— 併發呼叫只執行一次 fn;
 * 若那次最終失敗,所有等待者拿到同一個 rejection,之後的新呼叫才重試。
 * fn 同步 throw 一樣走 rejection 路徑(不會炸出同步例外)。
 */
export function oncePromise<T>(fn: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | undefined;
  return () => {
    if (cached === undefined) {
      const p = Promise.resolve().then(fn);
      cached = p;
      // 失敗清快取(僅清自己那份,防與後續重試的新 promise 競態)。
      // 這條 catch 也讓 p 一定「有人接」,不會因呼叫者晚 await 觸發 unhandledRejection。
      p.catch(() => {
        if (cached === p) cached = undefined;
      });
    }
    return cached;
  };
}
