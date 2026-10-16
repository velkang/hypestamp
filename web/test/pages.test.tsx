import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sourceStats } from "../src/features/sources/sourceStats";
import { feed, NOW, savedReport, tradeDetail, trades } from "./helpers/fixtures";
import { renderAt } from "./helpers/render";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

it("explains the product without requesting the API", async () => {
  const { fetch } = renderAt("/");
  expect(screen.getByRole("heading",{level:1})).toHaveTextContent("A clear record of why an agent traded.");
  expect(screen.getByRole("link",{name:"Explore dashboard"})).toHaveAttribute("href","/dashboard");
  expect(screen.getByText("Practice trades. No real funds.")).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it("shows recent decisions, demo provenance and the latest saved report", async () => {
  renderAt("/dashboard");
  expect(await screen.findByText(/2 practice trades. 1 incomplete/)).toBeInTheDocument();
  expect(screen.getByText(/Demo records/)).toBeInTheDocument();
  expect(await screen.findByRole("link",{name:"Read report →"})).toHaveAttribute("href",`/reports/${savedReport.id}`);
  expect(screen.queryByText("gpt-6-luna")).not.toBeInTheDocument();
});
it("shows the empty trading state without claiming verification", async () => {
  renderAt("/dashboard", {"/v1/trades":[],"/v1/reports":[]});
  expect(await screen.findByText("No trades yet")).toBeInTheDocument();
  expect(await screen.findByText("No saved reports yet")).toBeInTheDocument();
  expect(screen.queryByText("Matched")).not.toBeInTheDocument();
});
it("separates position P&L and evidence status", async () => {
  renderAt("/trades", {"/v1/trades":[{...trades[1],closedAt:NOW,exitReason:"stop-loss",pnl:{returnPct:-9,bookContributionPct:-.38},replayVerdict:"pending"}]});
  const table = await screen.findByRole("table");
  expect(within(table).getByText("Closed · Stop loss")).toBeInTheDocument();
  expect(within(table).getByText("−9.00%")).toBeInTheDocument();
  expect(within(table).getByText("Incomplete")).toBeInTheDocument();
});
it("shows API failures with a retry action",async()=>{
  renderAt("/trades",{"/v1/trades":new Error("internal error")});
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load trades: internal error.");
  expect(screen.getByRole("button",{name:"Try again"})).toBeInTheDocument();
});
describe("trade review",()=>{
  it("leads with the decision and keeps technical checks in disclosures",async()=>{
    renderAt("/trades/1");
    expect(await screen.findByRole("heading",{name:"Why the agent traded"})).toBeInTheDocument();
    expect(await screen.findByText("Matched")).toBeInTheDocument();
    expect(screen.getByText("Rotating into ETH here.")).toBeInTheDocument();
    const summary = screen.getByText("View detailed checks");
    expect(summary.parentElement).not.toHaveAttribute("open");
    await userEvent.click(summary);
    expect(summary.parentElement).toHaveAttribute("open");
    expect(screen.getByRole("link",{name:/Rules used/})).toBeInTheDocument();
  });
  it("preserves exit prices, times, reasons and P&L",async()=>{
    renderAt("/trades/1",{"/v1/trades/1":{...tradeDetail,closedAt:NOW,exitPriceE8:"284577600000",exitPriceAt:NOW-1000,exitReason:"take-profit",pnl:{returnPct:20,bookContributionPct:.85}}});
    expect(await screen.findByText("Closed · Take profit")).toBeInTheDocument();
    expect(screen.getByText("$2,845.78")).toBeInTheDocument();
    expect(screen.getByText("+20.00%")).toBeInTheDocument();
    expect(screen.getByText("+0.85 percentage points")).toBeInTheDocument();
  });
  it.each(["pending","mismatch"])("distinguishes %s evidence",async verdict=>{
    renderAt("/trades/1",{"/v1/trades/1/replay":{tradeId:1,verdict,checks:[]}});
    expect(await screen.findByText(verdict === "pending" ? "Incomplete" : "Mismatch")).toBeInTheDocument();
  });
  it("explains a stamp timeout in the technical record",async()=>{
    renderAt("/trades/1",{"/v1/trades/1":{...tradeDetail,status:"failed",failureReason:"stamp-timeout"}});
    expect(await screen.findByText("No matching stamp found within 30 minutes")).toBeInTheDocument();
  });
  it("reports an unknown trade",async()=>{renderAt("/trades/99");expect(await screen.findByRole("alert")).toHaveTextContent("not found");});
});
it("puts plain-language trading conditions above technical metadata",async()=>{
  renderAt("/rulesets");
  expect(await screen.findByRole("heading",{name:"Trading conditions"})).toBeInTheDocument();
  expect(screen.getByText(/If both directions qualify/)).toBeInTheDocument();
  expect(screen.getByText("Commitment, analysis settings, and JSON").parentElement).not.toHaveAttribute("open");
});
it("shows readable posts and links them to the decision",async()=>{
  renderAt("/sources");
  await userEvent.click(await screen.findByRole("button",{name:/@CryptoHayes/}));
  expect(screen.getByRole("heading",{name:"Posts from @CryptoHayes"})).toBeInTheDocument();
  expect(screen.getByText(/Promotion detected without a disclosure marker/)).toBeInTheDocument();
  expect(screen.getByRole("link",{name:"Used in T-001 →"})).toHaveAttribute("href","/trades/1");
});
it("handles missing active rules without loading forever",async()=>{
  renderAt("/sources",{"/v1/status":{activeRuleset:null,demo:false,trades:{submitted:0,stamped:0,failed:0}}});
  expect(await screen.findByText("No sources yet")).toBeInTheDocument();
});
it("lists saved reports and presents incomplete coverage accurately",async()=>{
  renderAt("/reports");
  expect(await screen.findByText("Incomplete")).toBeInTheDocument();
  expect(screen.getByRole("link",{name:/Read report for/})).toHaveAttribute("href",`/reports/${savedReport.id}`);
  expect(screen.queryByText(/0 MISMATCHES/)).not.toBeInTheDocument();
});
it("shows the frozen snapshot with contextual download and print actions",async()=>{
  const print = vi.spyOn(window,"print").mockImplementation(()=>{});
  renderAt(`/reports/${savedReport.id}`);
  expect(await screen.findByText("Review incomplete")).toBeInTheDocument();
  expect(screen.getByText(/Partial period/)).toBeInTheDocument();
  expect(screen.getByText(/not a complete raw-evidence archive/)).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Download report JSON"})).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button",{name:"Print / save PDF"}));
  expect(print).toHaveBeenCalledOnce();
});
it("keeps operator tools and trading rules out of primary public navigation",async()=>{
  renderAt("/trades");
  const nav = screen.getByRole("navigation",{name:"Main"});
  expect(within(nav).getAllByRole("link").map(a=>a.textContent)).toEqual(["Dashboard","Trades","Sources","Reports"]);
  expect(screen.queryByRole("button",{name:/Export/})).not.toBeInTheDocument();
});
it("offers a way home from missing pages",()=>{renderAt("/nope");expect(screen.getByRole("link",{name:"Back to the home page"})).toHaveAttribute("href","/");});
it("counts case-insensitive source activity",()=>{
  expect(sourceStats([{handle:"Cobie",trustWeight:.9}],feed.posts)[0]).toMatchObject({posts:2,bullish:1,bearish:1,cited:1});
});
