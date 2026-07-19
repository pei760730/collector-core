/**
 * @pei760730/collector-core —— 三個短影音收集 collector 的共用核心。
 *
 * 純 pipeline(parse/cleanUrl/detectPlatform/extractVideoId/groupKey)+ utils(date/expandUrl/logger)。
 * per-engine 差異留各 collector 的 adapter。
 *
 * 2026-07-13:`export *` 收斂為具名匯出 —— 星號會把模組內部積木(tidyUrl/cleanNote/
 * isValidHttpUrl 這類 parse 的私有工具)一併凍進公開 API,semver 面被動膨脹。
 * 這裡列的就是公開契約:唯一 consumer pei760730/collector(voc/tbvoc/of 三 target;原 short-video-bot/clip-collector/feed-collector 已於 2026-07-15 #9 併一 archive)
 * 實際 import 的每一個名字都在,新增匯出 = 有意識地擴約(在此顯式加一行)。
 *
 * 註:adapter.ts + schema.ts(staging 統一化預備設計)已於 2026-07-03 解散——PR-7 判不做、
 * 零消費端、「供未來接通」不是保留理由(Step 2:降級≠解散)。真要接通時 git 歷史(≤v0.2.2)就是備份。
 */
export type {
  Platform,
  DetectionMethod,
  ParsedMessage,
  CleanedUrl,
  PlatformInfo,
  VideoIdInfo,
} from "./types.js";
export { PLATFORM_CODE } from "./types.js";
export { parseMessage, NoUrlError, type ParseInput } from "./pipeline/parse.js";
export { cleanUrl, hasShortHost } from "./pipeline/cleanUrl.js";
export {
  detectPlatform,
  PLATFORM_ICON,
  ICON_BY_CODE,
  iconFor,
} from "./pipeline/detectPlatform.js";
export { extractVideoId } from "./pipeline/extractVideoId.js";
export { groupKey, type GroupKeyPrecomputed } from "./pipeline/groupKey.js";
export { TZ, todayIsoTaipei, parseSheetDate, ageInDays } from "./utils/date.js";
export { expandShortUrl } from "./utils/expandUrl.js";
export { logger } from "./utils/logger.js";
export { isTransient, withRetry } from "./utils/retry.js";
export {
  required,
  optional,
  boolEnv,
  enumEnv,
  chatIdsEnv,
  loadGoogleCredentials,
  type GoogleServiceAccountCredentials,
} from "./config/env.js";
export {
  colLetter,
  resolveHeaderIndexes,
  placeRow,
  readNamedRow,
  type HeaderLayout,
} from "./sheets/headerMap.js";
// ── 2026-07-17 上移批次:collector 殼/of 引擎逐字雙份的 target 無關積木(additive)──
export {
  drainUpdates,
  exitCodeFor,
  type DrainableUpdate,
  type DrainableBot,
  type PersistFlag,
  type DrainResult,
  type DrainOptions,
} from "./drain/loop.js";
export {
  makeWhitelistGuard,
  maskId,
  type WhitelistGuard,
  type WhitelistGuardOptions,
  type GuardContext,
  type GuardLogger,
} from "./guard/whitelist.js";
export { makeErrorNotifier, errText, type ErrorNotifierOptions } from "./guard/notify.js";
export { makeSerializer } from "./utils/serialize.js";
export { oncePromise } from "./utils/once.js";
export { capList, clipTelegramText } from "./utils/text.js";
