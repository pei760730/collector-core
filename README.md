# @pei760730/collector-core

三個短影音收集 collector(short-video-bot / clip-collector / feed-collector)的**共用核心**。Internal use only。

## 為什麼

三個 collector 是同一引擎開三份、各接不同下游(voc / TeaBus-VOC / of-content-engine)。原本 pipeline 修補要手貼三遍、已在漂移。把「全引擎事實一致」的部分抽成這個版本化套件,改一次三邊吃到;per-engine 差異(寫入模型 / schema / dedup / STATUS)留各 collector 的 adapter。

## 內容

- **pipeline**(純函式,無 I/O):`parseMessage` · `cleanUrl` · `detectPlatform` · `extractVideoId` · `groupKey`
- **utils**:`todayIsoTaipei`/`parseSheetDate`/`ageInDays`(Asia/Taipei)· `expandShortUrl` · `logger`

> adapter 契約 / `loadEngineSchema`(staging 統一化預備設計)已於 2026-07-03 解散:PR-7 判不做、零消費端。要復活從 git 歷史(≤v0.2.2)撈。

## 不變式

- 進 core 的東西必須「全引擎事實一致、無 per-engine 語意分歧」。dedup 雙鍵 / byStatus / STATUS sentinel / 平台 fallback 字串等差異一律退回 adapter。
- `groupKey` 帶平台命名空間(`tiktok_…`),跨平台同 id 不撞;格式可與引擎不同,只保證**分群等價**(引擎側 dedup_vectors.json 跨語言守門)。

## 開發

```
npm ci
npm run typecheck
npm test
```

消費端全走 git dep(tag pin),不經 registry — GitHub Packages publish 鏈已於 2026-07-03 解散(零安裝者)。

## 發版(改 pipeline / 去重規則後)

消費端 sv-bot / clip / feed 透過 git tag pin(`github:pei760730/collector-core#vX.Y.Z`),core 是 git dep、
靠 `prepare`(`npm run build`)在安裝時重建 `dist/`(dist **不進 git**)。發新版:

1. `package.json` 的 `version` bump(例 0.1.3 → 0.1.4),commit。
2. `npm run release`(`scripts/release.mjs`):驗 tree 乾淨 + build + test → 打 annotated tag `v<version>`、push 分支 + tag。**tag 與 version 永遠同步**(舊流程手動脫鉤過、卡過 lock)。
3. sv-bot / clip / feed 把 dep 改 `#v<version>`,**surgical 編輯 `package-lock.json`**(還原 origin/main 全平台 lock,只 sed 換 collector-core 的 git ref + version)。**別在 macOS `rm` 重生 lock** —— 會掉 `@rollup/rollup-linux-x64-gnu` optional dep(npm/cli#4828)→ linux CI 啟動失敗。
   **本步已自動化(2026-07-06)**:三消費端各有 `.github/workflows/core-bump.yml` 每日 cron 呼叫本 repo 的 reusable workflow `consumer-bump.yml`(bump 邏輯 SSOT 在 core,消費端只放薄 caller)——偵測新 tag → surgical 編輯 → npm ci 反向驗證宣稱==實裝 → 自動開 bump PR(body 附 resolved sha)+ dispatch 消費端 CI + kai-notify 通知;**merge 仍等 owner 授權**。日常發版後不必手動 bump;急件或 cron 被節流時到消費 repo `gh workflow run core-bump.yml` 手動觸發。

> 背景說明(2026-07-04 事故,已由 CI 守門封死):lock 的 `resolved` 是 **commit hash,不是 tag** —— 只換 spec 字串時 `npm ci` 會靜默裝舊版且全綠(svb #49 / clip #29 / feed #28 三邊同型實證)。所以步驟 3 的 surgical 編輯必須 spec、lock 的 resolved(新 tag 的 commit)、lock 內 version 三處一起換。此不變式現由三消費端 CI 的「宣稱==實裝」守門機器強制(svb / clip / feed 各自 `ci.yml`,2026-07-04 上線、紅→綠反向驗證)—— 漏改會在 PR 直接紅,不靠執行者記得。若日後改回 registry 發行(publish 鏈復活),本段作廢。

> tag 衛生:core PR 多為 squash-merge,tag 會指向 merge 前的分支 commit(內容相同 → dep 解析 OK)。下次改 core 從 main HEAD 重發**新版號**,別接舊 tag commit 繼續長。
