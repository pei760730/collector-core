/**
 * error chat 通知器 + 錯誤文字化 —— 自 collector 上移(#9 三併一後殼 src/bot/router.ts
 * 與 vendored of 引擎 src/engines/of/bot/router.ts 的 notifyError / errText 逐字雙份;
 * target 無關 → 收進 core)。
 *
 * 語意(逐字保留):
 * - errorChatId 空字串 = no-op(memory 乾跑/開發不設也不炸)。
 * - 訊息帶 `🐞 ` 前綴(error chat 裡一眼識別是 bot 自報障)。
 * - 通知本身失敗不能拋出(不影響主流程/exit code),記錄即可。
 */
import { logger as defaultLogger } from "../utils/logger.js";

export interface ErrorNotifierOptions {
  /** 通知目標 chat id;空字串 = 通知器變 no-op。 */
  errorChatId: string;
  /** 發送出口(結構型別;`(id, t) => bot.telegram.sendMessage(id, t)` 即可,測試注入假件)。 */
  sendMessage(chatId: string, text: string): Promise<unknown>;
  /** log 出口;預設 core logger。 */
  logger?: { error(msg: string, extra?: unknown): void };
}

/** 回 `notifyError(text)`:best-effort 發到 error chat,永不拋出。 */
export function makeErrorNotifier(options: ErrorNotifierOptions): (text: string) => Promise<void> {
  const log = options.logger ?? defaultLogger;
  return async (text: string): Promise<void> => {
    if (!options.errorChatId) return;
    try {
      await options.sendMessage(options.errorChatId, `🐞 ${text}`);
    } catch (e) {
      log.error("通知 error chat 失敗", e);
    }
  };
}

/** 錯誤 → 單行文字(Error 取 message,其他 String())。router 對 error chat 報障用。 */
export function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
