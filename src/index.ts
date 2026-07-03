/**
 * @pei760730/collector-core —— 三個短影音收集 collector 的共用核心。
 *
 * 純 pipeline(parse/cleanUrl/detectPlatform/extractVideoId/groupKey)+ utils(date/expandUrl/logger)。
 * per-engine 差異留各 collector 的 adapter。
 *
 * 註:adapter.ts + schema.ts(staging 統一化預備設計)已於 2026-07-03 解散——PR-7 判不做、
 * 零消費端、「供未來接通」不是保留理由(Step 2:降級≠解散)。真要接通時 git 歷史(≤v0.2.2)就是備份。
 */
export * from "./types.js";
export * from "./pipeline/parse.js";
export * from "./pipeline/cleanUrl.js";
export * from "./pipeline/detectPlatform.js";
export * from "./pipeline/extractVideoId.js";
export * from "./pipeline/groupKey.js";
export * from "./utils/date.js";
export * from "./utils/expandUrl.js";
export * from "./utils/logger.js";
export * from "./utils/retry.js";
