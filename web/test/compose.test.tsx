import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DRAFT, draftFrom } from "../src/features/compose/ComposePage";
import { NOW, preview, rulesetDetail, rulesets } from "./helpers/fixtures";
import { renderAt } from "./helpers/render";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

const previewPanel = () => screen.findByRole("region", { name: "Preview" });

describe("Compose", () => {
  it("starts from the ruleset in force and previews the hash and changes", async () => {
    const user = userEvent.setup();
    renderAt("/rulesets/new");
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
    const user = userEvent.setup();
    renderAt("/rulesets/new", { "POST /v1/rulesets/preview": Object.assign(new Error("converge.minKols: Too small"), { status: 400 }) });
    expect(await screen.findByText("converge.minKols: Too small", { exact: false })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Owner token"), "secret");
    expect(screen.getByRole("button", { name: "Commit ruleset" })).toBeDisabled();
  });

  it("commits with the owner token and tracks the commit until it is on-chain", async () => {
    const user = userEvent.setup();
    const { fetch } = renderAt("/rulesets/new", { "/v1/rulesets": [{ ...rulesets[0], hash: preview.hash, status: "pending" }, ...rulesets] });
    const commit = await screen.findByRole("button", { name: "Commit ruleset" });
    await user.type(screen.getByLabelText("Owner token"), "secret");
    await waitFor(() => expect(commit).toBeEnabled());
    await user.click(commit);

    expect(await screen.findByText("Submitted to Chainlink CRE")).toBeInTheDocument();
    expect(await screen.findByText(/Waiting for the RulesetCommitted event/)).toBeInTheDocument();
    const post = fetch.mock.calls.find(([url, init]) => url === "/v1/rulesets" && init?.method === "POST");
    expect(new Headers(post?.[1]?.headers).get("Authorization")).toBe("Bearer secret");
    expect(JSON.parse(String(post?.[1]?.body)).converge.minKols).toBe(2);
    expect(sessionStorage.getItem("hypestamp.ownerToken")).toBe("secret");
  });

  it("shows the API's refusal when the owner token is wrong", async () => {
    const user = userEvent.setup();
    renderAt("/rulesets/new", { "POST /v1/rulesets": Object.assign(new Error("owner token required"), { status: 401 }) });
    const commit = await screen.findByRole("button", { name: "Commit ruleset" });
    await user.type(screen.getByLabelText("Owner token"), "wrong");
    await waitFor(() => expect(commit).toBeEnabled());
    await user.click(commit);
    expect(await screen.findByRole("alert")).toHaveTextContent("owner token required");
    expect(sessionStorage.getItem("hypestamp.ownerToken")).toBeNull();
  });

  it("starts from defaults when nothing is in force", async () => {
    renderAt("/rulesets/new", { "/v1/status": { activeRuleset: null, lastSyncedBlock: null, lastFetchAt: null, demo: false, trades: { submitted: 0, stamped: 0, failed: 0 } } });
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

describe("Rulesets timeline", () => {
  it("links to compose and marks rulesets still waiting for the chain", async () => {
    renderAt("/rulesets", { "/v1/rulesets": [{ ...rulesets[0], hash: preview.hash, status: "pending" }, ...rulesets] });
    expect(await screen.findByText("Awaiting chain")).toBeInTheDocument();
    expect(screen.getByText("In force")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Compose new ruleset" })).toHaveAttribute("href", "/rulesets/new");
  });
});
