# Portal Workflow

This document is the operational guide for working on the FastNEAR generation pipeline and legacy Redocly runtime in this repo.

If you are adding a brand-new REST API service, pair this guide with [SERVICE_ONBOARDING_CHECKLIST.md](SERVICE_ONBOARDING_CHECKLIST.md).

## What Lives Where

- `rpcs/` is owned here and generated from `../nearcore`.
- `apis/<service>/` is vendored here, but owned in sibling service repos:
  - `../fn/fastnear-api-server-rs/openapi`
  - `../fn/explorer-api/openapi`
  - `../fn/transfers-api/openapi`
  - `../fn/kv-fastdata-server/openapi`
  - `../fn/neardata-server/openapi`
- `enhancements/<service>/manifest.yaml` is owned here for the portal-side docs enhancement layer.
- `builder-docs` vendors generated page models from this repo and renders the public docs pages directly.

## The Normal Workflow

1. Edit the source-of-truth spec in the owning repo.
2. Edit `enhancements/<service>/manifest.yaml` in this repo when an operation needs portal-side preset or interaction behavior.
3. Run `npm run check:external-openapi` in this repo when the sibling service repos are available.
4. Run `npm run preview`, `npm run lint`, or `npm run build` in this repo.
5. Those commands resync the aggregate specs, regenerate `apis/<service>/` leaf files, regenerate the shared enhancement bundle, and refresh the generated page-model artifacts automatically before they continue.
6. Verify routes locally:
   - `npm run smoke:operations`
   - `npm run standalone:build`
7. Push the changes in this repo or through the existing Redocly-connected publish path.

## Local Environment

Local Redocly policy:

- The `mike-docs` repo root is the only supported local Redocly project.
- Do not use `.claude/worktrees/*` as a portal preview source.
- If you see broken-link diagnostics referencing `.claude/worktrees/...`, you are looking at a stale nested worktree copy rather than the current root config.

Create a local Redocly env file if you want static builds:

```bash
cat > .env.redocly.local <<'EOF'
PLAN_GATES=replace_with_real_plan_gates_jwt
REDOCLY_AUTHORIZATION=replace_with_redocly_api_key
REDOCLY_LOCAL_PLAN=enterprise
EOF
```

Supported variables:

- `PLAN_GATES=<jwt>` for a production-equivalent Reunite build.
- `REDOCLY_AUTHORIZATION=<key>` for personal Redocly CLI/API auth when needed.
- `REDOCLY_LOCAL_PLAN=enterprise` or `REDOCLY_LOCAL_PLAN=pro` for local-only validation builds.
- `FASTNEAR_API_KEY=<key>` for authenticated `/metrics` checks in the RPC example audit.

`REDOCLY_AUTHORIZATION` is a different credential. It can help with Redocly API/CLI auth, but it does not replace `PLAN_GATES` for the real `realm build` entitlement flow.

## Commands

- `npm run sync:apis`
  Sync all service-owned aggregate specs into `apis/<service>/`, split them into per-operation leaf files, and rebuild the generated enhancements and page-model artifacts.
- `npm run check:external-openapi`
  Run `cargo run --features openapi --bin generate-openapi -- --check` across sibling service repos when the workspace is present.
- `npm run preview`
  Syncs REST specs, verifies you are running from the repo root, rejects stale nested `.claude/worktrees/*` Redocly configs, then starts Redocly preview without mutating tracked RPC examples.
- `npm run preview:fresh-examples`
  Syncs REST specs, refreshes tracked RPC examples, then applies the same root-only Redocly preview guard.
- `npm run lint`
  Syncs REST specs, prints the authoritative Redocly project/config, warns about stale nested `.claude/worktrees/*` Redocly configs, then validates all OpenAPI definitions.
- `npm run build`
  Syncs REST specs, prints the authoritative Redocly project/config, warns about stale nested `.claude/worktrees/*` Redocly configs, then runs the wrapped Reunite build without mutating tracked RPC examples.
- `npm run build:fresh-examples`
  Syncs REST specs, refreshes tracked RPC examples, then runs the wrapped Reunite build.
- `npm run verify:workspace`
  Run `lint`, `build`, and the 12 audits as a single gate: `page-model-routes`, `structured-graph`, `rpc-example-placeholders`, `rpc-examples:all`, the five service-default audits (`fastnear`, `transfers`, `kv-fastdata`, `neardata`, `transactions`), `description-quality:strict`, `description-drift`, and `parameter-descriptions:strict`.
- `npm run audit:rpc-examples`
  Run the fast curated subset of live RPC example checks.
- `npm run audit:rpc-examples:all`
  Run the full live audit for every non-mutating RPC example.
- `npm run audit:rpc-example-placeholders`
  Run the static placeholder audit so generic generator defaults like `example.near` or `ExampleCodeHash` never quietly slip back into tracked RPC examples.
- `npm run audit:fastnear-defaults`
  Run the live FastNEAR API default audit using network-aware account, token, and public-key defaults.
- `npm run audit:transfers-defaults`
  Run the live Transfers API default audit for the current mainnet-only surface.
- `npm run audit:kv-fastdata-defaults`
  Run the live KV FastData default audit using discovered contract, predecessor, and key examples when available.
- `npm run audit:neardata-defaults`
  Run the live Near Data default audit using the effective per-network load defaults.
- `npm run audit:transactions-defaults`
  Run the live Transactions API default audit using fresh block, receipt, and transaction IDs derived from recent account activity.
- `npm run audit:page-model-routes`
  Fail if the generated page-model routes diverge from the on-disk `rpcs/**` and `apis/**` leaves.
- `npm run audit:structured-graph`
  Fail if the generated structured-graph artifact drops nodes or edges that the page-model set still references.
- `npm run audit:description-quality`
  Warnings-only report against every page-model description using the R1–R8 / S / W rule set in `scripts/audit-description-quality.js`.
- `npm run audit:description-quality:report`
  Same rule set, emitted as a Markdown triage report for upstream/override/allowlist sorting.
- `npm run audit:description-quality:strict`
  Same rule set, exits non-zero on any R* failure — the CI gate.
- `npm run audit:description-drift`
  Verify every `docs/api/**` and `docs/rpc/**` MDX page in `builder-docs` resolves to `UPSTREAM_DIRECT` — no `MDX_ONLY` authored descriptions, no uncovered `UPSTREAM_ONLY` pages.
- `npm run audit:parameter-descriptions`
  Warnings-only audit of every page model's `interaction.fields[].description` using rules F1 (present), F2 (≥10 chars), F3 (not a name echo).
- `npm run audit:parameter-descriptions:strict`
  Same rules, exits non-zero on any F* failure — the CI gate.
- `npm run discover:fastnear-context`
  Print the live FastNEAR API context used for account, token, and public-key defaults.
- `npm run discover:transfers-context`
  Print the live Transfers API context currently used for the mainnet defaults.
- `npm run discover:kv-fastdata-context`
  Print the live KV FastData context used for contract, predecessor, and key defaults.
- `npm run discover:rpc-context`
  Print the live block/chunk/transaction context used to refresh volatile RPC examples.
- `npm run discover:neardata-context`
  Print the latest finalized and optimistic Near Data block context for mainnet and testnet.
- `npm run discover:transactions-context`
  Print recent Transactions API context such as the latest block height, tx hashes, and receipt ID used for load-time defaults.
- `npm run smoke:operations`
  Smoke-tests representative local pretty routes.

## Description Precedence

Operation descriptions resolve as follows:

- **REST services** (`apis/<service>/...`): upstream Rust in `src/openapi.rs` of each owning service repo is the single source of truth. `scripts/generate-page-models.js` uses `operation.description || document.info?.description` when building page models — enhancement manifests do not override descriptions today.
- **RPC methods** (`rpcs/...`): `scripts/generate-from-nearcore.js` resolves descriptions in this order (see `resolveDescription`):
  - `type: 'simple'` — `op.description` in `scripts/nearcore-operation-map.js` wins by presence (curated override); otherwise the schemars-authored `paths.<nearcorePath>.post.description` from `../nearcore/chain/jsonrpc/openapi/openapi.json` is used; existing YAML is the final fallback.
  - Decomposed variants (`query`, `block_variant`, `chunk_variant`, `gas_variant`, `validators_variant`) — `op.description` only; schemars covers many variants with a single generic line, so upstream is too coarse to use.
  - `type: 'custom'` (e.g. `latest_block`, `metrics`) — `op.description` only; nearcore has no source.
- To defer a simple-type RPC description back to nearcore upstream, delete its `description` field from the operation-map entry. The generator will pick up the schemars text and warn if schemars is missing.
- The generator emits three classes of warning at the end of a run: `dead-override` (curated byte-equal to schemars), `gap` (no source produced a description), and `schemars-missing` (simple op with no upstream description — likely a nearcore regression or newly-added path).

Field-level (parameter and response) descriptions resolve on a separate axis from the operation description:

- `LEAF_TYPE_MAP` gives leaf types a concise type-level description (e.g. `StoreKey` → "Base64-encoded storage key"), so a field nearcore leaves undocumented falls back to its *type's* wire-format text rather than its role.
- `PARAM_DESCRIPTIONS` + `applyParamDescriptions` backfill **request** fields by global field name, but only where the field description is still empty.
- `op.fieldDescriptions.{request,response}` + `applyFieldDescriptions` are explicit **per-operation** overrides that win by presence. This is the only local layer that can override a leaf-type-filled field or annotate a **response** field (`PARAM_DESCRIPTIONS` reaches neither). First use: the `view_state` pagination fields (`after_key_base64`, `limit`, `last_key`) that nearcore 2.13.0 shipped without `///` docs. Delete an entry to defer back to upstream once nearcore annotates the field. Draft upstream ask: `drafts/nearcore-openapi-field-descriptions-issue.md`.

## Changing a Description Upstream (E2E Recipe)

Works for any of the 5 Rust service repos (`fastnear-api-server-rs`, `explorer-api`, `transfers-api`, `kv-fastdata-server`, `neardata-server`):

```bash
# 1. Edit the inline description string in the owning repo:
#    ../fn/<service>/src/openapi.rs

# 2. Regenerate the upstream openapi.yaml:
cd ../fn/<service> && cargo run --features openapi --bin generate-openapi

# 3. Back in mike-docs: sync and regenerate page models.
cd -
npm run sync:apis

# 4. Confirm the new text flowed through:
node -e "const m=require('./shared/generatedFastnearPageModels.json');\
 const op=m.find(x=>x.info?.operationId==='<operationId>');\
 console.log(op.info.description);"
```

The vendored copy at `../fn/builder-docs/src/data/generatedFastnearPageModels.json` is updated by the same `npm run sync:apis` run. Commit upstream and mike-docs as a coordinated pair per the feature-branch workflow in `CLAUDE.md`.

## Tracked RPC Example Follow-Ups

- `metrics` on mainnet and testnet is modeled as HTTP `GET /metrics`, not JSON-RPC.
  It requires `FASTNEAR_API_KEY` for live validation, so unauthenticated audit runs will continue to report it as a tracked skip.
- `light_client_proof` and `EXPERIMENTAL_light_client_proof` examples pin `type: receipt`.
  Nearcore narrowed the enum to `[receipt]`; the generator, `scripts/refresh-examples.js`, `scripts/rpc-example-config.js`, and `MANUAL_RPC_EXAMPLE_OVERRIDES` are all aligned on `receipt` so a refresh does not regress. If nearcore ever widens the enum, these overrides need to be revisited in lockstep.
- `view_global_contract_code` and `view_global_contract_code_by_account_id` on mainnet still need a curated account/hash pair.
  Testnet examples are verified; mainnet remains intentionally tracked until we confirm a real example that succeeds on load.
- `scripts/rpc-example-config.js` is the shared source for curated static RPC params, manual per-network overrides, tracked follow-ups, and the small allowlist of known placeholder gaps that still need real curation.
- `broadcast_tx_async`, `broadcast_tx_commit`, and `send_tx` are intentionally excluded from the live audit.
  They require a freshly signed transaction, so the automated audit keeps them out of CI and treats them as manual-only validation.

## What Will Not Work

- Hand-editing vendored files under `apis/<service>/` is not durable.
  `npm run sync:apis`, `npm run preview`, `npm run lint`, and `npm run build` overwrite them from the owning service repo.
- Hand-editing `shared/generatedEnhancements.ts` is not durable.
  Update the portal-owned manifest at `enhancements/<service>/manifest.yaml` instead.
- `npm run check:external-openapi` is workspace-aware, not standalone-repo magic.
  It expects the sibling service repos; when those are absent, it skips and the portal validates the committed vendored `apis/<service>/` trees instead.
- `REDOCLY_AUTHORIZATION` alone will not unlock a production-equivalent build.
  Use `PLAN_GATES` for that path, or `REDOCLY_LOCAL_PLAN` for local validation.
- Pushing to GitHub does not guarantee the public site updates immediately.
  If production still returns stale pages, the missing step is often a `builder-docs` publish rather than a problem in this repo.
- This repo does not encode the Redocly publish target.
  CI validates and uploads the static `public/` artifact, but org/project/mount-path live outside this repo.
- `npm run preview:fresh-examples`, `npm run refresh-examples`, and `npm run build:fresh-examples` mutate tracked RPC example values.
  `scripts/refresh-examples.js` fetches fresh chain data and updates several `rpcs/*.yaml` files with current block, chunk, tx, and receipt examples.
- Nested `.claude/worktrees/*` Redocly configs are not supported preview targets.
  Preview commands now fail fast when they detect those stale worktree copies so they cannot confuse local QA.
- `server=` is currently only a docs-enhancement hint, not a forced Redocly server switch.
  The portal can seed preset values and env vars from `preset`/`network`/`server`, but Redocly does not currently expose a clean URL-level API for selecting the server dropdown directly.
- Near Data block-height defaults are a fallback, not the only source of truth.
  The manifest still keeps stable genesis presets, but the custom runtime now upgrades Near Data block pages to fresh finalized or optimistic heights on load when the live service responds.
- Transactions API block, receipt, and hash defaults are also upgraded at runtime.
  Stable manifest presets remain as fallbacks, but the custom runtime now prefers recent account activity so block lookups, block ranges, receipt lookups, and transaction-hash pages feel current on load.
- Transfers API is currently mainnet-only.
  The docs now audit that surface explicitly, but we should not imply testnet support until a real `transfers.test.fastnear.com`-style host exists and resolves.
- Docs-only or ingestion-only repos without a public HTTP surface are intentionally out of scope for this OpenAPI flow.

## Production Verification

When rollout changes are published correctly:

- `builder-docs` should serve fresh canonical `/rpcs/...` and `/apis/...` pages.
- the local build is probably fine,
- the generated `public/page-data/apis/...` output is probably present,
- and the missing step is usually publication of the updated public site from `builder-docs`.
