/**
 * drain 迴圈本體 —— 一次性排空 getUpdates 佇列(getUpdates→handleUpdate→ack)。
 *
 * 自 collector 上移(#9 三併一後殼 src/drainLoop.ts 與 vendored of 引擎
 * src/engines/of/drainLoop.ts 逐字雙份;target 無關 → 收進 core)。
 * abort/ack 語意與 exit code 對映在這裡;消費端測試用假 bot 釘住。
 *
 * 結構型別、零 telegraf 依賴:bot 只要求 `telegram.getUpdates` + `handleUpdate`,
 * update 只要求 `update_id`(Telegraf 實例天然符合;測試注入假件即可,不用真連線)。
 */
import { logger } from "../utils/logger.js";

/** drain 迴圈對 update 的最小要求:有 update_id 可推進 offset 即可。 */
export interface DrainableUpdate {
  update_id: number;
}

/** drain 迴圈需要的最小 bot 介面(Telegraf 子集;測試注入假件即可,不用真連線)。 */
export interface DrainableBot<U extends DrainableUpdate = DrainableUpdate> {
  telegram: {
    getUpdates(
      timeout: number,
      limit: number,
      offset: number,
      allowedUpdates: undefined,
    ): Promise<U[]>;
  };
  handleUpdate(update: U): Promise<unknown>;
}

/** 寫入失敗 side-channel 旗標(consumer 的 hooks.onPersistError 翻 true;每筆處理前歸零)。 */
export interface PersistFlag {
  failed: boolean;
}

export interface DrainResult {
  /** 成功處理並 ack 的更新數。 */
  processed: number;
  /** true = 某筆持久化失敗 → 停在該 offset 提前結束(該筆與之後的下次 cron 重領)。 */
  aborted: boolean;
}

export interface DrainOptions {
  /**
   * 持久層在 log 裡的稱呼(唯一 per-engine 分歧,故參數化):
   * voc/tbvoc 殼用「參考池」、of 引擎用「暫存區」。預設「持久層」。
   */
  persistLabel?: string;
}

export async function drainUpdates<U extends DrainableUpdate>(
  bot: DrainableBot<U>,
  persist: PersistFlag,
  options: DrainOptions = {},
): Promise<DrainResult> {
  const persistLabel = options.persistLabel ?? "持久層";
  let offset = 0;
  let processed = 0;
  let aborted = false;
  outer: for (;;) {
    // timeout=0 → 不長等:有就回、沒有立刻回空(一次性語意,不要 block 住 Actions)。
    const updates = await bot.telegram.getUpdates(0, 100, offset, undefined);
    if (updates.length === 0) break;
    for (const u of updates) {
      persist.failed = false;
      try {
        await bot.handleUpdate(u);
      } catch (err) {
        // 解析/路由層的非預期例外(非寫入失敗):這類重領也沒用,記錄後跳過。
        logger.error(`處理 update ${u.update_id} 例外(跳過,下次不重領)`, err);
      }
      if (persist.failed) {
        // 寫入失敗(可重試):不前進 offset、結束整個 drain,這筆與之後的不 ack。
        // 注意:offset 是進程內狀態,abort 後不再呼叫 getUpdates → 最後一次 getUpdates
        // 之後成功處理的那段前綴其實也「沒被 ack」——下次 cron 從頭重領時會連同失敗筆
        // 一起整段重跑 handleUpdate,靠 storage 去重吸收(不會雙寫)。
        // (舊註解稱「成功前綴會被下次的第一次 getUpdates ack」是錯的:下次進程 offset
        //  從 0 起,ack 不到;正確語意 = 整段重領 + dedup 吸收。)
        // 這樣才真 at-least-once,不會把沒寫成功的訊息默默 ack 掉(CLAUDE.md 紅線)。
        logger.error(
          `update ${u.update_id} 寫入${persistLabel}失敗 → 停在此 offset,結束本輪讓下次 cron 重領`,
        );
        aborted = true;
        break outer;
      }
      offset = u.update_id + 1; // 帶到下一輪 getUpdates 即 ack 本批(累積語意)
      processed += 1;
    }
  }
  // 正常結束時最後一次「空批」getUpdates(offset) 已 ack 最後一批,不需額外補 ack。
  // 中止結束時刻意不 ack 未處理段(含失敗那筆),留給下次 cron 重領。
  return { processed, aborted };
}

/**
 * exit code 對映:aborted(寫入失敗中止)→ 2,正常 → 0。
 * 舊版 aborted 也 exit 0 → collect.yml 綠燈、kai-notify(if: failure())永不觸發;
 * Sheets 壞掉 + ERROR_CHAT_ID 沒設時 = 靜默丟資料。非零退出讓 Actions 紅燈成為底線告警。
 */
export function exitCodeFor(result: DrainResult): number {
  return result.aborted ? 2 : 0;
}
