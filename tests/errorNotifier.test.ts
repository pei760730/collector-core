/**
 * makeErrorNotifier / errText —— collector router 的 notifyError 語意釘住:
 * errorChatId 空 = no-op、🐞 前綴、發送失敗記錄但永不拋出。
 */
import { describe, it, expect } from "vitest";
import { makeErrorNotifier, errText } from "../src/guard/notify.js";

describe("makeErrorNotifier", () => {
  it("errorChatId 空字串 → no-op(不呼叫 sendMessage)", async () => {
    const sent: string[] = [];
    const notify = makeErrorNotifier({
      errorChatId: "",
      sendMessage: async (_id, text) => {
        sent.push(text);
      },
    });
    await notify("有事");
    expect(sent).toHaveLength(0);
  });

  it("有設 errorChatId → 發到該 chat、帶 🐞 前綴", async () => {
    const sends: { chatId: string; text: string }[] = [];
    const notify = makeErrorNotifier({
      errorChatId: "999000999",
      sendMessage: async (chatId, text) => {
        sends.push({ chatId, text });
      },
    });
    await notify("collect 例外:boom");
    expect(sends).toEqual([{ chatId: "999000999", text: "🐞 collect 例外:boom" }]);
  });

  it("發送失敗 → 記 log、不拋出(通知本身不能影響主流程/exit code)", async () => {
    const logged: string[] = [];
    const notify = makeErrorNotifier({
      errorChatId: "999000999",
      sendMessage: async () => {
        throw new Error("network down");
      },
      logger: { error: (m) => logged.push(m) },
    });
    await expect(notify("有事")).resolves.toBeUndefined();
    expect(logged).toEqual(["通知 error chat 失敗"]);
  });
});

describe("errText", () => {
  it("Error → message", () => {
    expect(errText(new Error("boom"))).toBe("boom");
  });

  it("非 Error → String()", () => {
    expect(errText("字串錯誤")).toBe("字串錯誤");
    expect(errText(42)).toBe("42");
    expect(errText(undefined)).toBe("undefined");
  });
});
