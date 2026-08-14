import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "../src/utils/logger.js";

const savedLevel = process.env.LOG_LEVEL;

afterEach(() => {
  if (savedLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = savedLevel;
  vi.restoreAllMocks();
});

describe("logger level 與輸出路由", () => {
  it("預設 info：debug 靜默、info 會輸出", () => {
    delete process.env.LOG_LEVEL;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.debug("hidden");
    logger.info("visible");
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain("INFO visible");
  });

  it("error 使用 console.error，不落到一般 log", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.error("boom");
    expect(error).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });
});
