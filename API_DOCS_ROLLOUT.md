# API Docs Rollout Tracker

This file is the source of truth for the multi-repo API docs rollout.

## Locked Decisions

- Specs are owned in the service repos and vendored into `mike-docs`.
- Redocly namespaces are split per service:
  - `apis/fastnear`
  - `apis/transactions`
  - `apis/transfers`
  - `apis/kv-fastdata`
  - `apis/neardata`
- `builder-docs` is the long-term home of the bespoke presentation runtime.
- `mike-docs` is the long-term home of spec sync, enhancement metadata, generated page models, and legacy delivery glue.
- `builder-docs/src/css/custom.css` is the canonical bespoke UI stylesheet.
- `mike-docs` bespoke CSS is verification-only scaffolding and should not receive routine polish mirroring.
- Iframes are now considered transitional scaffolding for legacy pages and not the long-term bespoke architecture.
- Phase 1 excludes `fastnear-api-server-rs` experimental `/exp/*` routes.

## Service Mapping

| Repo | Public docs namespace | Notes |
| --- | --- | --- |
| `fastnear-api-server-rs` | `fastnear` | Mainnet + testnet indexed account/token APIs |
| `explorer-api` | `transactions` | Public transactions/receipts/blocks API |
| `transfers-api` | `transfers` | Account-centric transfer history API |
| `kv-fastdata-server` | `kv-fastdata` | FastData key-value query API |
| `neardata-server` | `neardata` | Cached/archive NEAR block data API |

## Rollout Status

| Repo | Inventory complete | Spec source chosen | Spec authored/generated | Synced into `mike-docs` | Redocly lint green | Builder-docs pages added | Manual smoke test done |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `transfers-api` | yes | yes | yes | yes | yes | yes | yes |
| `explorer-api` | yes | yes | yes | yes | yes | yes | yes |
| `fastnear-api-server-rs` | yes | yes | yes | yes | yes | yes | yes |
| `kv-fastdata-server` | yes | yes | yes | yes | yes | yes | yes |
| `neardata-server` | yes | yes | yes | yes | yes | yes | yes |

## Bespoke UI Rollout Order

This is the current implementation order for replacing generic operation pages with the bespoke interaction/reference system:

1. `fastnear-api-server-rs`
2. `neardata-server`
3. `transfers-api`
4. `kv-fastdata-server`
5. `explorer-api`

Current bespoke status:

| Repo | Bespoke status | Notes |
| --- | --- | --- |
| `fastnear-api-server-rs` | complete | The full public FastNEAR API surface now uses the bespoke REST-read interaction/reference path across `system`, `v0`, and `v1`. |
| `neardata-server` | complete | The full public neardata surface now uses the bespoke REST-read interaction/reference path. |
| `transfers-api` | pilot live | `/apis/transfers/v0/transfers` is now the first bespoke HTTP JSON-body page, proving the body-builder path. |
| `kv-fastdata-server` | complete | The full public KV FastData surface now uses the bespoke path, including GET exact-key routes, mixed path/body POST routes, and the `multi` array-body route. |
| `explorer-api` | complete | The full public transactions/explorer surface now uses the bespoke body-driven path, including account, block, blocks, receipt, and transactions lookups. |

The full public NEAR RPC surface now also uses the bespoke JSON-RPC interaction/reference path across `account`, `block`, `contract`, `protocol`, `transaction`, and `validators`.

## Bespoke Backlog

Use this as the implementation checklist for the custom interaction/reference rollout.

### 1. Finish `neardata-server`

- [x] `/apis/neardata/v0/block`
- [x] `/apis/neardata/system/health`
- [x] `/apis/neardata/v0/block_headers`
- [x] `/apis/neardata/v0/block_chunk`
- [x] `/apis/neardata/v0/block_shard`
- [x] `/apis/neardata/v0/block_optimistic`
- [x] `/apis/neardata/v0/first_block`
- [x] `/apis/neardata/v0/last_block_final`
- [x] `/apis/neardata/v0/last_block_optimistic`

### 2. Finish FastNEAR API

- [x] `/apis/fastnear/system/health`
- [x] `/apis/fastnear/system/status`
- [x] `/apis/fastnear/v0/account_ft`
- [x] `/apis/fastnear/v0/account_nft`
- [x] `/apis/fastnear/v0/account_staking`
- [x] `/apis/fastnear/v0/public_key_lookup`
- [x] `/apis/fastnear/v0/public_key_lookup_all`
- [x] `/apis/fastnear/v1/account_ft`
- [x] `/apis/fastnear/v1/account_nft`
- [x] `/apis/fastnear/v1/account_staking`
- [x] `/apis/fastnear/v1/account_full`
- [x] `/apis/fastnear/v1/ft_top`
- [x] `/apis/fastnear/v1/public_key_lookup`
- [x] `/apis/fastnear/v1/public_key_lookup_all`

### 3. Route And Verification Cleanup

- [x] Ensure pretty routes, aggregate routes, and standalone routes are aligned for every bespoke page.
- [x] Add smoke coverage for representative bespoke REST routes across `fastnear` and `neardata`.
- [ ] Review whether server-side redirects in `redocly.yaml` are still the right mechanism for API pretty routes or whether client-side canonicalization is sufficient.

### 4. First Body-Driven Bespoke API

- [x] Pilot `transfers-api` with a polished POST/body interaction.
- [ ] Generalize the bespoke UI for request-body editing, enums, booleans, and pagination affordances.

### 5. Richer Data APIs

- [x] Roll the body-builder pattern into `kv-fastdata-server`.
- [x] Apply the mature body-driven pattern to `explorer-api`.

### 6. Full RPC Surface

- [x] Expand the bespoke JSON-RPC runtime from the `account` + `block` pilot to the full public RPC surface.
- [x] Move all public RPC docs pages in `builder-docs` from `RpcRedoc` embeds to native direct rendering.

## Redocly Decommission Track

Redocly/Realm is now treated as the legacy delivery backend. `builder-docs` is the presentation runtime for bespoke pages, while the standalone runtime remains a local verification surface built from the same generated page models. Redocly remains in place only as transitional delivery for unmigrated slices and the current production host.

### Phase 1. Slice Completion And Backend Abstraction

- [x] Finish the bespoke RPC `account` + `block` slice.
- [x] Finish the bespoke `neardata` slice.
- [x] Finish the bespoke FastNEAR API slice.
- [x] Generate machine-readable bespoke coverage data in `mike-docs`.
- [x] Vendor the same coverage data into `builder-docs`.
- [x] Introduce backend-agnostic iframe components in `builder-docs`.
- [x] Keep `ApiRedoc` / `RpcRedoc` as compatibility aliases.
- [x] Route covered slices to standalone locally via `?redoclyLocal` while keeping legacy slices on Redocly.

### Phase 2. Builder-Docs Runtime Migration

- [x] Vendor generated bespoke page-model data into `builder-docs`.
- [x] Ship the first direct-rendered bespoke page in `builder-docs` for `/rpc/account/view-account`.
- [x] Add iframe auto-height messaging for remaining bespoke iframe pages as transitional UX relief.
- [x] Generalize the builder-docs direct-render runtime so additional bespoke pages can move off iframes without re-copying component logic.
- [x] Move the completed RPC `account` + `block` bespoke slices to direct rendering in `builder-docs`.
- [x] Move the completed bespoke REST slices to direct rendering in `builder-docs`:
  - `apis/neardata/**`
  - `apis/fastnear/system/**`
  - `apis/fastnear/v0/**`
  - `apis/fastnear/v1/**`

### Phase 3. Remaining Bespoke Rollout

- [x] Implement the first body-driven bespoke page for `transfers-api`.
- [x] Roll the mature body-builder pattern into `kv-fastdata-server`.
- [x] Apply the mature body-driven pattern to `explorer-api`.
- [x] Expand the bespoke JSON-RPC path to the full public RPC surface.

### Phase 4. Production Host Decision And Repoint

- [x] Choose the production bespoke host.
- [x] Update `builder-docs` to point bespoke slices at that host outside localhost.
- [ ] Verify embedded routes in the deployed `builder-docs` site against the production bespoke host.
- [x] Repoint the remaining iframe-served bespoke slices to that host until they are direct-rendered in `builder-docs`.

### Phase 5. Remove Realm/Redocly

- [ ] Remove Redocly-only route glue once all consumed slices are served by the bespoke host.
- [ ] Remove Realm/Redocly build and preview steps when no published routes still depend on them.
- [ ] Simplify `mike-docs` into the generation pipeline and any remaining delivery glue only.
- [ ] Reduce `mike-docs` bespoke CSS to a minimal verification baseline, with `builder-docs` CSS treated as the only polished source of truth.

#### Concrete Cleanup Checklist

- [ ] Replace legacy Redocly verification in `npm run preview`, `npm run lint`, and `npm run build` with standalone-only or generator-only validation paths.
- [ ] Rewrite `scripts/test-operations.js` so smoke coverage no longer assumes the legacy Redocly route family or `reference.page.yaml` pagination.
- [ ] Remove browser-only Redocly route glue after the previous step:
  `scripts/generated-operation-routes.js`
  `scripts/api-operation-redirect.js`
- [ ] Remove the legacy Redocly interaction and theme hooks once no local QA flow depends on them:
  `@theme/ext/configure.ts`
  `@theme/styles.css`
  `@theme/components/OpenApiDocs/hooks/BeforeOpenApiOperation.tsx`
- [ ] Remove the remaining Redocly config surface after no scripts invoke it:
  `redocly.yaml`
  `reference.page.yaml`
  `sidebars.yaml`
  `scripts/redocly-root-guard.js`
  `scripts/run-realm-build.js`
- [ ] Drop `@redocly/realm` from `package.json` after build/preview decommission is complete.
- [ ] Remove local Plan Gates onboarding leftovers that only existed for the legacy build path.
- [ ] Archive or delete historical Redocly migration notes once they stop informing active work:
  `docs/no-redocly-view-account-spike.md`
  `md-CLAUDE-chapters/04-custom-interactions-and-redocly-overrides.md`
  `md-CLAUDE-chapters/05-standalone-no-redocly-spike.md`

## Validation Notes

- April 10, 2026: `fastnear-api-server-rs` now generates its OpenAPI from typed Rust DTOs and a Rust-owned operation registry. `/exp/*` support remains generator-ready but unpublished by default until public deployment enables `EXPERIMENTAL_API=true`.
- April 10, 2026: FastNEAR embeds now forward an optional `apiKey` query param through `builder-docs` and `mike-docs`, while bearer-token and RPC-only header injection remain scoped to RPC pages.
- April 11, 2026: `neardata-server` now generates its OpenAPI from typed stable DTOs plus minimal repo-local raw-schema helpers; `components.yaml` has been removed and redirect/auth behavior is documented explicitly in the generated output.
- `npm run lint` is green in `/Users/mikepurvis/near/mike-docs`.
- `REDOCLY_LOCAL_PLAN=enterprise npm run build` is green in `/Users/mikepurvis/near/mike-docs`; the local static build now completes end-to-end.
- `yarn build` is green in `/Users/mikepurvis/near/fn/builder-docs`.
- Preview smoke coverage now lives in `npm run smoke:operations` for representative RPC and API pretty routes.
- Live route verification now belongs to the deployed `builder-docs` site at [docs.fastnear.com](https://docs.fastnear.com), not the retired Redocly production path.
- April 11, 2026: workspace stale-spec enforcement now lives in `npm run check:external-openapi`, which runs `cargo run --features openapi --bin generate-openapi -- --check` across all converted sibling service repos when the shared FastNEAR workspace is present.
- April 11, 2026: `npm run lint` and `npm run build` now enforce the external stale-spec check before syncing, while `scripts/sync-external-apis.js` falls back to the committed vendored `apis/<service>/` trees when sibling repos are unavailable.
- April 11, 2026: `fastnear-openapi-generator` v0.2.0 is published on crates.io and the converted service repos consume it as a normal versioned dependency instead of a sibling path dependency.
- April 11, 2026: the generalized docs-enhancement layer is portal-owned. `enhancements/<service>/manifest.yaml` now lives in `mike-docs`, and `@theme/ext/configure.ts` seeds preset-driven path/query/body values via `preset`, `network`, and explicit `path.*` / `query.*` / `header.*` URL overrides.
- April 11, 2026: the external service repos are now aggregate-first and Rust-first. Each API repo owns only `openapi/openapi.yaml` plus its Rust registry/types, while `mike-docs` owns splitting into `apis/<service>/...` leaf files and, at that stage, still owned the old single-network verification variants that were later retired.
- `npm run build` in `mike-docs` now prefers `PLAN_GATES` from the shell environment or `.env.redocly.local`, with a local-only fallback via `REDOCLY_LOCAL_PLAN=enterprise|pro` for developer validation.
- GitHub Actions parity now lives in `.github/workflows/portal-build.yml` and runs `npm ci`, `npm run lint`, and `npm run build` on pull requests, pushes to `main`, and manual dispatches.
- April 11, 2026: local smoke is green with `20 passed, 0 failed`, covering canonical `/apis/...` routes plus the then-current single-network legacy verification variants from preview.
- April 11, 2026: the old Redocly production host still lagged canonical `/apis/...` route publication during the migration, which is one of the reasons production ownership moved fully to `builder-docs`.
- April 12, 2026: the full `neardata-server` public surface is now on the bespoke REST-read page path, with portal-owned manifest metadata, generated shared page models, standalone parity, and aligned mainnet/testnet preset defaults.
- April 12, 2026: the full FastNEAR API public surface is now on the bespoke REST-read page path across `system`, `v0`, and `v1`, with generated standalone models, a generated shared page registry, and backend coverage data vendored into `builder-docs`.
- April 12, 2026: Phase 1 backend abstraction is live in `builder-docs`. `ApiDocsFrame` / `RpcDocsFrame` now resolve bespoke slices to the standalone backend locally (`127.0.0.1:4010`) and keep legacy slices on local Redocly preview (`127.0.0.1:4000`) while preserving canonical iframe paths and public query params.
- April 12, 2026: architecture direction is now explicit: `builder-docs` should own bespoke presentation, while `mike-docs` should own generation and legacy delivery. The direct-render `view_account` pilot in `builder-docs` is the first proof of that direction.
- April 12, 2026: the direct-render path now covers the bespoke RPC `account` and `block` docs in `builder-docs`, while remaining bespoke iframe pages use auto-height messaging as transitional UX relief.
- April 12, 2026: the direct-render path now also covers the current bespoke REST slices in `builder-docs` (`apis/neardata/**` and `apis/fastnear/v1/**`), so all currently bespoke pages are native in `builder-docs`.
- April 12, 2026: the remaining FastNEAR API `system` and `v0` pages are now direct-rendered in `builder-docs` too. There are no `ApiRedoc` or `RpcRedoc` pages left in the public wrapper tree; the full public docs surface is now native to the bespoke runtime.
- April 12, 2026: `/apis/transfers/v0/transfers` is now the first body-driven bespoke page. The generator emits HTTP JSON-body fields/examples/schema, the shared runtime can build and send JSON POST bodies, and `builder-docs` now renders the transfers page natively with the new body-builder path.
- April 12, 2026: the full `kv-fastdata-server` public slice is now on the bespoke path. The shared runtime now handles mixed path/body HTTP pages plus array body inputs, backend coverage includes `/apis/kv-fastdata/**`, and `builder-docs` renders the KV docs natively instead of through iframe-based Redocly pages.
- April 12, 2026: the full `explorer-api` public slice is now on the bespoke path. Backend coverage includes `/apis/transactions/**`, generated page models now cover all five public transactions endpoints, and `builder-docs` renders the transactions docs natively instead of through iframe-based Redocly pages.
- April 12, 2026: the full public NEAR RPC surface is now on the bespoke path. The generated page-model registry now covers all 40 leaf RPC operations, backend coverage includes `/rpcs/**`, the shared JSON-RPC runtime handles both object-style and array/no-arg payloads, and `builder-docs` renders all public RPC docs natively instead of through `RpcRedoc` embeds.
- April 12, 2026: Phase 4 now has a concrete production bespoke host: `https://docs.fastnear.com`. The generated backend coverage artifact points bespoke slices there outside localhost, and `builder-docs` now generates canonical hosted pages for `/rpcs/...` and `/apis/...` from the vendored page-model registry at build time.
- April 12, 2026: local static verification is green for canonical hosted routes on `builder-docs` (`/rpcs/account/view_account`, `/apis/fastnear/v1/account_full`, `/apis/transactions/v0/account`). The current deployed `docs.fastnear.com` host still returns `404` for those canonical hosted routes until the next `builder-docs` publish.
- April 13, 2026: `builder-docs/src/css/custom.css` is now explicitly treated as the polished bespoke UI source of truth. Response-pane stretch behavior is tuned there first, while `mike-docs` stylesheets are now labeled as verification-only and no longer expected to track routine visual polish.
- April 16, 2026: the RPC description pipeline and the REST parameter-description pipeline are both gated. `scripts/generate-from-nearcore.js` now inverts the source of truth for RPC descriptions (schemars primary for `simple` ops, operation-map override by presence, decomposed/custom stay curated), and `npm run verify:workspace` now runs `audit:description-quality:strict`, `audit:description-drift`, and `audit:parameter-descriptions:strict` as CI gates. Current status: 78/78 page models `UPSTREAM_DIRECT`, 158/158 parameter fields clean, 0 description-quality failures.
