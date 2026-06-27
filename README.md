# @pei760730/collector-core

三個短影音收集 collector(short-video-bot / clip-collector / feed-collector)的**共用核心**。Internal use only。

## 為什麼

三個 collector 是同一引擎開三份、各接不同下游(voc / TeaBus-VOC / of-content-engine)。原本 pipeline 修補要手貼三遍、已在漂移。把「全引擎事實一致」的部分抽成這個版本化套件,改一次三邊吃到;per-engine 差異(寫入模型 / schema / dedup / STATUS)留各 collector 的 adapter。

## 內容

- **pipeline**(純函式,無 I/O):`parseMessage` · `cleanUrl` · `detectPlatform` · `extractVideoId` · `groupKey`
- **utils**:`todayIsoTaipei`/`parseSheetDate`/`ageInDays`(Asia/Taipei)· `expandShortUrl` · `logger`
- **adapter 契約**(型別層):`CollectorAdapter` / `EngineSchema` / `Storage` —— direct / staging 用 discriminated union 鎖死,staging 不可塌成 direct
- **`loadEngineSchema(json)`**:把引擎發布的 schema.json 驗證 + 型別化(取代各 repo 手抄鏡像常數)

## 不變式

- 進 core 的東西必須「全引擎事實一致、無 per-engine 語意分歧」。dedup 雙鍵 / byStatus / STATUS sentinel / 平台 fallback 字串等差異一律退回 adapter。
- `groupKey` 帶平台命名空間(`tiktok_…`),跨平台同 id 不撞;格式可與引擎不同,只保證**分群等價**(引擎側 dedup_vectors.json 跨語言守門)。

## 開發

```
npm ci
npm run typecheck
npm test
```

GitHub Packages 私有 registry 發布(`@pei760730` scope)。

## 發版(改 pipeline / 去重規則後)

消費端 sv-bot / clip 透過 git tag pin(`github:pei760730/collector-core#vX.Y.Z`),core 是 git dep、
靠 `prepare`(`npm run build`)在安裝時重建 `dist/`(dist **不進 git**)。發新版:

1. `package.json` 的 `version` bump(例 0.1.3 → 0.1.4),commit。
2. `npm run release`(`scripts/release.mjs`):驗 tree 乾淨 + build + test → 打 annotated tag `v<version>`、push 分支 + tag。**tag 與 version 永遠同步**(舊流程手動脫鉤過、卡過 lock)。
3. sv-bot / clip 把 dep 改 `#v<version>`,**surgical 編輯 `package-lock.json`**(還原 origin/main 全平台 lock,只 sed 換 collector-core 的 git ref + version)。**別在 macOS `rm` 重生 lock** —— 會掉 `@rollup/rollup-linux-x64-gnu` optional dep(npm/cli#4828)→ linux CI 啟動失敗。

> tag 衛生:core PR 多為 squash-merge,tag 會指向 merge 前的分支 commit(內容相同 → dep 解析 OK)。下次改 core 從 main HEAD 重發**新版號**,別接舊 tag commit 繼續長。
