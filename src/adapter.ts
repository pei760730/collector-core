/**
 * collector adapter 契約(型別層)。
 *
 * @experimental 預備設計,目前無消費端、未從 index.ts 對外 export(見 index.ts 註)。staging
 * 統一化接通前不算公開契約;改動不視為 breaking。
 *
 * core 只提供「全引擎事實一致」的純 pipeline + runtime;per-engine 差異(寫入模型 / schema 欄位 /
 * dedup / STATUS)一律收斂在各 collector 的 adapter,實作這份契約。
 *
 * 兩種寫入模型用 discriminated union(`writeMode`)在型別層鎖死:
 *   - direct  : 直寫參考池(voc / TeaBus-VOC)。
 *   - staging : 暫存區 pending_review + 跨分頁去重(of-content-engine)。staging 結構上不可塌成 direct。
 */

// ── EngineSchema(由引擎 schema.json 灌入,非手抄)─────────────────────────
export interface BaseSchema {
  /** 對齊引擎 schema.json,獨立於 core 套件版本(collector 新鮮度斷言用)。 */
  schemaVersion: string;
  /** 寫入分頁名。 */
  writeTab: string;
  /** writeTab 表頭順序(具名解析的依據)。 */
  columns: readonly string[];
  /** 可出現在「平台」欄的碼集合,SSoT = 引擎 normalize._PLATFORM_RULES。 */
  platformCodes: readonly string[];
  /** adapter 格式化加入日期用(core 只給 tz 部件)。 */
  dateFormat: "iso" | "ymd_slash";
}

export interface DirectSchema extends BaseSchema {
  writeMode: "direct";
  dedup: { separator: string };
}

export interface StagingSchema extends BaseSchema {
  writeMode: "staging";
  dedup: { separator: string };
  /** staging 結構上一定有 STATUS 狀態機 → 型別保證不可收斂成 direct。 */
  statusField: {
    column: string;
    initialValue: string;
    unsupportedValue: string;
    /** 寫入時留空的保留欄(如 ERROR_MSG / WORKER_RUN)。 */
    reservedColumns: readonly string[];
  };
  /** 只讀去重表(總表),不 ensureHeader。 */
  crossTab: { tab: string; urlColumn: string };
}

export type EngineSchema = DirectSchema | StagingSchema;

// ── Draft:純寫入欄位(不含 note;display 走 ReplyContext)──────────────────
export interface Draft {
  /** 已轉碼的平台(小寫)。 */
  platform: string;
  cleanUrl: string;
  /** 帶前綴的 video id(adapter 注入 prefix);unsupported 時為引擎的 sentinel。 */
  videoId: string;
  unsupported: boolean;
  /** adapter 依 schema.dateFormat 格式化後的字串。 */
  addedDate: string;
}

export interface ReplyContext {
  /** 僅 bot 回覆模板用,不寫入。 */
  note: string;
}

// ── Storage:discriminated union(staging 方法 required,非 optional 堆疊)──
export interface StoredRow {
  row: Record<string, string>;
  rowNumber: number;
}

export interface DirectStorage {
  kind: "direct";
  /** 依 schema.columns 具名解析;必要欄整個缺席才 fail-fast。 */
  ensureHeader(): Promise<void>;
  /** core 已投影成 columns 順序的字串陣列。 */
  append(row: readonly string[]): Promise<void>;
  readRows(): Promise<StoredRow[]>;
  stats(opts: { recentLimit: number; nowMs: number }): Promise<DirectStats>;
}

export interface StagingStorage {
  kind: "staging";
  /** 只對 writeTab(暫存區),不對總表。 */
  ensureHeader(): Promise<void>;
  append(row: readonly string[]): Promise<void>;
  readRows(): Promise<StoredRow[]>;
  updateRow(rowNumber: number, row: readonly string[]): Promise<void>;
  findByVideoId(videoId: string): Promise<StoredRow | null>;
  /** 讀總表(唯讀)判斷是否已產出。 */
  findApprovedByUrl(cleanUrl: string): Promise<{ row: Record<string, string> } | null>;
  stats(opts: { recentLimit: number; nowMs: number }): Promise<StagingStats>;
}

export interface DirectStats {
  total: number;
  byPlatform: Record<string, number>;
  thisWeek: number;
  thisMonth: number;
  recent: unknown[];
}
export interface StagingStats extends DirectStats {
  /** staging-only 維度。 */
  byStatus: Record<string, number>;
}

// ── 寫入模型:discriminated union ─────────────────────────────────────────
export type WriteModel =
  | {
      kind: "direct";
      /** partial map;core 投影成 columns 順序。 */
      toRow(draft: Draft): Record<string, string>;
      /** = core.groupKey(url)。 */
      groupKey(url: string): string;
    }
  | {
      kind: "staging";
      toRow(draft: Draft, status: string): Record<string, string>;
      /** = draft.videoId(adapter 一行,不進 core)。 */
      stagingKey(draft: Draft): string;
      /** = core.cleanUrlExact(url)(byte-exact)。 */
      crossTabKey(url: string): string;
      /** read→decide→write:core 編排、adapter 決策。 */
      decide(input: {
        draft: Draft;
        pendingHit: StoredRow | null;
        approvedHit: { row: Record<string, string> } | null;
      }): { action: "append" | "skip" | "update"; rowNumber?: number; status?: string };
    };

// ── collector 唯一要提供的物件(generic over kind 綁定 schema/storage/write 一致)──
export type CollectorAdapter =
  | {
      kind: "direct";
      schema: DirectSchema;
      write: Extract<WriteModel, { kind: "direct" }>;
      makeStorage(): DirectStorage;
      buildDraft(input: { rawUrl: string; now: () => number }): {
        draft: Draft;
        reply: ReplyContext;
      };
    }
  | {
      kind: "staging";
      schema: StagingSchema;
      write: Extract<WriteModel, { kind: "staging" }>;
      makeStorage(): StagingStorage;
      buildDraft(input: { rawUrl: string; now: () => number }): {
        draft: Draft;
        reply: ReplyContext;
      };
    };
