import { describe, expect, it } from "vitest";

import { EngineSchemaError, loadEngineSchema } from "../src/schema.js";

const directJson = {
  schemaVersion: "1",
  writeMode: "direct",
  writeTab: "參考池",
  columns: ["平台", "連結", "挑", "加入日期"],
  platformCodes: ["tiktok", "youtube"],
  dedup: { separator: ":" },
};

const stagingJson = {
  schemaVersion: "1",
  writeMode: "staging",
  writeTab: "暫存區",
  columns: ["PLATFORM", "DATE", "CLEAN_URL", "VIDEO_ID", "STATUS", "ERROR_MSG", "WORKER_RUN"],
  platformCodes: ["tiktok", "youtube"],
  dedup: { separator: ":" },
  statusField: {
    column: "STATUS",
    initialValue: "pending_review",
    unsupportedValue: "unsupported",
    reservedColumns: ["ERROR_MSG", "WORKER_RUN"],
  },
  crossTab: { tab: "總表", urlColumn: "影片連結" },
};

describe("loadEngineSchema", () => {
  it("direct schema 型別化(未指定 dateFormat → 預設 iso)", () => {
    const s = loadEngineSchema(directJson);
    expect(s.writeMode).toBe("direct");
    expect(s.columns).toHaveLength(4);
    expect(s.dateFormat).toBe("iso");
  });

  it("staging schema 型別化(含 statusField/crossTab)", () => {
    const s = loadEngineSchema(stagingJson);
    expect(s.writeMode).toBe("staging");
    if (s.writeMode === "staging") {
      expect(s.statusField.initialValue).toBe("pending_review");
      expect(s.statusField.reservedColumns).toContain("WORKER_RUN");
      expect(s.crossTab.tab).toBe("總表");
    }
  });

  it("staging 缺 statusField → 丟錯(型別+runtime 雙保險,不可塌成 direct)", () => {
    const bad: Record<string, unknown> = { ...stagingJson };
    delete bad.statusField;
    expect(() => loadEngineSchema(bad)).toThrow(EngineSchemaError);
  });

  it("未知 writeMode → 丟錯", () => {
    expect(() => loadEngineSchema({ ...directJson, writeMode: "wat" })).toThrow(EngineSchemaError);
  });

  it("缺必要欄(columns/schemaVersion)→ 丟錯", () => {
    expect(() => loadEngineSchema({ writeMode: "direct", writeTab: "x" })).toThrow(EngineSchemaError);
  });

  it("吃得下 voc 實際 schema.json(無 dateFormat、帶 _generated/_note)", () => {
    const vocReal = {
      _generated: "自動產生...",
      schemaVersion: "1",
      writeMode: "direct",
      writeTab: "參考池",
      columns: ["平台", "連結", "挑", "加入日期"],
      platformCodes: ["instagram", "facebook", "youtube", "xiaohongshu", "tiktok", "x", "threads", "douyin"],
      dedup: { separator: ":", namespaced: true, _note: "..." },
    };
    const s = loadEngineSchema(vocReal);
    expect(s.writeMode).toBe("direct");
    expect(s.platformCodes).toContain("tiktok");
    expect(s.platformCodes).not.toContain("bilibili");
  });
});
