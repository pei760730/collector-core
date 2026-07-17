/**
 * drain abort 語意 + exit code 對映 —— port 自 collector tests/drainLoop.test.ts
 * (殼與 of 引擎同款;上移 core 後語意逐字釘住)。
 * 舊事故(audit HIGH: drain-abort-exit-0-假綠):aborted(寫入失敗中止)也 exit 0 →
 * collect.yml 綠燈、kai-notify(if: failure())永不觸發;Sheets 壞掉 + ERROR_CHAT_ID
 * 沒設 = 靜默丟資料。本測釘住:aborted → exitCodeFor = 2(非 0),正常 → 0;
 * 以及迴圈的 ack 語意 —— 失敗筆不前進 offset(下次 cron 重領)、成功段照常 ack。
 */
import { describe, it, expect } from "vitest";
import {
  drainUpdates,
  exitCodeFor,
  type DrainableBot,
  type DrainableUpdate,
  type PersistFlag,
} from "../src/drain/loop.js";

function upd(id: number): DrainableUpdate {
  return { update_id: id };
}

/**
 * 假 bot:getUpdates 依 offset 回「還沒 ack 的更新」(模擬 Telegram 累積語意;
 * 一次只回 1 筆,逼迴圈每筆都帶新 offset 重新領 → offset 前進/停住的語意才驗得到),
 * handleUpdate 時對指定 update_id 翻 persist.failed(模擬寫入持久層失敗)。
 * 純結構型別:不需要 @telegraf/types,{update_id} 即可餵。
 */
function makeFakeBot(opts: {
  updates: DrainableUpdate[];
  failOn?: Set<number>;
  persist: PersistFlag;
  throwOn?: Set<number>;
}) {
  const offsetsSeen: number[] = [];
  const handled: number[] = [];
  const bot: DrainableBot = {
    telegram: {
      async getUpdates(_timeout, _limit, offset, _allowed) {
        offsetsSeen.push(offset);
        return opts.updates.filter((u) => u.update_id >= offset).slice(0, 1);
      },
    },
    async handleUpdate(u) {
      handled.push(u.update_id);
      if (opts.throwOn?.has(u.update_id)) throw new Error("路由層例外");
      if (opts.failOn?.has(u.update_id)) opts.persist.failed = true;
    },
  };
  return { bot, offsetsSeen, handled };
}

describe("drainUpdates:abort / ack 語意", () => {
  it("全部成功 → processed=全數、aborted=false", async () => {
    const persist: PersistFlag = { failed: false };
    const { bot } = makeFakeBot({ updates: [upd(10), upd(11), upd(12)], persist });
    const r = await drainUpdates(bot, persist);
    expect(r).toEqual({ processed: 3, aborted: false });
  });

  it("佇列為空 → processed=0、aborted=false(一次 getUpdates 即收工)", async () => {
    const persist: PersistFlag = { failed: false };
    const { bot, offsetsSeen } = makeFakeBot({ updates: [], persist });
    const r = await drainUpdates(bot, persist);
    expect(r).toEqual({ processed: 0, aborted: false });
    expect(offsetsSeen).toEqual([0]);
  });

  it("中途某筆寫入失敗 → aborted=true、失敗筆與之後的不 ack(下次重領)", async () => {
    const persist: PersistFlag = { failed: false };
    const { bot, offsetsSeen, handled } = makeFakeBot({
      updates: [upd(10), upd(11), upd(12)],
      failOn: new Set([11]),
      persist,
    });
    const r = await drainUpdates(bot, persist);
    expect(r.aborted).toBe(true);
    expect(r.processed).toBe(1); // 只有 10 成功
    expect(handled).toEqual([10, 11]); // 12 沒被處理(提前結束)
    // 失敗筆(11)不前進 offset:offset 只推進到 11(10 成功後),之後不再領 → 11 起下次 cron 重領。
    // (abort 後不再呼叫 getUpdates → 本進程內成功的前綴也沒被 ack;下次 cron offset 從 0
    //  重領整段、靠 storage 去重吸收 —— at-least-once,絕不默默 ack 沒寫成功的訊息。)
    expect(offsetsSeen).toEqual([0, 11]);
  });

  it("路由層例外(非寫入失敗)→ 記錄後跳過、照常 ack、不 abort", async () => {
    const persist: PersistFlag = { failed: false };
    const { bot, handled } = makeFakeBot({
      updates: [upd(10), upd(11)],
      throwOn: new Set([10]),
      persist,
    });
    const r = await drainUpdates(bot, persist);
    expect(r.aborted).toBe(false);
    expect(r.processed).toBe(2); // 例外筆也算處理(ack 掉,重領也沒用)
    expect(handled).toEqual([10, 11]);
  });

  it("persistLabel 只是 log 標籤 —— 傳入不改任何 abort/ack 行為", async () => {
    const persist: PersistFlag = { failed: false };
    const { bot, offsetsSeen } = makeFakeBot({
      updates: [upd(10), upd(11)],
      failOn: new Set([11]),
      persist,
    });
    const r = await drainUpdates(bot, persist, { persistLabel: "參考池" });
    expect(r).toEqual({ processed: 1, aborted: true });
    expect(offsetsSeen).toEqual([0, 11]);
  });
});

describe("exitCodeFor:aborted 不得回 0(collect.yml 紅燈是底線告警)", () => {
  it("aborted → 2", () => {
    expect(exitCodeFor({ processed: 1, aborted: true })).toBe(2);
  });

  it("正常完成 → 0", () => {
    expect(exitCodeFor({ processed: 3, aborted: false })).toBe(0);
    expect(exitCodeFor({ processed: 0, aborted: false })).toBe(0);
  });
});
