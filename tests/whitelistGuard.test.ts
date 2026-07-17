/**
 * 來源白名單 guard —— port 自 collector tests/router.test.ts 的白名單語意
 * (那邊靠 Telegraf 全套跑;core 版 guard 是純 middleware,假 ctx 直測):
 * 名單命中放行(chat.id 或 from.id 其一)、陌生來源丟棄+回一次提示(含自己的 id)、
 * errorChatId 有設才通知管理員、同 chat 每進程只提醒一次、空名單不限制。
 * maskId 至今零測試 → 格式一併釘住。
 */
import { describe, it, expect } from "vitest";
import { makeWhitelistGuard, maskId, type GuardContext } from "../src/guard/whitelist.js";

/** 殼(voc)現行 deniedMsg 同款(文案注入是 API 面;此處只需可辨識的樣本)。 */
function deniedMsg(id: number): string {
  return `你沒有使用權限，請聯絡管理員。\n你的 ID：${id}（把這串傳給管理員加進白名單即可）`;
}

function makeCtx(opts: {
  chatId?: number;
  fromId?: number;
  username?: string;
  replyFails?: boolean;
}) {
  const replies: string[] = [];
  const adminSends: { chatId: string; text: string }[] = [];
  const ctx: GuardContext = {
    chat: opts.chatId != null ? { id: opts.chatId } : undefined,
    from: opts.fromId != null ? { id: opts.fromId, username: opts.username } : undefined,
    async reply(text: string) {
      if (opts.replyFails) throw new Error("Forbidden: bot was blocked by the user");
      replies.push(text);
      return {};
    },
    telegram: {
      async sendMessage(chatId: string, text: string) {
        adminSends.push({ chatId, text });
        return {};
      },
    },
  };
  return { ctx, replies, adminSends };
}

const silentLogger = { warn: () => {} };

function makeGuard(allowed: number[], errorChatId = "") {
  let nextCalls = 0;
  const guard = makeWhitelistGuard({
    allowed,
    errorChatId,
    deniedMsg,
    logger: silentLogger,
  });
  const next = async () => {
    nextCalls += 1;
    return undefined;
  };
  return { guard, next, nextCalls: () => nextCalls };
}

describe("makeWhitelistGuard:放行/丟棄", () => {
  it("名單內的 chat.id → 放行(next 被呼叫、無提示)", async () => {
    const { guard, next, nextCalls } = makeGuard([555]);
    const { ctx, replies } = makeCtx({ chatId: 555, fromId: 999 });
    await guard(ctx, next);
    expect(nextCalls()).toBe(1);
    expect(replies).toHaveLength(0);
  });

  it("from.id 命中(chat 是某群、但發訊者是自己人)也放行", async () => {
    const { guard, next, nextCalls } = makeGuard([999]);
    const { ctx } = makeCtx({ chatId: -100200300, fromId: 999 });
    await guard(ctx, next);
    expect(nextCalls()).toBe(1);
  });

  it("陌生來源 → 不 next、回一句提示(含 from.id;errorChatId 未設 → 不通知管理員)", async () => {
    const { guard, next, nextCalls } = makeGuard([555]);
    const { ctx, replies, adminSends } = makeCtx({ chatId: 424242, fromId: 717171 });
    await guard(ctx, next);
    expect(nextCalls()).toBe(0);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain("你沒有使用權限"); // 不再靜默
    expect(replies[0]).toContain("717171"); // 回顯發訊者自己的 id(from.id 優先於 chat.id)
    expect(adminSends).toHaveLength(0);
  });

  it("errorChatId 有設 → 被擋時同時通知管理員(🔔 開頭、含被擋 id 與 username)", async () => {
    const { guard, next } = makeGuard([555], "999000999");
    const { ctx, adminSends } = makeCtx({ chatId: 424242, fromId: 717171, username: "stranger" });
    await guard(ctx, next);
    expect(adminSends).toHaveLength(1);
    expect(adminSends[0]!.chatId).toBe("999000999");
    expect(adminSends[0]!.text.startsWith("🔔")).toBe(true);
    expect(adminSends[0]!.text).toContain("717171");
    expect(adminSends[0]!.text).toContain("@stranger");
  });

  it("同一個被擋 chat 連發多則 → 提示只回一次(防灌爆)", async () => {
    const { guard, next, nextCalls } = makeGuard([555], "999000999");
    const { ctx, replies, adminSends } = makeCtx({ chatId: 424242, fromId: 717171 });
    await guard(ctx, next);
    await guard(ctx, next);
    await guard(ctx, next);
    expect(nextCalls()).toBe(0);
    expect(replies).toHaveLength(1); // 提示只有第一則回,後續靜默丟棄
    expect(adminSends).toHaveLength(1); // 管理員通知同樣只發一次
  });

  it("不同的被擋 chat 各自提醒一次(deniedNotified 以 chat 為粒度)", async () => {
    const { guard, next } = makeGuard([555]);
    const a = makeCtx({ chatId: 111222, fromId: 111222 });
    const b = makeCtx({ chatId: 333444, fromId: 333444 });
    await guard(a.ctx, next);
    await guard(b.ctx, next);
    expect(a.replies).toHaveLength(1);
    expect(b.replies).toHaveLength(1);
  });

  it("reply 失敗(被封鎖等)不拋出 —— 否則這筆會被 drain 記成處理例外", async () => {
    const { guard, next } = makeGuard([555], "999000999");
    const { ctx, adminSends } = makeCtx({ chatId: 424242, fromId: 717171, replyFails: true });
    await expect(guard(ctx, next)).resolves.toBeUndefined();
    expect(adminSends).toHaveLength(1); // reply 失敗不影響管理員通知
  });

  it("無 chat id(理論邊角)→ 只記 log、不 reply、不炸", async () => {
    const { guard, next, nextCalls } = makeGuard([555]);
    const { ctx, replies } = makeCtx({ fromId: 717171 });
    await expect(guard(ctx, next)).resolves.toBeUndefined();
    expect(nextCalls()).toBe(0);
    expect(replies).toHaveLength(0);
  });

  it("空名單 = 不限制(等價 collector 原版「不掛 middleware」)", async () => {
    const { guard, next, nextCalls } = makeGuard([]);
    const { ctx, replies } = makeCtx({ chatId: 424242, fromId: 717171 });
    await guard(ctx, next);
    expect(nextCalls()).toBe(1);
    expect(replies).toHaveLength(0);
  });

  it("adminAlertMsg 可注入(of 引擎半形冒號分岔採用時保留)", async () => {
    let nextCalls = 0;
    const guard = makeWhitelistGuard({
      allowed: [555],
      errorChatId: "999000999",
      deniedMsg,
      logger: silentLogger,
      adminAlertMsg: (denyId, username) =>
        `🔔 有人想用 bot 但不在白名單:id=${denyId}${username ? ` @${username}` : ""}。放行就把這 id 加進 ALLOWED_CHAT_IDS。`,
    });
    const { ctx, adminSends } = makeCtx({ chatId: 424242, fromId: 717171 });
    await guard(ctx, async () => {
      nextCalls += 1;
    });
    expect(nextCalls).toBe(0);
    expect(adminSends[0]!.text).toContain("白名單:id=717171"); // 半形冒號版原樣送出
  });
});

describe("maskId:公開 log 去識別格式(至今零測試,一併釘住)", () => {
  it("undefined → none", () => {
    expect(maskId(undefined)).toBe("none");
  });

  it("2 碼以下全遮 → **", () => {
    expect(maskId(5)).toBe("**");
    expect(maskId(99)).toBe("**");
  });

  it("3 碼以上留末 2 碼", () => {
    expect(maskId(123)).toBe("***23");
    expect(maskId(660156312)).toBe("***12");
  });

  it("負數(群組 id)取絕對值再遮", () => {
    expect(maskId(-100200300)).toBe("***00");
    expect(maskId(-42)).toBe("**");
  });
});
