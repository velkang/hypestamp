import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DRAFT, draftFrom } from "../src/features/compose/ComposePage";
import { adminOverview, NOW, preview, rulesetDetail } from "./helpers/fixtures";
import { renderAt } from "./helpers/render";

const TOKEN_KEY = "hypestamp.ownerToken";
const signIn = () => sessionStorage.setItem(TOKEN_KEY, "secret");
const failing = (message: string, status: number) => Object.assign(new Error(message), { status });
const withPending = { ...adminOverview, rulesets: [{ ...adminOverview.rulesets[0], hash: preview.hash, status: "pending" }, ...adminOverview.rulesets] };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("Admin sign-in", () => {
  it("asks for the owner token and opens the console once it is accepted", async () => {
    const user = userEvent.setup();
    const { fetch } = renderAt("/admin");
    await user.type(await screen.findByLabelText("Owner token"), "secret{Enter}");
    expect(await screen.findByRole("heading", { name: "Operator console" })).toBeInTheDocument();
    const call = fetch.mock.calls.find(([url]) => url === "/v1/admin/overview");
    expect(new Headers(call?.[1]?.headers).get("Authorization")).toBe("Bearer secret");
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe("secret");
  });

  it("refuses a wrong token", async () => {
    signIn();
    renderAt("/admin", { "/v1/admin/overview": failing("owner token required", 401) });
    expect(await screen.findByRole("alert")).toHaveTextContent("That token was not accepted.");
  });

  it("forgets the token on lock", async () => {
    const user = userEvent.setup();
    signIn();
    renderAt("/admin");
    await user.click(await screen.findByRole("button", { name: "Lock" }));
    expect(screen.getByLabelText("Owner token")).toBeInTheDocument();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe("Operator console", () => {
  it("shows agent health and every ruleset with its on-chain status", async () => {
    signIn();
    renderAt("/admin", { "/v1/admin/overview": withPending });
    const health = await screen.findByRole("region", { name: "Agent health" });
    expect(within(health).getByText("Reachable")).toBeInTheDocument();
    expect(within(health).getByText("11921132")).toBeInTheDocument();
    const rulesets = screen.getByRole("region", { name: "Rulesets" });
    expect(within(rulesets).getByText("Awaiting chain")).toBeInTheDocument();
    expect(within(rulesets).getByText("On-chain")).toBeInTheDocument();
  });

  it("warns that nothing goes on-chain while the bridge is down", async () => {
    signIn();
    renderAt("/admin", { "/v1/admin/overview": { ...adminOverview, agent: { ...adminOverview.agent, bridgeUp: false } } });
    expect(await screen.findByText("Down")).toBeInTheDocument();
    expect(screen.getByText(/Nothing can go on-chain until the bridge is running/)).toBeInTheDocument();
  });
});

describe("Compose", () => {
  const previewPanel = () => screen.findByRole("region", { name: "Preview" });

  it("starts from the ruleset in force and previews the hash and changes", async () => {
    const user = userEvent.setup();
    signIn();
    renderAt("/admin/rulesets/new");
    expect(await screen.findByText("@cobie")).toBeInTheDocument();
    const panel = await previewPanel();
    expect(within(panel).getByText("No changes yet.")).toBeInTheDocument();
    await waitFor(() => expect(within(panel).getByRole("button", { name: `Copy ${preview.hash}` })).toBeInTheDocument());

    const minKols = screen.getByLabelText("Sources that must agree");
    await user.clear(minKols);
    await user.type(minKols, "3");
    await user.type(screen.getByLabelText("Add an X handle"), "@inversebrah{Enter}");
    expect(within(panel).getByText("sources needed 2 → 3")).toBeInTheDocument();
    expect(within(panel).getByText("+ @inversebrah (trust 0.5)")).toBeInTheDocument();
  });

  it("explains why a draft is not valid and blocks the commit", async () => {
    signIn();
    renderAt("/admin/rulesets/new", { "POST /v1/admin/rulesets/preview": failing("converge.minKols: Too small", 400) });
    expect(await screen.findByText("converge.minKols: Too small", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Commit ruleset" })).toBeDisabled();
  });

  it("commits with the session's token and tracks the commit until it is on-chain", async () => {
    const user = userEvent.setup();
    signIn();
    const { fetch } = renderAt("/admin/rulesets/new", { "/v1/admin/overview": withPending });
    const commit = await screen.findByRole("button", { name: "Commit ruleset" });
    await waitFor(() => expect(commit).toBeEnabled());
    await user.click(commit);

    expect(await screen.findByText("Submitted to Chainlink CRE")).toBeInTheDocument();
    expect(await screen.findByText(/Waiting for the RulesetCommitted event/)).toBeInTheDocument();
    const post = fetch.mock.calls.find(([url, init]) => url === "/v1/admin/rulesets" && init?.method === "POST");
    expect(new Headers(post?.[1]?.headers).get("Authorization")).toBe("Bearer secret");
    expect(JSON.parse(String(post?.[1]?.body)).converge.minKols).toBe(2);
  });

  it("shows the API's refusal when the commit fails", async () => {
    const user = userEvent.setup();
    signIn();
    renderAt("/admin/rulesets/new", { "POST /v1/admin/rulesets": failing("CRE did not accept the commit: bridge down", 502) });
    const commit = await screen.findByRole("button", { name: "Commit ruleset" });
    await waitFor(() => expect(commit).toBeEnabled());
    await user.click(commit);
    expect(await screen.findByRole("alert")).toHaveTextContent("CRE did not accept the commit: bridge down");
  });

  it("starts from defaults when nothing is in force", async () => {
    signIn();
    renderAt("/admin/rulesets/new", { "/v1/status": { activeRuleset: null, demo: false, trades: { submitted: 0, stamped: 0, failed: 0 } } });
    const panel = await previewPanel();
    expect(within(panel).getByText("first ruleset: nothing in force to compare with")).toBeInTheDocument();
    expect(screen.getByText(/0 of 20 sources/)).toBeInTheDocument();
  });
});

describe("draftFrom", () => {
  it("drops effectiveFrom and the prompt hash, which the API pins", () => {
    const draft = draftFrom(rulesetDetail.ruleset);
    expect(draft).not.toHaveProperty("effectiveFrom");
    expect(draft.extraction).toEqual({ model: "gpt-6-luna", schemaVersion: 1 });
    expect(draftFrom(undefined)).toBe(DEFAULT_DRAFT);
  });
});

it("saves a custom report using the owner session and links to its snapshot",async()=>{
  signIn();
  const {fetch} = renderAt("/admin/reports");
  await userEvent.click(await screen.findByRole("button",{name:"Generate report"}));
  expect(await screen.findByRole("link",{name:"Read the saved report →"})).toHaveAttribute("href","/reports/daily-2026-10-15");
  const call = fetch.mock.calls.find(([url,init])=>url === "/v1/admin/reports" && init?.method === "POST");
  expect(new Headers(call?.[1]?.headers).get("Authorization")).toBe("Bearer secret");
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({startDate:"2026-10-15",endDate:"2026-10-15"});
});
