/**
 * 來源白名單 middleware(公開 repo 防護)—— 自 collector 上移(#9 三併一後殼
 * src/bot/router.ts 與 vendored of 引擎 src/engines/of/bot/router.ts 逐字雙份;
 * target 無關 → 收進 core)。
 *
 * 行為(與 collector 兩份現行實作同語意,逐字保留):
 * - 只處理名單內 chat/user 的訊息,其餘丟棄(不寫池、不進 handler),但回一句
 *   「沒有權限」提示 —— 完全靜默會讓誤加的自己人以為 bot 壞了
 *   (2026-07-07:兩位協作者連 /start 都沒回應,查了一天才發現是被白名單擋下)。
 * - 同一 chat 每進程(= 每個 guard 實例)只提醒一次,陌生人連發也不會被回覆灌爆。
 * - 比對 chat.id(私訊=你的 user id;群組=群 id)或 from.id(發訊者),命中其一即放行。
 * - 丟棄但不報錯:drain 會照常 ack 推進 offset,避免垃圾訊息每輪重領卡住佇列。
 * - id 遮蔽:public repo 的 Actions log 是公開的,不外洩陌生人原始 Telegram id
 *   (去識別),只留末 2 碼供粗略辨識重複來源(見 maskId)。
 * - 提示走私訊/管理員 DM(非公開 log),故帶完整 id;公開 log 仍維持 maskId 去識別。
 * - 空名單 = 不限制(僅 memory 乾跑/開發;sheets 模式 config 已 fail-fast 強制設定)
 *   —— collector 原版是「空名單就不掛 middleware」,這裡等價為 middleware 直接放行,
 *   消費端可無條件註冊。
 *
 * 結構型別、零 telegraf 依賴:ctx 只要求 chat?/from?/reply/telegram.sendMessage
 * (Telegraf Context 天然符合;測試注入假件即可,不用真連線)。
 * per-collector 文案分岔由參數注入,不燒進 core:
 * - deniedMsg(標點全半形不同:殼「你沒有使用權限，…」vs of「你沒有使用權限,…」)→ 必填注入。
 * - 管理員通知(僅冒號全半形不同)→ adminAlertMsg 可選注入;預設 = 殼(voc/tbvoc)全形版,
 *   of 引擎採用時注入半形版。
 */
import { logger as defaultLogger } from "../utils/logger.js";

/** guard 的 log 出口最小介面(core logger 天然符合)。 */
export interface GuardLogger {
  warn(msg: string, extra?: unknown): void;
}

/** guard 對 ctx 的最小要求(Telegraf Context 子集;測試注入假件即可)。 */
export interface GuardContext {
  chat?: { id: number };
  from?: { id: number; username?: string };
  reply(text: string): Promise<unknown>;
  telegram: {
    sendMessage(chatId: string, text: string): Promise<unknown>;
  };
}

/** telegraf 相容 middleware 形狀(Telegraf Context 可餵進 GuardContext → 直接 bot.use)。 */
export type WhitelistGuard = (ctx: GuardContext, next: () => Promise<unknown>) => Promise<unknown>;

export interface WhitelistGuardOptions {
  /** 放行的 chat/user id 名單(ALLOWED_CHAT_IDS;core chatIdsEnv 的輸出可直餵)。空名單 = 不限制。 */
  allowed: readonly number[];
  /** 管理員通知 chat id;空字串 = 被擋時不通知管理員(只回被擋者)。 */
  errorChatId: string;
  /** 被擋者提示文案(帶上發訊者自己的 id → 截圖給管理員自助上白名單)。per-collector 標點分岔 → 注入。 */
  deniedMsg: (id: number) => string;
  /** log 出口;預設 core logger。 */
  logger?: GuardLogger;
  /**
   * 管理員通知文案(denyId + username → 全文)。預設 = 殼(voc/tbvoc)全形冒號版;
   * of 引擎的現行文案僅冒號為半形(`…白名單:id=…`),採用時注入自家版本保留分岔。
   */
  adminAlertMsg?: (denyId: number, username: string | undefined) => string;
}

/** 預設管理員通知文案 = 殼(voc/tbvoc)現行逐字版(全形冒號)。 */
function defaultAdminAlertMsg(denyId: number, username: string | undefined): string {
  const uname = username ? ` @${username}` : "";
  return `🔔 有人想用 bot 但不在白名單：id=${denyId}${uname}。放行就把這 id 加進 ALLOWED_CHAT_IDS。`;
}

export function makeWhitelistGuard(options: WhitelistGuardOptions): WhitelistGuard {
  const {
    allowed: allowedList,
    errorChatId,
    deniedMsg,
    logger = defaultLogger,
    adminAlertMsg = defaultAdminAlertMsg,
  } = options;

  // 空名單 = 不限制(collector 原版等價寫法:不掛 middleware)。
  if (allowedList.length === 0) {
    return async (_ctx, next) => next();
  }

  const allowed = new Set(allowedList);
  const deniedNotified = new Set<number>();

  return async (ctx, next) => {
    const chatId = ctx.chat?.id;
    const fromId = ctx.from?.id;
    if ((chatId != null && allowed.has(chatId)) || (fromId != null && allowed.has(fromId))) {
      return next();
    }
    // 丟棄但不報錯:drain 會照常 ack 推進 offset,避免垃圾訊息每輪重領卡住佇列。
    logger.warn(
      `擋下非授權來源:chat=${maskId(chatId)} from=${maskId(fromId)}(不在 ALLOWED_CHAT_IDS)`,
    );
    // 提示是 best-effort:reply 失敗(被封鎖等)不能拋出,否則這筆會被 drain 記成處理例外。
    // 回覆帶上發訊者自己的 id、並(若有設 errorChatId)一併通知管理員 → 被擋的自己人可自助上白名單。
    if (chatId != null && !deniedNotified.has(chatId)) {
      deniedNotified.add(chatId);
      const denyId = fromId ?? chatId;
      await ctx.reply(deniedMsg(denyId)).catch((e) => {
        logger.warn(`回覆非授權來源提示失敗:chat=${maskId(chatId)}`, e);
      });
      // 通知管理員(errorChatId 有設才發):把被擋 id + username 推給管理員,一鍵決定放不放行。
      if (errorChatId) {
        await ctx.telegram
          .sendMessage(errorChatId, adminAlertMsg(denyId, ctx.from?.username))
          .catch((e) => logger.warn(`通知管理員被擋來源失敗:chat=${maskId(chatId)}`, e));
      }
    }
    return undefined;
  };
}

/** 遮蔽 Telegram id:回傳末 2 碼(不足 3 碼全遮),不外洩完整 id 到公開 log。 */
export function maskId(id: number | undefined): string {
  if (id == null) return "none";
  const s = String(Math.abs(id));
  return s.length <= 2 ? "**" : `***${s.slice(-2)}`;
}
