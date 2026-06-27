/**
 * 跨語言去重契約 conformance(TS / core 側)。
 *
 * collector-core 是 TS pipeline 的 SSOT,必須**自己**守住與 voc 的「分群等價」——
 * 不能只靠下游 collector(short-video-bot)在 bump dep 後才測出漂移。
 * 對手檔 = voc `contracts/dedup_vectors.json`,vendored 在 `contracts/voc/`(見該目錄 README)。
 * Python 側由 voc `test_dedup_contract.py` 守同一份;格式(`:` vs `_`)允許不同,只驗分群等價。
 *
 * 改 src/pipeline/{extractVideoId,groupKey,detectPlatform}.ts 而讓本檔變紅 = 與 voc 分叉,先停。
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { groupKey } from "../src/pipeline/groupKey.js";

interface DedupVectors {
  same_group: { name: string; urls: string[] }[];
  distinct: { name: string; urls: string[] }[];
  edge_cases: { name: string; why: string; url: string; expect: "id" | "path" }[];
}

const vectors: DedupVectors = JSON.parse(
  readFileSync(new URL("../contracts/voc/dedup_vectors.json", import.meta.url), "utf8"),
);

// path-fallback key 是砍 query 後的乾淨連結(以 http 開頭);id key 是平台前綴_id。
const isPathKey = (k: string): boolean => k.startsWith("http");

describe("voc 去重契約:same_group 收斂同一 key", () => {
  for (const g of vectors.same_group) {
    it(`「${g.name}」`, () => {
      const keys = new Set(g.urls.map(groupKey));
      expect(keys.size).toBe(1);
    });
  }
});

describe("voc 去重契約:distinct 互不同 key", () => {
  for (const g of vectors.distinct) {
    it(`「${g.name}」`, () => {
      const keys = g.urls.map(groupKey);
      expect(new Set(keys).size).toBe(keys.length);
    });
  }
});

describe("voc 去重契約:edge_cases 的 id/path 預期", () => {
  // 2026-06-27 起所有 edge_case 兩語一致(裸 19 碼抽取已砍除,vt.tiktok 短路徑 TS 與 Python 都退路徑),
  // 不再有「靠展開消弭」的 TS/Python 分歧 → 全部都驗(無 skip)。
  for (const e of vectors.edge_cases) {
    it(`「${e.name}」→ ${e.expect}`, () => {
      const got = isPathKey(groupKey(e.url)) ? "path" : "id";
      expect(got).toBe(e.expect);
    });
  }
});
