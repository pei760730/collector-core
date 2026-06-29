/**
 * @pei760730/collector-core —— 三個短影音收集 collector 的共用核心。
 *
 * 純 pipeline(parse/cleanUrl/detectPlatform/extractVideoId/groupKey)+ utils(date/expandUrl/logger)。
 * per-engine 差異留各 collector 的 adapter。
 *
 * 註:adapter.ts(寫入模型 discriminated union)+ schema.ts(loadEngineSchema)為 staging 統一化的
 * **預備設計,目前無任何消費端**(svb/clip 各自本地定義 EngineSchema、of-content-engine 未依賴 core;
 * staging pipeline 抽取 PR-7 已判定不做)。為免看似生效中的公開契約,2026-06-29 移出主 export 表面;
 * 檔案與單元測試保留供未來接通,需要時直接 `import` 自 `./adapter.js` / `./schema.js`。
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
