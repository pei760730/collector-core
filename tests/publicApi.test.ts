import { describe, expect, expectTypeOf, it } from "vitest";

import * as core from "../src/index.js";
import type {
  CleanedUrl,
  DetectionMethod,
  GoogleServiceAccountCredentials,
  HeaderLayout,
  ParseInput,
  ParsedMessage,
  Platform,
  PlatformInfo,
  VideoIdInfo,
} from "../src/index.js";

/**
 * 公開 API 面的**機制型**守門(2026-08-15)。
 *
 * index.ts 的檔頭寫著「新增匯出 = 有意識地擴約」,但在此之前那條規則只靠註解 + 人記得 ——
 * 本檔只驗了 groupKey / PLATFORM_CODE 兩個名字,多匯出一個內部積木不會有任何東西變紅。
 * 改成「完整名單快照」:增刪匯出必須同步改這份名單,擴約/縮約變成 PR diff 上看得見的一行,
 * 而不是某次重構的副作用。core 是 git tag pin 發版,消費端(collector 四 target)一但
 * import 了某個名字,砍掉就是它下次 bump 直接編譯失敗 —— 這面該有 CI 擋。
 */
const EXPECTED_VALUE_EXPORTS = [
  "ICON_BY_CODE",
  "NoUrlError",
  "PLATFORM_CODE",
  "PLATFORM_ICON",
  "TZ",
  "ageInDays",
  "boolEnv",
  "chatIdsEnv",
  "cleanUrl",
  "colLetter",
  "detectPlatform",
  "enumEnv",
  "expandShortUrl",
  "extractVideoId",
  "groupKey",
  "hasShortHost",
  "iconFor",
  "isTransient",
  "loadGoogleCredentials",
  "logger",
  "optional",
  "parseMessage",
  "parseSheetDate",
  "placeRow",
  "readNamedRow",
  "required",
  "resolveHeaderIndexes",
  "todayIsoTaipei",
  "withRetry",
] as const;

describe("公開 API 面快照", () => {
  it("執行期匯出名單與快照逐字相同(增刪匯出必須同步改本檔)", () => {
    expect(Object.keys(core).sort()).toEqual([...EXPECTED_VALUE_EXPORTS]);
  });

  it("型別匯出面維持存在(編譯期守門;typecheck 會跑 tests/)", () => {
    // 型別在執行期不存在,靠 typecheck 這關守:任一型別被誤刪 → 這裡編不過。
    expectTypeOf<Platform>().not.toBeNever();
    expectTypeOf<DetectionMethod>().not.toBeNever();
    expectTypeOf<ParsedMessage>().not.toBeNever();
    expectTypeOf<ParseInput>().not.toBeNever();
    expectTypeOf<CleanedUrl>().not.toBeNever();
    expectTypeOf<PlatformInfo>().not.toBeNever();
    expectTypeOf<VideoIdInfo>().not.toBeNever();
    expectTypeOf<GoogleServiceAccountCredentials>().not.toBeNever();
    expectTypeOf<HeaderLayout>().not.toBeNever();
  });

  it("groupKey 只收單一參數(預計算 overload 已於 2026-08-15 刪除,零消費端)", () => {
    expect(core.groupKey.length).toBe(1);
  });
});

describe("平台顯示契約", () => {
  it("平台顯示名、小寫碼與圖示維持完整映射", () => {
    expect(core.PLATFORM_CODE).toEqual({
      TikTok: "tiktok",
      YouTube: "youtube",
      Facebook: "facebook",
      Instagram: "instagram",
      Threads: "threads",
      X: "x",
      抖音: "douyin",
      小紅書: "xiaohongshu",
      Unknown: "unknown",
    });
    expect(core.PLATFORM_ICON.YouTube).toBe("📺");
    expect(core.iconFor("youtube")).toBe("📺");
    expect(core.iconFor("not-a-platform")).toBe("•");
  });
});
