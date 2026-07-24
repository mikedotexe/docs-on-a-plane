# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What This Is

FastNEAR docs generation and verification repo. It owns the OpenAPI sync pipeline, per-operation leaf specs, enhancement manifests, generated page models, the local standalone runtime, and the legacy Redocly backend.

The consumer-facing site is [builder-docs](https://github.com/fastnear/builder-docs), which now renders public API and RPC pages directly at [docs.fastnear.com](https://docs.fastnear.com). The legacy Redocly host remains only for parity checks and migration cleanup.

## Common Commands

```bash
 npm run preview              # Sync vendored REST specs and start preview (http://127.0.0.1:4000)
 npm run preview:fresh-examples # Refresh tracked RPC examples, then start preview
 npm run standalone:dev       # Preview the standalone bespoke runtime on canonical /rpcs/... and /apis/... paths
 npm run standalone:build     # Build the standalone bespoke runtime
 npm run check:external-openapi # Run aggregate-spec freshness checks across sibling service repos when present
 npm run build                # Build with PLAN_GATES, or local fallback via REDOCLY_LOCAL_PLAN
 npm run build:fresh-examples # Build after refreshing tracked RPC examples
npm run lint                 # Sync vendored REST specs, then validate OpenAPI specs
npm run verify:workspace     # lint + build + 12 audits (stale-spec, page-model, structured-graph, RPC examples, 5 service-default audits, description-quality, description-drift, parameter-descriptions)
npm run smoke:operations     # Smoke test representative pretty routes while preview is running
npm run generate-rpc         # Regenerate rpcs/*.yaml from nearcore OpenAPI spec
```

## Architecture

### Per-Operation YAML Files (`rpcs/`)

Each RPC method has its own self-contained OpenAPI YAML file under `rpcs/<category>/`. There are 40 operations across 6 categories: account, block, contract, protocol, transaction, validators.

The aggregate spec `rpcs/openapi.yaml` uses `$ref` to reference all individual operations.

### REST API Specs (`apis/`)

REST API definitions are vendored under `apis/<service>/openapi.yaml`, but owned in sibling service repos as aggregate specs. `scripts/sync-external-apis.js` reads:

- `../fn/fastnear-api-server-rs/openapi`
- `../fn/explorer-api/openapi`
- `../fn/transfers-api/openapi`
- `../fn/kv-fastdata-server/openapi`
- `../fn/neardata-server/openapi`

When those sibling repos are not available, `scripts/sync-external-apis.js` keeps the committed vendored copies in place instead of failing. When they are available, the script splits each aggregate spec into the portal-owned per-operation leaf files under `apis/<service>/`. `npm run lint` and `npm run build` first call `scripts/check-external-openapi.js`, which runs `cargo run --features openapi --bin generate-openapi -- --check` across the sibling service repos when the workspace is present.

### Docs Enhancement Manifests (`enhancements/`)

The docs-enhancement layer is portal-owned in this repo under `enhancements/<service>/manifest.yaml`, and `scripts/sync-external-apis.js` compiles those manifests into `shared/generatedEnhancements.ts`.

This layer is intentionally separate from OpenAPI:
- OpenAPI remains the contract truth.
- `enhancements/<service>/manifest.yaml` handles interaction-only concerns such as preset path params.

### Configure Extension (`@theme/ext/configure.ts`)

TypeScript file — Redocly's `configure()` extension hook. Returns `{ requestValues }` to pre-populate the Try-It console. Handles four concerns:

1. **Auth injection**: Reads API key from `?apiKey=` / localStorage (`fastnear:apiKey`, with `fastnear_api_key` as a legacy fallback) and bearer token from `?token=` / localStorage (`fastnear:bearer`). Injects into query params, headers (`x-api-key`, `Authorization`), security schemes, and code sample env vars (`{{API_KEY}}`, `{{ACCESS_TOKEN}}`).
2. **Preset injection**: Reads the portal-owned enhancement manifests plus `?preset=` / `?network=` and seeds `requestValues.path`, `requestValues.query`, and `requestValues.body` for matching REST API pages.
3. **Explicit overrides**: Reads `?path.<name>=`, `?query.<name>=`, and `?header.<name>=` so legacy Redocly callers can override preset defaults without changing the OpenAPI spec.
4. **Debug logging**: On localhost, logs which values were configured to the browser console.

### Theme Styling (`@theme/styles.css`)

Custom CSS overrides for the Redocly portal. Brand colors use `#1e4aba` blue; dark mode inverts to warm yellows. Hides the download button (`.panel-download`) and language selector (`.panel-language-list`) via `display: none`. Also customizes font sizes, panel border radius, and button styles.

### URL Patterns

Operations are accessible at two URL formats:
- **Pretty routes**: `/rpcs/account/view_account` (file-based, matches the YAML file path)
- **Operation routes**: `/reference/operation/view_account` (generated by `reference.page.yaml` pagination)

`builder-docs` and the standalone runtime both use the canonical pretty routes directly. The generated `/reference/operation/...` routes remain part of the legacy Redocly path.

### Server Endpoints

Four RPC server URLs are configured in `rpcs/openapi.yaml`:
- `rpc.mainnet.fastnear.com`, `rpc.testnet.fastnear.com`
- `archival-rpc.mainnet.fastnear.com`, `archival-rpc.testnet.fastnear.com`

### Portal Configuration

- `redocly.yaml` — Main config: API definitions, display settings, sidebar/navbar visibility
- `sidebars.yaml` — Navigation sidebar structure
- `reference.page.yaml` — Enables single-operation pages (`pagination: item`) with Try-It consoles

### Client-Side Scripts (`scripts.head`)

`redocly.yaml` loads client-side scripts via the `scripts.head` array. These execute in `<head>` before `document.body` exists, so any DOM access must be deferred to `DOMContentLoaded`. Currently loaded:

- `scripts/generated-operation-routes.js`
- `scripts/api-operation-redirect.js`

## The nearcore Generator Pipeline

```
nearcore/chain/jsonrpc/openapi/openapi.json    (source of truth)
    ↓
scripts/nearcore-operation-map.js              (declarative mapping)
    ↓
scripts/generate-from-nearcore.js              (generator script)
    ↓
rpcs/<category>/<operation>.yaml               (per-operation specs)
rpcs/openapi.yaml                              (aggregate spec)
```

### Key files

- **`scripts/nearcore-operation-map.js`** — Exports `OPERATIONS` array (40 entries), `LEAF_TYPE_MAP` (type simplifications), `DEPRECATED_METHODS`, and schema constants. Each operation entry has: `type`, `file`, `category`, `operationId`, `summary`, `description`, and type-specific fields.
- **`scripts/generate-from-nearcore.js`** — Reads the nearcore OpenAPI spec + operation map, decomposes compound endpoints (e.g., `/query` → `view_account`, `view_code`, etc.), flattens nearcore schemas to self-contained definitions, writes per-operation YAML files. Custom YAML serializer (no external deps).

### Operation types

| Type | Description | Example |
|------|-------------|---------|
| `query` | Decomposed from nearcore's `/query` by `request_type` | `view_account`, `view_code` |
| `block_variant` | Block operations by height or hash | `block_by_height`, `block_by_id` |
| `chunk_variant` | Chunk operations | `chunk_by_hash`, `chunk_by_block_shard` |
| `gas_variant` | Gas price operations | `gas_price`, `gas_price_by_block` |
| `validators_variant` | Validator operations | `validators_current`, `validators_by_epoch` |
| `simple` | 1:1 nearcore path to YAML | `tx_status`, `send_tx` |
| `custom` | Not in nearcore, hand-written | `metrics`, `latest_block` |

### Description resolution

- `resolveDescription` in `scripts/generate-from-nearcore.js` picks the operation description: `simple` types use the curated `op.description` in `scripts/nearcore-operation-map.js` by presence (override), falling through to the schemars-authored description in `../nearcore/chain/jsonrpc/openapi/openapi.json` and then to the existing leaf YAML; `decomposed` (`query`, `block_variant`, `chunk_variant`, `gas_variant`, `validators_variant`) and `custom` ops stay curated because schemars is too generic or absent.
- `PARAM_DESCRIPTIONS` + `applyParamDescriptions` backfill parameter-field descriptions nearcore does not annotate (`method_name`, `include_proof`, light-client-proof `type`) — global, request-only, applied only where the field is still empty.
- `op.fieldDescriptions.{request,response}` + `applyFieldDescriptions` are per-operation field overrides that win by presence — the only local layer that reaches a field already filled by a `LEAF_TYPE_MAP` type description, or a **response** field (`PARAM_DESCRIPTIONS` touches neither). Used to curate the `view_state` pagination fields (`after_key_base64`, `limit`, `last_key`) nearcore 2.13.0 shipped without `///` docs; delete an entry to defer back to nearcore once it annotates the field upstream.
- The generator emits `dead-override`, `gap`, and `schemars-missing` warnings so stale overrides and silent regressions surface at build time.
- Full rules and the upstream E2E edit recipe live in `PORTAL_WORKFLOW.md` → Description Precedence.

### Adding a new RPC operation

1. Add an entry to `OPERATIONS` in `scripts/nearcore-operation-map.js`
2. Run `npm run generate-rpc`
3. Review generated YAML under `rpcs/<category>/`
4. Then in builder-docs: create an MDX page and add to `sidebars.js`

### Regenerating after nearcore changes

```bash
# Default path: ../nearcore/chain/jsonrpc/openapi/openapi.json
npm run generate-rpc

# Custom path
node scripts/generate-from-nearcore.js /path/to/openapi.json
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `redocly.yaml` | Portal config (APIs, display, chrome visibility) |
| `sidebars.yaml` | Navigation sidebar structure |
| `reference.page.yaml` | Single-operation page settings (`pagination: item`) |
| `rpcs/openapi.yaml` | Aggregate RPC spec (auto-generated, `$ref`s to all operations) |
| `apis/<service>/openapi.yaml` | Vendored per-service REST API specs |
| `enhancements/<service>/manifest.yaml` | Vendored docs enhancement manifests for preset-driven request defaults |
| `@theme/ext/configure.ts` | Try-It console config: auth, presets, body, env vars |
| `shared/generatedEnhancements.ts` | Auto-generated enhancement bundle consumed by shared helpers and `configure.ts` |
| `scripts/generate-from-nearcore.js` | nearcore → YAML generator |
| `scripts/sync-external-apis.js` | Sync sibling service specs into `apis/<service>/` |
| `scripts/run-realm-build.js` | Wrapped Reunite build with local-plan fallback |
| `scripts/nearcore-operation-map.js` | Declarative operation mapping |
| `scripts/test-operations.js` | Smoke test operation pages |
| `scripts/audit-description-quality.js` | R1–R8 / S / W rules for operation-level descriptions (warnings + `:strict` CI gate) |
| `scripts/audit-description-drift.js` | Enforce every `docs/api/**` and `docs/rpc/**` MDX page resolves to `UPSTREAM_DIRECT` |
| `scripts/audit-parameter-descriptions.js` | F1/F2/F3 rules for every page-model `interaction.fields[].description` |
| `scripts/generate-page-models.js` | Builds the shared page-model + structured-graph artifacts; enforces the `canonicalPath` / `pageModelId` / `request.examples[].id` stability contract via `auditPageModelCompatibility` + `reconcileRequestExampleIds` |
| `INTEGRATION_GUIDE.md` | Integration reference for embedding in builder-docs |
| `PORTAL_WORKFLOW.md` | Working agreement for sync, validation, deployment, and limitations |

## Development Notes

- Redocly CLI version: `@redocly/realm` 0.119.1
- Preview server default port: 4000
- Run Redocly preview from the `mike-docs` repo root only.
- Do not use `.claude/worktrees/*` as a local Redocly project; preview commands now fail fast if those nested configs are present.
- If broken-link diagnostics mention `.claude/worktrees/...`, you are looking at a stale nested agent worktree rather than the current portal config.
- `custom` type operations in the operation map are not overwritten by the generator
- `PLAN_GATES` is the production-equivalent entitlement JWT for `realm build`; `REDOCLY_AUTHORIZATION` is a separate API key and does not replace it
- For local validation, `npm run build` can fall back to `REDOCLY_LOCAL_PLAN=enterprise` or `pro`
- Pushing to GitHub does not by itself describe the Redocly publish target; if production `/apis/...` routes still 404, the deployed portal likely has not republished this revision yet
- Do not hand-edit `apis/<service>/`; the sync step overwrites vendored copies

### `requestValues.body` internals

The `body` field on Redocly's `requestValues` is documented sparsely but confirmed in the Redocly source:
- **Type**: `body?: any` in `ReplayOnChangeParams.requestValues` (`@redocly/replay/dist/replay.d.ts`)
- **Processing**: `convertOperationToReplayValue()` in `openapi-docs/lib-esm/components/Replay/utils.js` passes `requestValues.body` as the value for the active MIME type (default `application/json`) into `convertRequestBody()`
- **Behavior**: Creates a single "default" example with the body value, **fully replacing** the named examples from the YAML spec. This is not a recursive merge — passing `{ params: { block_id: 123 } }` alone would result in an incomplete JSON-RPC request. The caller must always pass the full envelope.

### Legacy Redocly communication model

When you are validating the legacy Redocly path, request shaping still flows through the URL into `configure.ts`. The public direct-render runtime in `builder-docs` no longer depends on that iframe contract.

External consumers that embed the hosted `docs.fastnear.com/rpcs/...` or `/apis/...` pages can now receive resize messages via `postMessage` from `FastnearHostedOperationPage`.
