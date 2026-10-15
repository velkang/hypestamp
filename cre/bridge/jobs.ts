import { timingSafeEqual } from "node:crypto";

export type Job = { action: "stampEvidence"; request: unknown } | { action: "commitRuleset"; ruleset: unknown };

export function authorize(header: string | null, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Only the workflow's two actions pass; their payloads are validated again inside
// the workflow (parseStampRequest / parseRuleset).
export function parseJob(body: unknown): Job {
  const job = body as Record<string, unknown> | null;
  if (job?.action === "stampEvidence" && job.request !== undefined) return { action: "stampEvidence", request: job.request };
  if (job?.action === "commitRuleset" && job.ruleset !== undefined) return { action: "commitRuleset", ruleset: job.ruleset };
  throw new Error("Unsupported job");
}

type QueueOptions = { minIntervalMs: number; now: () => number; sleep: (ms: number) => Promise<void> };

// CRE's HTTP trigger fires at most once per 30 s, so jobs run strictly one after
// another with at least minIntervalMs between starts.
export function createSerialQueue({ minIntervalMs, now, sleep }: QueueOptions) {
  let tail: Promise<unknown> = Promise.resolve();
  let lastStart = -Infinity;

  return {
    push<T>(run: () => Promise<T>): Promise<T> {
      const result = tail.then(async () => {
        const wait = lastStart + minIntervalMs - now();
        if (wait > 0) await sleep(wait);
        lastStart = now();
        return run();
      });
      tail = result.catch(() => undefined);
      return result;
    },
  };
}
