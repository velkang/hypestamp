import { describe, expect, test } from "bun:test";
import { initWorkflow } from "./main";
import { toTweetFields } from "./verify-tweets";

describe("initWorkflow", () => {
  test("registers a single HTTP-triggered handler", () => {
    expect(initWorkflow()).toHaveLength(1);
  });
});

describe("toTweetFields", () => {
  test("keeps only the stable fields and the author's handle", () => {
    const fields = toTweetFields({
      id: "1",
      text: "gm",
      createdAt: "Thu Oct 15 03:39:15 +0000 2026",
      author: { userName: "VitalikButerin" },
    });
    expect(fields).toEqual({ id: "1", author: "VitalikButerin", text: "gm", createdAt: "Thu Oct 15 03:39:15 +0000 2026" });
  });

  test("rejects a deleted tweet that comes back empty", () => {
    expect(() => toTweetFields({ id: "", text: "", createdAt: "", author: null })).toThrow("Tweet not found");
  });
});
