# contracts/voc — vendored 的 voc 跨語言契約

> **canonical 來源 = `pei760730/voc` 的 `contracts/dedup_vectors.json`**(private repo,由 voc `schema.py` + `normalize.py` codegen)。
> 這裡是 **vendored 副本**:collector-core 是 TS pipeline 的 SSOT,必須**自己**對這份契約跑 conformance(`tests/dedupConformance.test.ts`),不能只靠下游 collector(pei760730/collector,voc/tbvoc/of 三 target)在 bump dep 後才測出漂移。

## 為什麼 vendor

voc 是 private,collector-core 無法在 CI 跨 repo 抓檔。沿用當初 collector(原 short-video-bot)既有做法(它把同一份 vendored 到自己的 `contracts/voc/`)。

## 何時要重新 vendor

voc 的去重規則 / 平台規則改動 → voc 先更新它的 `contracts/dedup_vectors.json`(兩邊測試會先紅)→ 把新版覆蓋到這裡 → core 的 conformance 重跑確認分群等價。

改 core 的 `src/pipeline/{extractVideoId,groupKey,detectPlatform}.ts` 前,先確認不會讓 conformance 變紅(= 與 voc 分群分叉)。
