/**
 * /stats 文字積木 —— 自 collector 上移(#9 三併一後殼 src/bot/handlers/stats.ts 與
 * vendored of 引擎 src/engines/of/bot/handlers/stats.ts 逐字雙份;target 無關 → 收進 core)。
 */

/**
 * 計數表 → 排行行陣列,限筆數 —— 避免亂資料把分類撐爆(Telegram 單則 4096 字上限)。
 * 依計數 desc 排序,取前 max 行(`  <key><sep><count>`),超出補一行「  …(其餘 N 類)」。
 * sep 預設 = 殼(voc/tbvoc)全形冒號;of 引擎現行為半形 ":",採用時注入保留分岔。
 */
export function capList(counts: Record<string, number>, max = 15, sep = "："): string[] {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const head = entries.slice(0, max).map(([k, n]) => `  ${k}${sep}${n}`);
  if (entries.length > max) head.push(`  …(其餘 ${entries.length - max} 類)`);
  return head;
}

/**
 * Telegram 單則上限 4096;保險在 3900 硬切。
 * 用 code point 切([...s]),避免 String.slice 把 emoji 的 surrogate pair 切一半吐出壞字
 * (孤兒 surrogate 會讓 Telegram sendMessage 回 400)。
 * 逐字保留 collector 語意:門檻比對用 UTF-16 長度(s.length)、切割用 code point。
 */
export function clipTelegramText(s: string, limit = 3900): string {
  return s.length > limit ? [...s].slice(0, limit).join("") + "\n…(已截斷)" : s;
}
