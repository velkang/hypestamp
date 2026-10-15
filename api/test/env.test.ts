import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/env";

const valid = {
  TWITTERAPI_KEY: "tw",
  OPENAI_API_KEY: "sk",
  BRIDGE_URL: "http://127.0.0.1:8789",
  BRIDGE_TOKEN: "bt",
  SEPOLIA_RPC_URL: "https://ethereum-sepolia-rpc.publicnode.com",
  LEDGER_ADDRESS: "0xaB3B70984e300f48Cd3523b15170dDe2A6ad0018",
  LEDGER_START_BLOCK: "11920600",
};

describe("parseEnv", () => {
  it("accepts a complete configuration and parses the start block", () => {
    expect(parseEnv(valid)).toMatchObject({ ...valid, LEDGER_START_BLOCK: 11_920_600n });
  });

  it("names every missing or invalid variable without echoing secret values", () => {
    expect(() => parseEnv({ ...valid, OPENAI_API_KEY: "", LEDGER_ADDRESS: "0x123" })).toThrow(
      /OPENAI_API_KEY.*LEDGER_ADDRESS|LEDGER_ADDRESS.*OPENAI_API_KEY/s,
    );
    try {
      parseEnv({ ...valid, BRIDGE_URL: "not a url" });
    } catch (error) {
      expect(String(error)).not.toContain("sk");
    }
  });
});
