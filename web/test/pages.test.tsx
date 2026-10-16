import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sourceStats } from "../src/features/sources/sourceStats";
import { feed, NOW, rulesetDetail, tradeDetail, trades } from "./helpers/fixtures";
import { renderAt } from "./helpers/render";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Overview", () => {
  it("leads with the commitment, then proof, trades and flags", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Rules were locked on-chain before any trade" })).toBeInTheDocument();
    expect(await screen.findByText("T-001 matches its stamp")).toBeInTheDocument();
    expect(screen.getByText(/Demo data\./)).toBeInTheDocument();
    expect(await screen.findByText("No disclosure marker found")).toBeInTheDocument();
    expect(screen.getByText("No stamp for T-002")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Posts from 2 sources/ })).toBeInTheDocument();
  });

  it("explains that nothing trades before a ruleset is in force", async () => {
    renderAt("/", { "/v1/status": { activeRuleset: null, demo: false, trades: { submitted: 0, stamped: 0, failed: 0 } }, "/v1/feed": { window: null, posts: [] }, "/v1/trades": [] });
    expect(await screen.findByText(/No ruleset is in force yet/)).toBeInTheDocument();
    expect(await screen.findByText("No trades yet")).toBeInTheDocument();
    expect(screen.queryByText(/Demo data\./)).not.toBeInTheDocument();
  });
});

describe("Trades", () => {
  it("lists every trade with its stamp status", async () => {
    renderAt("/trades");
    const table = await screen.findByRole("table");
    expect(within(table).getByText("T-001")).toBeInTheDocument();
    expect(within(table).getByText("Not stamped")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filter trades" })).not.toBeInTheDocument();
  });

  it("shows closed position P&L without claiming replay has passed", async () => {
    renderAt("/trades", { "/v1/trades": [{ ...trades[1], closedAt: NOW, pnl: { returnPct: -9, bookContributionPct: -0.3825 } }] });
    expect(await screen.findByText("Closed · entry stamped")).toBeInTheDocument();
    expect(screen.getByText("−9.00%")).toBeInTheDocument();
    expect(screen.queryByText(/replay verified/)).not.toBeInTheDocument();
  });

  it("shows an actionable error when the API fails", async () => {
    renderAt("/trades", { "/v1/trades": new Error("internal error") });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load trades: internal error. Check that the API Worker is running, then refresh.");
  });
});

describe("Trade evidence", () => {
  it("shows the replay verdict, its four checks, the reasoning, cited posts and record", async () => {
    renderAt("/trades/1");
    expect(await screen.findByRole("heading", { name: "Replay matches the on-chain record" })).toBeInTheDocument();
    for (const check of ["Ruleset JSON matches its committed hash", "Signal reproduces from saved posts", "Stamp request rebuilds identically", "Bundle hash matches the ledger"]) {
      expect(screen.getByText(check)).toBeInTheDocument();
    }
    expect(screen.getByText(/trust 1.70 >= 1.3/)).toBeInTheDocument();
    expect(screen.getByText("Rotating into ETH here.")).toBeInTheDocument();
    expect(screen.getByText("demo data, no transaction")).toBeInTheDocument();
  });

  it("shows closed position prices, exit reason and realized P&L", async () => {
    renderAt("/trades/1", { "/v1/trades/1": {
      ...tradeDetail, closedAt: NOW, exitPriceE8: "284577600000", exitPriceAt: NOW - 1000,
      exitReason: "take-profit", pnl: { returnPct: 20, bookContributionPct: 0.85 },
    } });
    expect(await screen.findByRole("heading", { name: "Closed paper position" })).toBeInTheDocument();
    expect(screen.getByText("$2,845.78 · Take profit")).toBeInTheDocument();
    expect(screen.getByText("+20.00%")).toBeInTheDocument();
    expect(screen.getByText("+0.85 percentage points")).toBeInTheDocument();
    expect(screen.getByText(/recorded off-chain/)).toBeInTheDocument();
  });

  it("explains a stamp timeout without claiming a ledger refusal", async () => {
    renderAt("/trades/1", { "/v1/trades/1": { ...tradeDetail, status: "failed", failureReason: "stamp-timeout" } });
    expect(await screen.findByText("No matching stamp found within 30 minutes")).toBeInTheDocument();
    expect(screen.queryByText("Refused by the ledger")).not.toBeInTheDocument();
  });

  it("reports an unknown trade", async () => {
    renderAt("/trades/99");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't load this trade: not found/);
  });
});

describe("Rulesets", () => {
  it("shows the ruleset in force, its verified hash and the rules in plain language", async () => {
    renderAt("/rulesets");
    expect(await screen.findByText("JSON hashes to its on-chain ID")).toBeInTheDocument();
    expect(screen.getByText("In force")).toBeInTheDocument();
    expect(screen.getByText(/If both directions qualify, no trade/)).toBeInTheDocument();
    expect(screen.getByText(/"minTrustSum": 1.3/)).toBeInTheDocument();
  });
});

describe("Sources", () => {
  it("tallies each source and shows a source's posts when selected", async () => {
    renderAt("/sources");
    const table = await screen.findByRole("table");
    const hayes = within(table).getByRole("row", { name: /@CryptoHayes/ });
    expect(within(hayes).getAllByRole("cell").map((c) => c.textContent)).toEqual(["0.8", "2", "1", "0", "1", "1", "1 h ago"]);

    await userEvent.click(within(table).getByRole("button", { name: "@CryptoHayes" }));
    expect(screen.getByRole("heading", { name: "Posts from @CryptoHayes" })).toBeInTheDocument();
    expect(screen.getByText("promotion · no disclosure marker")).toBeInTheDocument();
  });
});

describe("Reports", () => {
  it("renders the evidence report with its verdict stamp and findings", async () => {
    renderAt("/reports");
    expect(await screen.findByText("0 MISMATCHES")).toBeInTheDocument();
    expect(screen.getByText(/1 practice trade was stamped on-chain/)).toBeInTheDocument();
    expect(screen.getByText(/1 trade submission has no matching stamp recorded/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Download JSON/ })).toHaveAttribute("href", "/v1/reports/compliance");
  });
});

describe("sourceStats", () => {
  it("counts posts, calls, undisclosed promotion and citations per source, case-insensitively", () => {
    const stats = sourceStats([{ handle: "Cobie", trustWeight: 0.9 }, { handle: "nobody", trustWeight: 0.1 }], feed.posts);
    expect(stats[0]).toEqual({ handle: "Cobie", trustWeight: 0.9, posts: 2, bullish: 1, bearish: 1, undisclosedPromo: 0, cited: 1, lastPostAt: NOW - 6 * 3_600_000 });
    expect(stats[1]).toMatchObject({ posts: 0, lastPostAt: null });
    expect(rulesetDetail.verified).toBe(true);
  });
});

describe("Public shell", () => {
  it("has no operator links or controls", async () => {
    renderAt("/rulesets");
    await screen.findByText("In force");
    expect(screen.queryByRole("link", { name: /Compose/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/agent ran/)).not.toBeInTheDocument();
  });
});

describe("Not found", () => {
  it("offers a way back", async () => {
    renderAt("/nope");
    await waitFor(() => expect(screen.getByText("Page not found")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Back to the overview" })).toHaveAttribute("href", "/");
  });
});
