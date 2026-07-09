/**
 * Google Sheets 表頭飄移防護 glue —— 三個 collector 的 storage/googleSheets.ts 原本各自持一份
 * 逐字副本,抽進 core。純函式(不碰 googleapis),欄位對映改「依實際表頭具名解析」:
 * 表頭被重排、前面多一欄(如 legacy `id`)、後面有空欄,都能把值寫到正確的具名欄、讀回也對得上,
 * 而不是因為「順序/長度不完全相等」就把整輪 drain 打掛。唯一仍 fail-fast 的情形 = 某個必要欄
 * 「整個不存在」——那才是真的會錯欄毀資料,寧可停下等人對齊。
 *
 * bot 專屬的欄位常數(STAGING_COLUMNS / POOL_COLUMNS)留各 bot;此處只提供對映機制。
 */

/** 表頭解析結果:每個必要欄的 0-based 欄位索引 + 整列寬度。 */
export interface HeaderLayout {
  indexOf: Record<string, number>;
  width: number;
}

/** 0-based 欄索引 → A1 欄字母(0→A, 25→Z, 26→AA)。 */
export function colLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/**
 * 依「實際表頭」解析每個必要欄的 0-based 索引(純函式,好測)。
 * 必要欄整個缺席 → 丟錯(不錯欄寫入、不默默毀資料);順序/多餘空欄/前置欄都容忍。
 */
export function resolveHeaderIndexes(
  header: readonly unknown[],
  required: readonly string[],
  label: string,
): HeaderLayout {
  const cells = header.map((h) => String(h ?? "").trim());
  const indexOf: Record<string, number> = {};
  const missing: string[] = [];
  const duplicated: string[] = [];
  for (const col of required) {
    const idx = cells.indexOf(col);
    if (idx < 0) {
      missing.push(col);
      continue;
    }
    // 同名必要欄出現多於一次:indexOf 只會靜默綁第一個,寫讀可能各對到不同實體欄
    // (人工複製欄位常見)→ 與缺欄同級 fail-fast,寧可停下等人對齊,不默默錯欄。
    if (cells.indexOf(col, idx + 1) >= 0) {
      duplicated.push(col);
      continue;
    }
    indexOf[col] = idx;
  }
  if (missing.length > 0) {
    throw new Error(
      `${label}表頭缺少必要欄 [${missing.join(",")}],拒絕寫入(避免錯欄毀資料)。` +
        `現有=[${cells.join(",")}] 需要=[${required.join(",")}]。請對齊表頭 schema。`,
    );
  }
  if (duplicated.length > 0) {
    throw new Error(
      `${label}表頭有重複的必要欄 [${duplicated.join(",")}],拒絕寫入(無法判定該綁哪一欄,避免錯欄毀資料)。` +
        `現有=[${cells.join(",")}]。請刪除重複欄後重試。`,
    );
  }
  return { indexOf, width: Math.max(cells.length, required.length) };
}

/** 把一列物件依解析索引排成整列寬度字串陣列(該欄外留空)。 */
export function placeRow(
  row: Record<string, unknown>,
  columns: readonly string[],
  layout: HeaderLayout,
): string[] {
  const cells: string[] = new Array<string>(layout.width).fill("");
  for (const col of columns) {
    const idx = layout.indexOf[col];
    if (idx === undefined) continue; // resolve 階段已保證存在;防禦性
    cells[idx] = String(row[col] ?? "");
  }
  return cells;
}

/** 反向:依解析索引,把實際列的 cell 取回具名欄物件。 */
export function readNamedRow(
  cells: readonly string[],
  columns: readonly string[],
  layout: HeaderLayout,
): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const col of columns) {
    const idx = layout.indexOf[col];
    obj[col] = idx === undefined ? "" : String(cells[idx] ?? "");
  }
  return obj;
}
