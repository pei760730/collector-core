# AGENTS.md — collector-core(Codex 行為規則)

> 雙 AI 艦隊檔:Codex 進場先讀這份;契約細節見 `contracts/` 與 `README.md`。

## 這個 repo 是什麼

`collector`(voc / tbvoc / of 三 target)**唯一消費**的共用核心:純函式 pipeline + utils + drain/guard,git tag pin 發版。

## 紅線(違反即停)

- **vendored=正本**:collector 內的 vendored core 是正本、本 repo 隨發版同步;「把批次邏輯上移進 core」已由 Kai 拍板 revert(2026-07-25),**勿再提上移**。
- 發版走 git tag;consumer bump 自動化只剩 collector 一支 caller,改介面先看 `contracts/`。
- 純函式紀律:core 不碰 I/O / secrets / 平台 API——那些留在 collector 端。

## 驗證

```bash
npm test && npx tsc -p tsconfig.typecheck.json
```

## Codex 通用紀律

分支 `codex/*`;絕不自 merge;宣稱完成前先看到驗證綠;只動被要求的部分。
