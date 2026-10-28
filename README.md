# Hypestamp

**A clear record of why an agent traded.**

Hypestamp follows selected X sources, saves structured analysis of their posts,
and opens paper positions when enough trusted sources agree under published risk
rules. A Chainlink CRE workflow re-fetches cited posts using Confidential HTTP,
obtains a consensus entry price, and records an evidence commitment on Sepolia.
Replay rebuilds the decision from saved inputs. Saved reports freeze the findings
and position outcomes known at capture time.

Practice trades. No real funds. Entry evidence is recorded on testnet; paper exits
are off-chain. A matched replay demonstrates consistency with saved inputs, not
the truth of a market claim or the quality of an investment decision.

## Architecture

```text
X sources → Worker agent → saved analysis → agreement + risk checks
                                D1                 ↓
                                               CRE bridge
                                                   ↓
                      Confidential HTTP posts + consensus price
                                                   ↓
                                            Sepolia ledger
                                                   ↓
                      reconciliation → replay → frozen reports
                                                   ↓
                                      public dashboard / owner console
```

- `api/`: Hono API, D1 storage, five-minute agent schedule, paper exits, replay,
  and immutable reports.
- `web/`: React application, light/dark themes, static landing page, public
  evidence views, and owner tools. Its Cloudflare Worker forwards API requests
  through a service binding.
- `cre/stamp-workflow/`: ruleset publication and entry-evidence workflow.
- `cre/bridge/`: local authenticated job queue that runs CRE CLI simulations
  with testnet broadcast. It is a local service, not a deployed CRE gateway.
- `contracts/`: Solidity ledger and contract tests.

The configured Sepolia ledger is
[`0xaB3B70984e300f48Cd3523b15170dDe2A6ad0018`](https://sepolia.etherscan.io/address/0xaB3B70984e300f48Cd3523b15170dDe2A6ad0018).
Configuration alone does not establish current deployment health.

## Local development

Use Node.js 22.13 or later and the pnpm version pinned in `package.json`. Bun and
the Chainlink CRE CLI are also needed to run the local CRE bridge; Foundry is
needed for contract tests.

```sh
pnpm install
pnpm db:migrate:local
pnpm dev
```

In another terminal:

```sh
pnpm web:dev
```

The web app runs at `http://localhost:5173`, with local API requests proxied to
port 8787. If those ports are occupied, run the API with `--port 8788
--inspector-port 9230` and the web app with
`HYPESTAMP_API_URL=http://127.0.0.1:8788 pnpm web:dev --port 5174 --strictPort`.
Create `api/.dev.vars` containing your local credentials:

```dotenv
ADMIN_TOKEN=replace-with-a-long-random-owner-token
TWITTERAPI_KEY=replace-with-your-twitterapi-io-key
OPENAI_API_KEY=replace-with-your-openai-key
BRIDGE_TOKEN=replace-with-a-long-random-bridge-token
BRIDGE_URL=http://127.0.0.1:8789
```

RPC URL, ledger address and start block have defaults in `api/wrangler.jsonc`.
Use separate owner and bridge tokens. To use CRE locally, install its workflow dependencies with `bun install` inside
`cre/stamp-workflow`, configure the CRE CLI's credentials privately, and launch
the bridge from the repository root:

```sh
BRIDGE_TOKEN=your-local-bridge-token bun cre/bridge/server.ts
```

The bridge reads `TWITTERAPI_KEY` from its environment or `api/.dev.vars`. Its
token must match the API configuration. Accepted bridge jobs can broadcast
Sepolia transactions; a 202 response means queued, not confirmed.

To retain the full CLI output, payload and exit status for each actual CRE job,
start the bridge with
`HYPESTAMP_CRE_EVIDENCE_DIR=demo-output/cre-review/fresh` in its environment.
Captures stay in that ignored local directory; an agent cycle without a submitted
job does not produce a CRE execution log.

An empty database needs a published ruleset before the agent can trade. Use
`/admin` and the owner token to compose and publish one. Reconciliation confirms
its ledger event, and the rules become usable after their effective time.
The local development server exposes scheduled testing through
`http://localhost:8787/__scheduled`.

## Reproducible rehearsal

```sh
pnpm demo
```

This runs production decision, risk, reconciliation, replay, exit and report code
against an isolated, temporary local D1 database. It uses **invented demo
accounts, hand-authored posts and analyses, and simulated prices and ledger
events**. It does not call an LLM, X, CoinGecko, CRE, or Sepolia. It neither seeds
the application nor modifies a remote database.

The rehearsal checks:

1. One source does not meet the agreement threshold.
2. Two sources produce a 4% paper position, with an 8% stop and 20% target.
3. Replay remains incomplete until a matching simulated ledger event arrives.
4. A synthetic move from $10 to $12 closes the position: 20% position return,
   contributing 0.8 percentage points to the paper book, before costs.
5. The same posts cannot reopen the closed position.
6. Altering saved risk inputs causes a mismatch while the earlier saved report
   remains unchanged.

The ignored `demo-output/rehearsal.json` contains the inputs, stage results and
saved report, with an explicit synthetic-data warning. **Do not send its fictional
post IDs to CRE or present its match as proof of a live integration.**

For the real CRE demonstration and video, follow [SUBMISSION.md](SUBMISSION.md).

## Reports and verification

Reports select inclusive UTC calendar dates and include trades **opened** within
that period, with outcomes known at capture. A report including today is partial.
An exit within the period does not bring an earlier entry into that cohort.

Daily reports begin after 00:10 UTC (01:10 Lagos), on the existing five-minute
schedule. Creation retries failures, prevents duplicates and catches up one
missing day per tick. On first activation, the schedule starts with yesterday.
Daily reporting runs independently of agent failures. Reconciliation, exits and
new entries also validate only their own configuration requirements.

Public routes include `/v1/trades`, `/v1/rulesets`, `/v1/reports` and
`/v1/reports/:id`. `/v1/reports/compliance` remains a live summary. Custom report
generation uses owner-protected `POST /v1/admin/reports` with
`{"startDate":"2026-10-26","endDate":"2026-10-26"}`.

Report JSON downloads contain the saved snapshot being displayed, not a complete
raw-evidence archive. Print/save-PDF uses a light document layout. Zero mismatches
does not imply full verification: missing entry stamps and older records without
saved risk inputs remain incomplete.

## Checks

```sh
pnpm check
pnpm test
pnpm web:build
pnpm contracts:test
```

CRE-specific tests run with `bun test` inside `cre/stamp-workflow` and
`cre/bridge`. The API tests use Cloudflare's local D1 runtime and require the
ability to bind localhost ports.

## Hosting

The repository contains separate Cloudflare configurations for `hypestamp-api`
and `hypestamp-web`. The API needs a migrated D1 database bound as `DB`; the web
Worker needs a service binding named `API` pointing to the API Worker. Both use
the repository root as their build context.

A Cloudflare deployment does not deploy the Bun bridge. An API Worker cannot
reach your computer's `127.0.0.1`. Continuous hosted trading needs a reachable,
authenticated bridge or an implemented deployed-workflow gateway. Read-only
pages and saved reports can operate separately. Hosting changes are a separate
operator step; the rehearsal does not deploy anything.
