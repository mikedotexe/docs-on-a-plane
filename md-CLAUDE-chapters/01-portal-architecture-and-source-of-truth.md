# 01 Portal Architecture And Source Of Truth

This chapter explains what this repo owns, what it consumes from elsewhere, and which runtime is responsible for which part of the docs experience.

## Big Picture

There are three distinct layers:

1. `builder-docs` is the public-facing docs site.
2. `mike-docs` is the generation pipeline plus local verification backends for API/RPC reference pages.
3. Upstream service repos and nearcore remain the contract source of truth for most OpenAPI content.

The main production experience now runs through `builder-docs` and its hosted canonical `/rpcs/...` and `/apis/...` routes. Redocly remains available here as legacy infrastructure and verification scaffolding.

The bespoke UI styling source of truth is now `builder-docs/src/css/custom.css`. `mike-docs` stylesheets remain only as verification-oriented scaffolding for legacy Redocly preview and the standalone local runtime.

## Ownership Boundaries

### `rpcs/`

- Per-operation RPC leaf specs live under `rpcs/<category>/`.
- The aggregate RPC spec is `rpcs/openapi.yaml`.
- Most RPC leaf files are generated from nearcore through:
  - `scripts/nearcore-operation-map.js`
  - `scripts/generate-from-nearcore.js`
- `custom` operations in the operation map can remain hand-maintained.
- Operation descriptions resolve through `resolveDescription` in `scripts/generate-from-nearcore.js`: `simple` types use the curated override in the operation map by presence, falling through to the schemars description in nearcore and then to the existing leaf YAML; `decomposed` variants and `custom` ops stay curated. `PARAM_DESCRIPTIONS` + `applyParamDescriptions` backfill parameter fields nearcore does not annotate. Full precedence rules and the upstream E2E edit recipe live in `PORTAL_WORKFLOW.md` → Description Precedence.

### `apis/`

- REST specs are vendored under `apis/<service>/`.
- They are sourced from sibling repos and split into portal-owned leaf files by `scripts/sync-external-apis.js`.
- Do not hand-edit `apis/<service>/`; the sync step overwrites vendored copies.

### `enhancements/`

- Docs-only behavior for REST APIs lives under `enhancements/<service>/manifest.yaml`.
- This is intentionally separate from OpenAPI.
- Enhancements are compiled into `shared/generatedEnhancements.ts`.

## Runtime Surfaces

### Redocly pretty routes

- Example: `/rpcs/account/view_account`
- File-oriented and still useful for Redocly parity checks.

### Redocly operation routes

- Example: `/reference/operation/view_account`
- Generated through `reference.page.yaml` and operation-route helpers.

### Standalone runtime routes

- `npm run standalone:dev`
- Example: `http://127.0.0.1:4010/rpcs/account/view_account`
- Separate app and server, intentionally not powered by Redocly runtime code.

## Current Architectural Split

### Still handled by Redocly

- Legacy portal shell and operation pages
- Verification of `configure.ts` behavior
- Legacy `/reference/operation/...` routes

### Now handled by the bespoke runtime

- Full public RPC docs surface
- Full public FastNEAR, NEAR Data, Transfers, KV FastData, and Transactions API surfaces
- Shared browser auth behavior
- Request/response docs rendering through generated page models
- Canonical `/rpcs/...` and `/apis/...` hosted routes in `builder-docs`

## High-Value Files

- `redocly.yaml`: portal configuration and redirects
- `reference.page.yaml`: operation-page pagination behavior
- `@theme/ext/configure.ts`: Try-It request shaping for the Redocly runtime
- `shared/portalAuth.ts`: canonical browser auth reader/writer logic
- `shared/FastnearOperationPage.tsx`: primary bespoke interaction + reference runtime
- `builder-docs/src/css/custom.css`: canonical bespoke UI styling
- `@theme/components/OpenApiDocs/hooks/BeforeOpenApiOperation.tsx`: Redocly operation-page injection point
- `scripts/generate-page-models.js`: shared page-model generator
- `scripts/standalone-common.js`: standalone dev/build runtime

## Decision Guide

- If the work changes contract truth, start with OpenAPI or nearcore generation.
- If the work changes REST request defaults without changing OpenAPI, start with `enhancements/` and the page-model generation path.
- If the work changes the blockchain-native pilot UI, start with `shared/FastnearOperationPage.tsx`.
- If the work is visual polish, spacing, sizing, or layout tuning for the public docs, start with `builder-docs/src/css/custom.css` and do not mirror that work into `mike-docs` unless a verification surface becomes unreadable.
- If the work changes no-Redocly experimentation, start with `standalone/` and the standalone scripts.
