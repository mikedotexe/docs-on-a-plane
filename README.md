# FastNEAR Docs Backend

`mike-docs` is the docs backend and generation workspace for FastNEAR API and RPC docs. The public docs runtime now lives in `builder-docs` at [docs.fastnear.com](https://docs.fastnear.com); this repo owns spec sync, enhancement manifests, page-model generation, and the local verification runtimes that support the shipped experience.

## Repository Structure

```
mike-docs/
├── rpcs/                       # Per-operation YAML files (auto-generated + hand-tuned)
│   ├── openapi.yaml            # Aggregate spec referencing all operations
│   ├── account/                # 3 operations (view_account, view_access_key, view_access_key_list)
│   ├── block/                  # 3 operations (block_by_height, block_by_id, block_effects)
│   ├── contract/               # 5 operations (call, view_code, view_state, ...)
│   ├── protocol/               # 20 operations (status, health, gas_price, genesis_config, EXPERIMENTAL_*, ...)
│   ├── transaction/            # 6 operations (tx_status, send_tx, broadcast_tx_async, ...)
│   └── validators/             # 3 operations (validators_current, validators_by_epoch, ...)
├── apis/                       # Portal-owned per-operation REST API pages, split from sibling aggregate specs
│   ├── fastnear/
│   ├── transactions/
│   ├── transfers/
│   ├── kv-fastdata/
│   └── neardata/
├── enhancements/               # Portal-owned docs enhancement manifests for Try-It presets and overrides
│   ├── fastnear/
│   ├── kv-fastdata/
│   ├── neardata/
│   ├── transactions/
│   └── transfers/
├── @theme/
│   └── ext/
│       └── configure.ts        # Legacy Redocly extension for auth, presets, and request shaping
├── shared/                     # Shared generated registries, page-models, and runtime helpers
├── standalone/                 # Local standalone runtime for bespoke pages
├── scripts/
│   ├── check-external-openapi.js   # Workspace stale-spec check for sibling service repos
│   ├── sync-external-apis.js       # Syncs aggregate specs, splits portal leaf files, regenerates page-model artifacts
│   ├── run-realm-build.js          # Wrapped Reunite build with local-plan fallback + SSR fixes
│   ├── generate-from-nearcore.js   # Generator: nearcore openapi.json → rpcs/*.yaml
│   ├── nearcore-operation-map.js   # Declarative mapping of nearcore paths → output files
│   └── test-operations.js          # Smoke test for operation page accessibility
├── docs/
│   └── snapshots.md            # Validator snapshot documentation
├── .github/workflows/
│   └── portal-build.yml        # CI parity: sync, lint, build, upload public artifact
├── redocly.yaml                # Portal configuration (sidebar, navbar, APIs, display settings)
├── sidebars.yaml               # Navigation sidebar structure
├── reference.page.yaml         # Single-operation page settings (pagination: item)
├── PORTAL_WORKFLOW.md          # How to work on, validate, and publish the portal
├── API_DOCS_ROLLOUT.md         # Multi-repo rollout tracker
└── package.json                # Scripts: preview, build, generate-rpc, lint
```

## Quick Start

```bash
npm install

# Preview the standalone bespoke runtime
npm run standalone:dev

# Default preview
npm run preview

# Build the standalone runtime
npm run standalone:build

# Build the legacy verification path
npm run build

# Workspace stale-spec check for sibling service repos
npm run check:external-openapi

# Full local validation before publish
npm run verify:workspace

```

The legacy Redocly preview runs on port `4000` by default. The standalone bespoke runtime runs on `http://127.0.0.1:4010`.

Important local-policy note:

- Run Redocly preview from the `mike-docs` repo root only.
- Do not use `.claude/worktrees/*` as a local Redocly project.
- If preview reports broken-link diagnostics referencing `.claude/worktrees/...`, that is a stale nested agent worktree, not the current portal config.

## Running Locally

### Generation and verification in this repo

```bash
npm install
npm run sync:apis
npm run lint
npm run standalone:build
REDOCLY_LOCAL_PLAN=enterprise npm run build
```

### Local runtime previews

```bash
# standalone bespoke runtime
npm run standalone:dev

# legacy Redocly runtime
npm run preview
```

### Public docs UI

For the full local experience, run `builder-docs` separately:

```bash
cd /Users/mikepurvis/near/fn/builder-docs
yarn install
yarn start
```

Then open `http://localhost:3000`.

`npm run preview` enforces that policy. It prints the effective project directory/config, and it fails fast if nested `.claude/worktrees/*` Redocly configs are present so a stale agent worktree cannot masquerade as the real portal.

Useful local validation commands:

- `npm run smoke:operations`
- `REDOCLY_LOCAL_PLAN=enterprise npm run build`
- `npm run standalone:build`
- `node scripts/test-operations.js http://127.0.0.1:4000`

`npm run preview`, `npm run lint`, and `npm run build` all resync the vendored REST specs before they run. The source of truth for those lives in sibling repos under `../fn/*/openapi/openapi.yaml`, not in `apis/<service>/`.

`npm run lint` and `npm run build` also print the authoritative Redocly project/config they are validating. If nested `.claude/worktrees/*` Redocly files are present, those commands warn but continue because the root repo is still the supported validation target.

Those commands also regenerate `shared/generatedEnhancements.ts` from the portal-owned manifests under `enhancements/<service>/manifest.yaml`.

`npm run lint` and `npm run build` also run `npm run check:external-openapi` first. In a multi-repo workspace, that executes `cargo run --features openapi --bin generate-openapi -- --check` in each converted service repo so stale aggregate specs fail before the portal syncs and splits them. In a standalone `mike-docs` checkout, the check skips missing sibling repos and the portal falls back to the committed vendored copies under `apis/<service>/`.

`npm run build` prefers a real `PLAN_GATES` JWT for a production-equivalent Reunite build. The repo looks for it in either the shell environment or a local `.env.redocly.local` file.

```bash
cat > .env.redocly.local <<'EOF'
PLAN_GATES=replace_with_real_plan_gates_jwt
REDOCLY_AUTHORIZATION=replace_with_redocly_api_key
REDOCLY_LOCAL_PLAN=enterprise
EOF
```

If you do not have a `PLAN_GATES` JWT yet, you can still do a local static build by setting `REDOCLY_LOCAL_PLAN=enterprise` (or `pro`) in `.env.redocly.local`. That uses the same local plan fallback Redocly already exposes in `preview`, and is intended for developer validation rather than CI/deploy parity.

`REDOCLY_AUTHORIZATION` is a separate personal API key. It can be useful for Redocly CLI/API calls, but it does not satisfy `realm build` on its own.

Start with [PORTAL_WORKFLOW.md](PORTAL_WORKFLOW.md) if you want the full day-to-day workflow, validation sequence, and deployment caveats in one place.

If you are onboarding another REST API service, use [SERVICE_ONBOARDING_CHECKLIST.md](SERVICE_ONBOARDING_CHECKLIST.md) as the canonical rollout checklist.

## Production Validation

For production-oriented validation in this repo:

```bash
npm run lint
PLAN_GATES=... npm run build
```

If you do not have a `PLAN_GATES` JWT locally, use:

```bash
REDOCLY_LOCAL_PLAN=enterprise npm run build
```

That is good for local static-build validation, but it is not a substitute for the real entitlement-backed production build path.

Important production caveat:

- this repo validates generation and the legacy Redocly portal, but the public docs host now ships from `builder-docs`
- if `docs.fastnear.com` is stale after the local checks are green, the missing step is usually a `builder-docs` publish, not a `mike-docs` change

## Docs Enhancement Layer

For pages that need more interaction polish than raw OpenAPI can provide, the portal supports a docs-enhancement layer:

- `mike-docs` owns the enhancement manifests under `enhancements/<service>/manifest.yaml`.
- `scripts/sync-external-apis.js` compiles those manifests into `shared/generatedEnhancements.ts`.
- `@theme/ext/configure.ts` reads that data and can seed `requestValues.path`, `requestValues.query`, and `requestValues.body` before Redocly renders Try-It.
- the generated page-model runtime in `builder-docs` consumes those defaults directly for native pages
- `configure.ts` still consumes them on the legacy Redocly path

Current supported request-shaping inputs in this repo:

- `preset`: chooses a named manifest preset for the current operation.
- `network`: selects network-scoped preset values like mainnet/testnet block heights.
- `server`: forwards a server hint into the portal environment variables on canonical `/apis/...` routes.
- `body`: forwards a full request-body override as URL-encoded JSON.
- `path.<name>` / `query.<name>` / `header.<name>`: explicit override values that win over preset defaults.

Priority order is:

1. explicit URL overrides
2. selected preset values
3. manifest defaults
4. raw OpenAPI examples

Legacy Redocly behavior:

- the legacy verification path still relies on `configure.ts` for auth and request shaping
- canonical `/rpcs/...` and `/apis/...` routes are the only supported public route families

## Generating RPC Specs from nearcore

The `rpcs/` YAML files are generated from nearcore's OpenAPI spec using a two-part pipeline:

```
nearcore/chain/jsonrpc/openapi/openapi.json
    ↓
scripts/nearcore-operation-map.js    (declarative mapping: nearcore paths → output files)
    ↓
scripts/generate-from-nearcore.js    (reads map + spec, writes YAML files)
    ↓
rpcs/*.yaml                          (per-operation specs + aggregate openapi.yaml)
```

### Running the generator

```bash
# Default: reads from ../nearcore/chain/jsonrpc/openapi/openapi.json
npm run generate-rpc

# Or specify a custom path
node scripts/generate-from-nearcore.js /path/to/openapi.json
```

The generator:
- Reads the nearcore OpenAPI spec and the operation map
- Decomposes compound endpoints (e.g., `/query` → separate `view_account`, `view_code`, etc.)
- Produces self-contained per-operation YAML files under `rpcs/`
- Regenerates `rpcs/openapi.yaml` (aggregate spec with `$ref`s to all operations)
- Reports counts: created, updated, unchanged, skipped

### Adding a new RPC operation

1. Add an entry to the `OPERATIONS` array in `scripts/nearcore-operation-map.js`
2. Run `npm run generate-rpc`
3. Review the generated YAML under `rpcs/<category>/`
4. Preview with `npm run preview` to verify the page renders correctly

Some operations are `custom` type (not derived from nearcore), such as `metrics` and `latest_block`. These have hand-written YAML files that the generator preserves.

## Relationship with builder-docs

`builder-docs` is now the public presentation runtime. This repo feeds it generated artifacts and optional local backends:

1. `mike-docs` syncs aggregate REST specs and generates per-operation leaf files.
2. `mike-docs` compiles portal-owned enhancements, page models, and structured graph metadata.
3. Generated page models are vendored into `builder-docs/src/data/generatedFastnearPageModels.json`.
4. Generated structured graph metadata is vendored into `builder-docs/src/data/generatedFastnearStructuredGraph.json`.
5. `builder-docs` renders the root-mounted public wrapper routes natively with `FastnearDirectOperation`, including `/rpc/**`, `/api/**`, `/tx/**`, `/transfers/**`, `/neardata/**`, `/fastdata/kv/**`, `/auth/**`, and `/agents/**`.
6. `builder-docs` also generates canonical hosted `/rpcs/**` and `/apis/**` pages from the same models.
7. `builder-docs` emits centralized JSON-LD and a public `/structured-data/site-graph.json` artifact from the same shared graph.

The Redocly runtime is now legacy scaffolding for validation and parity checks.

## REST API Rollout Model

The non-RPC APIs now follow the same per-operation pattern as the RPC docs, but with service-specific namespaces:

- `/apis/fastnear/...`
- `/apis/transactions/...`
- `/apis/transfers/...`
- `/apis/kv-fastdata/...`
- `/apis/neardata/...`

Each service owns its own `openapi/` directory in its own repo. This repo vendors those specs locally, splits them into canonical `/apis/...` leaf pages, and generates the shared page-model data consumed by `builder-docs`.

Canonical public docs data lives under `/apis/<service>/...`.
The old single-network Redocly verification route family has been retired.

Do not edit the vendored copies under `apis/<service>/` by hand unless you are intentionally making a temporary experiment; the sync step overwrites them.

## The `configure.ts` Extension Point

`@theme/ext/configure.ts` is Redocly's extension hook for customizing the Try-It console. It exports a `configure()` function that returns a `{ requestValues }` object. Redocly calls this on page load and uses the returned values to pre-populate headers, query params, security credentials, and the request body.

### URL Parameters

| Param | Type | Effect |
|-------|------|--------|
| `?apiKey=KEY` | string | Injected as `?apiKey=` query param, `x-api-key` header, security scheme values, and `{{API_KEY}}` code sample variable |
| `?token=TOKEN` | string | Injected as `Authorization: Bearer TOKEN` header, security scheme values, and `{{ACCESS_TOKEN}}` code sample variable |
| `?body=JSON` | URL-encoded JSON | Passed as `requestValues.body` — pre-populates the Try-It request body |
| `?colorSchema=dark\|light` | string | Used by hosted pages in `builder-docs`; the local legacy Redocly path no longer has dedicated theme-sync glue |

### Auth resolution order

1. **API key**: URL param `?apiKey=` > localStorage `fastnear:apiKey` > legacy localStorage `fastnear_api_key`
2. **Bearer token**: URL param `?token=` > localStorage `fastnear:bearer`

When you use the legacy Redocly runtime, `configure.ts` still reads auth and request-shaping state from the URL and localStorage. The public direct-render runtime in `builder-docs` reads those values itself instead.

### Request body injection

The `?body=` parameter accepts a URL-encoded, complete JSON-RPC payload. When present, `configure.ts` parses it and passes it as `requestValues.body` to Redocly's Replay (Try-It) engine.

**Important**: `requestValues.body` is a **full replacement**, not a merge. Redocly's internal `convertRequestBody()` creates a single "default" example from the provided body, replacing any named examples (e.g., mainnet/testnet) defined in the YAML spec. This means builder-docs must pass the entire JSON-RPC envelope — `jsonrpc`, `id`, `method`, and `params` — not just the params.

Example URL:
```
/rpcs/block/block_by_height?body=%7B%22jsonrpc%22%3A%222.0%22%2C%22id%22%3A%22fastnear%22%2C%22method%22%3A%22block%22%2C%22params%22%3A%7B%22block_id%22%3A186464793%7D%7D
```

When `?body=` is absent, the YAML-defined named examples render as normal — fully backward compatible.

## Legacy Redocly Presentation

The local Redocly verification path is intentionally no longer polished to match the public docs runtime. The shipped request, curl, copy, and theme behavior now lives in `builder-docs`.

## URL Patterns

Operations are accessible at two URL formats:
- **Pretty routes**: `/rpcs/account/view_account` (file-based, matches the YAML file path)
- **Operation routes**: `/reference/operation/view_account` (generated by `reference.page.yaml` pagination)

Builder-docs now renders the public docs pages directly from the generated page models and also hosts the canonical `/rpcs/...` and `/apis/...` routes itself.

## Server Endpoints

Four RPC server URLs are configured in `rpcs/openapi.yaml`:
- `rpc.mainnet.fastnear.com`, `rpc.testnet.fastnear.com`
- `archival-rpc.mainnet.fastnear.com`, `archival-rpc.testnet.fastnear.com`

## Testing

- `INTEGRATION_GUIDE.md` — Current contract between generation in `mike-docs` and rendering in `builder-docs`
- `npm run check:external-openapi` — Run `cargo run --features openapi --bin generate-openapi -- --check` across sibling service repos when they are present
- `npm run smoke:operations` — Smoke test representative local pretty routes

## Known Limitations

- This repo validates and builds the portal, but it does not encode the Redocly publish target. If production is stale after a push, the missing step is in the Redocly deployment side, not in the generated `public/` output.
- This repo validates and builds the legacy verification surfaces, but it does not publish the public docs site. If `docs.fastnear.com` is stale after a push, the missing step is usually a `builder-docs` deployment, not anything in the generated `mike-docs` output.
- Workspace stale-spec enforcement depends on the sibling service repos being present. In a standalone `mike-docs` checkout, `npm run check:external-openapi` skips those checks and CI validates the committed vendored `apis/<service>/` trees instead.
- `npm run preview:fresh-examples`, `npm run refresh-examples`, and `npm run build:fresh-examples` update current-chain example values in several `rpcs/*.yaml` files. Those diffs are expected.
- `scripts/rpc-example-config.js` is the shared source for curated static RPC params, manual per-network overrides, and the allowlisted placeholder follow-ups that still need real examples.
- `REDOCLY_AUTHORIZATION` is not a substitute for `PLAN_GATES` on the production-equivalent build path.
- Docs-only or ingestion-only repos without a public HTTP surface are out of scope for the OpenAPI/Redocly flow.

## Other Commands

```bash
npm run check:external-openapi  # Verify sibling service specs are not stale
npm run build                  # Build with PLAN_GATES or local-plan fallback
npm run build:fresh-examples   # Build after refreshing tracked RPC example values
npm run lint                   # Validate OpenAPI specs
npm run audit:rpc-example-placeholders # Fail if generic RPC placeholders slip back into tracked examples
npm run preview:fresh-examples # Preview after refreshing tracked RPC example values
npm run verify:workspace       # Stale-spec checks + portal lint + local build
npm run smoke:operations       # Smoke test representative local pretty routes
```
