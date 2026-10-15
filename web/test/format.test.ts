import { describe, expect, it } from "vitest";
import { relativeTime, shortHash, signed, tradeCode, usdFromE8, utcClock, utcClockSeconds, utcDate } from "../src/lib/format";

describe("format", () => {
  it("shortens hashes to 0x + 4 … 4", () => {
    expect(shortHash("0x2bc412c71ba02e3a7cd1c831ccb5660a33dd33d9b43336940d35984c42d83840")).toBe("0x2bc4…3840");
    expect(shortHash("demo")).toBe("demo");
  });

  it("formats UTC clock times and dates", () => {
    const at = Date.UTC(2026, 9, 15, 14, 46, 36);
    expect(utcClock(at)).toBe("14:46");
    expect(utcClockSeconds(at)).toBe("14:46:36");
    expect(utcDate(at)).toBe("15 Oct 2026");
  });

  it("formats 8-decimal prices as dollars", () => {
    expect(usdFromE8("237148000000")).toBe("$2,371.48");
    expect(usdFromE8("1825000000")).toBe("$18.25");
    expect(usdFromE8(null)).toBe("not filled");
  });

  it("formats trade codes and signed scores", () => {
    expect(tradeCode(2)).toBe("T-002");
    expect(signed(0.7)).toBe("+0.70");
    expect(signed(-0.6)).toBe("−0.60");
  });

  it("describes elapsed time in words", () => {
    const now = 1_000_000_000;
    expect(relativeTime(now - 30_000, now)).toBe("just now");
    expect(relativeTime(now - 2 * 60_000, now)).toBe("2 min ago");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3 h ago");
  });
});
