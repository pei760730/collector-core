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
