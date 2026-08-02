# AGENTS.md — collector-core(Codex 行為規則)

> 雙 AI 艦隊檔:Codex 進場先讀這份;契約細節見 `contracts/` 與 `README.md`。

## 這個 repo 是什麼

`collector`(voc / tbvoc / of 三 target)**唯一消費**的共用核心:純函式 pipeline + utils + drain/guard,git tag pin 發版。

## 紅線(違反即停)

- **消費模型=npm git-tag 依賴**:collector 以 `github:pei760730/collector-core#vX.Y.Z` 直接依賴本 repo(無 vendored 副本)。發版=推 tag → consumer-bump 自動對 collector 開 bump PR(鏈已實證健康,collector PR #87)。
- 「把批次邏輯上移進 core」已由 Kai 拍板 revert(2026-07-25):批次/drain 編排留在 collector,core 只收純函式——**勿再提上移**。
- 改介面先看 `contracts/`;consumer bump 自動化只剩 collector 一支 caller。
- 純函式紀律:core 不碰 I/O / secrets / 平台 API——那些留在 collector 端。

## 驗證

```bash
npm test && npx tsc -p tsconfig.typecheck.json
```

## Codex 通用紀律

分支 `codex/*`;絕不自 merge;宣稱完成前先看到驗證綠;只動被要求的部分。
