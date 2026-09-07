# contracts/voc — 跨語言去重契約(**canonical 就在這裡**)

> **canonical = 本目錄的 `dedup_vectors.json`**,隨 npm 套件 `@pei760730/collector-core` 發布
> (`package.json` 的 `exports` 有這條路徑)。voc 與 TeaBus-VOC 各持一份**手動鏡像 + md5 守門**
> (`tests/test_dedup_canonical_drift.py`),因為 Python 側無法 import npm 套件。

目錄叫 `voc/` 是歷史命名(當初真的是從 voc vendored 進來的),**不要改名** —— `package.json`
的 `exports` 與兩個 Python repo 的守門註解都指著這條路徑。

## 為什麼 canonical 在 TS 側

collector-core 是唯一能被三側都「取得」的載體:TS consumer 直接讀 `node_modules`,
Python 側讀不到 npm,只能鏡像。把 canonical 放在讀得到的那一側,鏡像數才降到最低。

## 改契約的流程(方向是 core → voc / tbvoc)

1. 改**本檔**(`collector-core/contracts/voc/dedup_vectors.json`)。
2. 同一支 PR bump `package.json` version(release gate 擋:`contracts/` 在監看面上),merge 後
   `npm run release` 打 tag。
3. 把新內容**逐位元組**覆蓋到:
   - `pei760730/voc` 的 `contracts/dedup_vectors.json`
   - `pei760730/TeaBus-VOC` 的 `contracts/dedup_vectors.json`
4. 更新兩邊 `tests/test_dedup_canonical_drift.py` 的 `_CANONICAL_MD5`
   (`md5` 前先把 CRLF 正規化成 LF)。
5. 三側 conformance 各自先紅(TS `tests/dedupConformance.test.ts`、Python
   `tests/test_dedup_contract.py`),逼分群邏輯同步。

⚠️ 兩個 Python 守門都是**單向**的:它們比對「自己的鏡像 vs 自己寫死的常數」,**從來沒讀過
canonical 本體**。所以「只改了 canonical、沒同步鏡像」它們照樣綠 —— 步驟 3–4 沒有自動化能替你做。
2026-09-02 與 2026-09-08 各發生過一次(前者 `_note` 漂移,後者 tbvoc 的 pin 釘在自己的舊快照上)。

## 改 `src/pipeline/` 之前

改 `{extractVideoId,groupKey,detectPlatform}.ts` 前先確認不會讓 `dedupConformance` 變紅
(= 與 Python 側分群分叉)。**反過來也成立**:修好 TS 卻沒同步 Python,契約宣稱的
「分群等價」就是假的,而三側測試都不會紅 —— 只有把向量加進 canonical 才逼得出來。

## 這份文件曾經寫反過

2026-07-20 之前這裡寫「canonical 來源 = `pei760730/voc`,方向 voc → core」,還說那份 JSON 是
voc 的 `schema.py` codegen 出來的 —— 兩句都不成立(voc 沒有產生它的 codegen)。而 voc / tbvoc
兩支**會執行的** md5 守門從 2026-09-02 起都寫著 canonical = collector-core。
2026-09-08 依「較新 + 可執行 + 有事故紀錄」把方向定在此,並同步修掉 `dedup_vectors.json`
自己的 `_note`。
