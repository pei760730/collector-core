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

> ⚠️ **lock 的 resolved 是 commit hash,不是 tag。**
> **觸發條件:** 消費端 bump core 版本、或任何「sed 換 `#vX.Y.Z`」式的 git-dep 升版。
> **教訓:** 只換 spec 字串時 resolved 仍釘舊 commit,`npm ci` 會**靜默裝舊版且 CI 全綠**(npm 不離線驗 tag↔hash)。bump 必須連 resolved hash(新 tag 的 commit)+ lock 內 version 一起換,並以「`npm ci` 後實裝 version === spec tag」驗收。
> **證據:** 2026-07-04 三消費端 spec=`#v0.2.2`、lock resolved=`95429dc`(v0.2.1)、生產 collect.yml 實跑 v0.2.1(svb #49 / clip #29 / feed #28 三 PR 同型)。
> **失效/複審條件:** 三消費端 CI 都上了「宣稱==實裝」守門後,此條降級為背景說明;若日後改回 registry 發行(publish 鏈復活),此條整段作廢。

> tag 衛生:core PR 多為 squash-merge,tag 會指向 merge 前的分支 commit(內容相同 → dep 解析 OK)。下次改 core 從 main HEAD 重發**新版號**,別接舊 tag commit 繼續長。
