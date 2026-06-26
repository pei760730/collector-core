/**
 * loadEngineSchema —— 把引擎 schema.json(已 JSON.parse 的物件)驗證 + 型別化成 EngineSchema。
 *
 * 取代各 collector 手抄鏡像常數(POOL_COLUMNS / contract.test.ts):collector buildtime 嵌入引擎
 * 發布的 schema.json,過這支驗證後拿到型別化 schema。staging 缺 statusField/crossTab 直接丟錯
 * (型別 + runtime 雙保險,確保 staging 不可塌成 direct)。
 */
import type { DirectSchema, EngineSchema, StagingSchema } from "./adapter.js";

export class EngineSchemaError extends Error {}

function obj(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null) {
    throw new EngineSchemaError(`${where} 必須是物件`);
  }
  return v as Record<string, unknown>;
}

function reqString(o: Record<string, unknown>, field: string, where = "schema"): string {
  const v = o[field];
  if (typeof v !== "string" || v === "") {
    throw new EngineSchemaError(`${where}.${field} 必須是非空字串`);
  }
  return v;
}

function strArray(v: unknown, where: string): readonly string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
    throw new EngineSchemaError(`${where} 必須是 string[]`);
  }
  return v as readonly string[];
}

export function loadEngineSchema(input: unknown): EngineSchema {
  const o = obj(input, "schema");
  const dedup = o.dedup === undefined ? {} : obj(o.dedup, "schema.dedup");
  const base = {
    schemaVersion: reqString(o, "schemaVersion"),
    writeTab: reqString(o, "writeTab"),
    columns: strArray(o.columns, "schema.columns"),
    platformCodes: strArray(o.platformCodes, "schema.platformCodes"),
    // 引擎 schema.json 未指定時預設 iso(voc/TeaBus-VOC 都是 ISO YYYY-MM-DD)。
    dateFormat: (o.dateFormat === "ymd_slash" ? "ymd_slash" : "iso") as "iso" | "ymd_slash",
  };
  const separator = typeof dedup.separator === "string" ? dedup.separator : ":";

  if (o.writeMode === "direct") {
    return { ...base, writeMode: "direct", dedup: { separator } } satisfies DirectSchema;
  }
  if (o.writeMode === "staging") {
    const sf = obj(o.statusField, "schema.statusField");
    const ct = obj(o.crossTab, "schema.crossTab");
    return {
      ...base,
      writeMode: "staging",
      dedup: { separator },
      statusField: {
        column: reqString(sf, "column", "schema.statusField"),
        initialValue: reqString(sf, "initialValue", "schema.statusField"),
        unsupportedValue: reqString(sf, "unsupportedValue", "schema.statusField"),
        reservedColumns: strArray(
          sf.reservedColumns ?? [],
          "schema.statusField.reservedColumns",
        ),
      },
      crossTab: {
        tab: reqString(ct, "tab", "schema.crossTab"),
        urlColumn: reqString(ct, "urlColumn", "schema.crossTab"),
      },
    } satisfies StagingSchema;
  }
  throw new EngineSchemaError(`未知 writeMode: ${String(o.writeMode)}(必須 direct|staging)`);
}
