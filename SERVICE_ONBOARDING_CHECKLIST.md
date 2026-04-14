# New Service Onboarding Checklist

This checklist is the fastest safe path for onboarding a new FastNEAR REST API service into the docs stack.

Use it when a repo has a real public HTTP surface and should appear in:

- `mike-docs` as `/apis/<service>/...`
- `builder-docs` as a public API section

Do not use this for docs-only repos with no public HTTP API.

## 1. Decide Whether The Repo Is An API Target

The repo is a good fit if all of these are true:

- it exposes a public HTTP API
- the wire format is stable enough to document
- the repo can own its own aggregate OpenAPI output

Pause before onboarding if any of these are true:

- responses are still too dynamic or untyped to describe cleanly
- the repo has no public HTTP surface
- the docs would be mostly speculative instead of matching live behavior

## 2. Prepare The Service Repo

In the service repo:

- add `schemars`-backed request and response DTOs, or doc-only DTOs when runtime refactors would be excessive
- add a small Rust operation registry in `src/openapi.rs`
- keep the repo-owned generated artifact at `openapi/openapi.yaml`
- add the standard generator command:
  - `cargo run --features openapi --bin generate-openapi`
  - `cargo run --features openapi --bin generate-openapi -- --check`
- use `fastnear-openapi-generator` as the shared helper crate

Keep the service repo focused:

- the repo should own contract truth
- the repo should not own per-operation portal leaf files
- the repo should not own `mike-docs` enhancement manifests
- the repo should not own portal-only routing or presentation metadata

## 3. Validate The Service Repo First

Run in the service repo:

```bash
cargo test
cargo test --features openapi
cargo run --features openapi --bin generate-openapi
cargo run --features openapi --bin generate-openapi -- --check
```

Before moving on, confirm:

- `openapi/openapi.yaml` is fully generated and checked in
- the aggregate spec preserves the existing public wire format
- examples and descriptions do not require a parallel repo-local docs layer unless the API genuinely needs it

## 4. Register The Service In `mike-docs`

In `mike-docs`:

- add the service repo aggregate source to `scripts/sync-external-apis.js`
- add the Redocly API definition to `redocly.yaml`
- let the normal sync pipeline generate:
  - `apis/<service>/openapi.yaml`
  - `apis/<service>/**/*.yaml`
  - generated route maps for pretty-route parity

If the service needs Try-It presets or path/query defaults:

- add `enhancements/<service>/manifest.yaml`

## 5. Decide The Service Capability Profile

Update `@theme/ext/configure.ts` only if the new service needs a new capability profile.

Current patterns are:

- `rpc`
  - API key
  - bearer token
  - per-server request values
- `fastnear`
  - API key
  - presets
- `neardata`
  - API key
  - presets
- `kv-fastdata`
  - presets
- `transactions`
  - presets
- `transfers`
  - presets

Default rule:

- do not inject auth unless the API already documents and supports it

## 6. Add The Section To `builder-docs`

In `builder-docs`:

- create or update the section landing page under the matching root-mounted docs family in `builder-docs` (`docs/api/`, `docs/tx/`, `docs/transfers/`, `docs/neardata/`, or `docs/fastdata/kv/`)
- create operation pages that use `FastnearDirectOperation`
- point those pages at the generated `pageModelId` for the canonical route
- add the section to the appropriate navbar and sidebar

## 7. Validate The Full Docs Flow

In `mike-docs`:

```bash
npm run sync:apis
npm run lint
REDOCLY_LOCAL_PLAN=enterprise npm run build
npm run preview
node scripts/test-operations.js http://127.0.0.1:4000
```

In `builder-docs`:

```bash
yarn build
yarn start
```

Then verify:

- canonical pretty routes under `/apis/<service>/...` load and land on interactive Try-It pages
- `builder-docs` renders the same interaction and reference behavior directly
- presets, body overrides, and auth forwarding work only where intended
- mobile nav and section sidebars still feel readable

## 8. Publish And Smoke Production

Before calling the rollout done:

- publish the updated `builder-docs` site
- verify the live canonical route on `docs.fastnear.com`
- confirm the service section is reachable from the public docs navigation where applicable

If local is green but production still 404s:

- the missing step is usually publication of the latest `builder-docs` revision, not service-spec generation

## 9. Definition Of Done

The onboarding is done when all of these are true:

- the service repo owns a checked-in aggregate `openapi/openapi.yaml`
- `mike-docs` syncs and splits it successfully
- direct `/apis/<service>/...` browsing reaches interactive operation pages
- `builder-docs` pages work with the right auth and network behavior
- local lint, build, and smoke are green
- the live `builder-docs` route is green after publish

## 10. Current Reference Implementations

Use these as working examples:

- `../fn/fastnear-api-server-rs`
- `../fn/explorer-api`
- `../fn/transfers-api`
- `../fn/kv-fastdata-server`
- `../fn/neardata-server`

Out of scope:

- docs-only or ingestion-only repos without a public HTTP surface
