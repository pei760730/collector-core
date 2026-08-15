# AGENTS.md — collector-core(Codex 行為規則)

> 雙 AI 艦隊檔:Codex 進場先讀這份;契約細節見 `contracts/` 與 `README.md`。

## 這個 repo 是什麼

`collector`(voc / tbvoc / of 三 target)**唯一消費**的共用核心:純函式 pipeline + utils + drain/guard,git tag pin 發版。

## 紅線(違反即停)

- **消費模型=npm git-tag 依賴**:collector 以 `github:pei760730/collector-core#vX.Y.Z` 直接依賴本 repo(無 vendored 副本)。發版=推 tag → consumer-bump 自動對 collector 開 bump PR(鏈已實證健康,collector PR #87)。
- 「把批次邏輯上移進 core」已由 Kai 拍板 revert(2026-07-25):批次/drain 編排留在 collector,core 只收純函式——**勿再提上移**。
- 改介面先看 `contracts/`;新增/刪除匯出必須同步改 `tests/publicApi.test.ts` 的匯出面快照(擴約要是有意識的一行 diff);consumer bump 自動化只剩 collector 一支 caller。
- 純函式紀律:pipeline(parse / cleanUrl / detectPlatform / extractVideoId / groupKey)**必須**零 I/O、零副作用。Telegram / Sheets / 平台 API 的呼叫一律留在 collector 端。
  core 現存的 I/O **只有兩處,都是刻意的**,別照「core 完全不碰 I/O」的舊說法去砍:
  - `expandShortUrl` —— HEAD/GET 跟隨轉址。必須在 core,因為短鏈不展開就與長鏈算出不同去重 key(漏去重);opt-in(`EXPAND_SHORT_URLS`)、fail-soft(失敗沿用原網址)、不碰憑證。
  - `loadGoogleCredentials` —— `readFileSync` 讀 service account 檔。只做「載入 + 驗形狀」,不呼叫任何 Google 服務。
  除這兩處外要在 core 新增任何網路/檔案 I/O,先問 owner。

## 驗證

```bash
npm test && npx tsc -p tsconfig.typecheck.json
```

## Codex 通用紀律

分支 `codex/*`;絕不自 merge;宣稱完成前先看到驗證綠;只動被要求的部分。
