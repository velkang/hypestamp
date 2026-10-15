import { describe, expect, test } from "bun:test";
import { authorize, createSerialQueue, parseJob } from "./jobs";

describe("authorize", () => {
  test("accepts only the exact bearer token", () => {
    expect(authorize("Bearer s3cret", "s3cret")).toBe(true);
    expect(authorize("Bearer wrong", "s3cret")).toBe(false);
    expect(authorize(null, "s3cret")).toBe(false);
  });
});

describe("parseJob", () => {
  test("accepts the two workflow actions", () => {
    expect(parseJob({ action: "stampEvidence", request: { a: 1 } })).toEqual({ action: "stampEvidence", request: { a: 1 } });
    expect(parseJob({ action: "commitRuleset", ruleset: { b: 2 } })).toEqual({ action: "commitRuleset", ruleset: { b: 2 } });
  });

  test("rejects anything else", () => {
    expect(() => parseJob({ action: "rm -rf" })).toThrow("Unsupported job");
    expect(() => parseJob({ action: "stampEvidence" })).toThrow("Unsupported job");
    expect(() => parseJob("nope")).toThrow("Unsupported job");
  });
});

describe("createSerialQueue", () => {
  test("runs jobs one at a time, spaced by the minimum interval", async () => {
    const started: number[] = [];
    let clock = 0;
    const queue = createSerialQueue({
      minIntervalMs: 30_000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });

    const runs = [1, 2, 3].map((n) =>
      queue.push(async () => {
        started.push(clock);
        clock += 5_000; // each simulation takes 5 s
        return n;
      }),
    );

    expect(await Promise.all(runs)).toEqual([1, 2, 3]);
    expect(started).toEqual([0, 30_000, 60_000]);
  });

  test("keeps going after a failed job", async () => {
    const queue = createSerialQueue({ minIntervalMs: 0, now: () => 0, sleep: async () => {} });
    const failed = queue.push(async () => {
      throw new Error("boom");
    });
    const next = queue.push(async () => "ok");
    expect(failed).rejects.toThrow("boom");
    expect(await next).toBe("ok");
  });
});
