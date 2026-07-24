# Docs Integration Guide for `builder-docs` and `mike-docs`

This document describes the current contract between generation in `mike-docs` and rendering in `builder-docs`.

## Current Model

`builder-docs` is the public runtime at `https://docs.fastnear.com`.
`mike-docs` is the source-of-truth repo for:

- RPC generation from nearcore
- REST spec sync and per-operation leaf splitting
- portal-owned enhancement manifests
- generated page-model artifacts
- the local standalone runtime
- the legacy Redocly verification path

Public docs pages are no longer iframe embeds. They render directly in `builder-docs` from generated page models.

## Shared Contract

The contract between the repos is now:

1. canonical public routes
   - `/rpcs/...`
   - `/apis/<service>/...`
2. generated page-model data
   - `mike-docs/shared/generatedFastnearPageModels.json`
   - `builder-docs/src/data/generatedFastnearPageModels.json`
3. generated structured graph data
   - `mike-docs/shared/generatedFastnearStructuredGraph.json`
   - `builder-docs/src/data/generatedFastnearStructuredGraph.json`
4. shared request/auth semantics encoded into those models and the direct runtime
5. stable identifiers preserved across regenerations
   - `pageModelId`, `canonicalPath`, and `request.examples[].id` are treated as public contract data by `scripts/generate-page-models.js` (`auditPageModelCompatibility` + `reconcileRequestExampleIds`). `builder-docs` uses the example ids in shareable `requestExample=<id>` URLs, so the generator fails loudly on ambiguous rename/removal rather than silently repurposing them.

`builder-docs` uses the vendored models in two places:

- root-mounted public wrapper pages such as `/rpc/**`, `/api/**`, `/tx/**`, `/transfers/**`, `/neardata/**`, `/fastdata/kv/**`, `/auth/**`, and `/agents/**` via `FastnearDirectOperation`
- generated hosted pages under `src/pages/rpcs/**` and `src/pages/apis/**` via `FastnearHostedOperationPage`

## Query Params And Browser State

The direct runtime supports these user-facing inputs:

| Input | Notes |
| --- | --- |
| `?apiKey=` | Wins over stored API key |
| `?token=` | Used where bearer-token flows still matter |
| `?network=` | Seeds the selected network when the page supports multiple networks |
| `?colorSchema=dark|light` | Honored by hosted pages for embedded use |
| `localStorage.fastnear:apiKey` | Canonical persisted API key |
| `localStorage.fastnear_api_key` | Legacy fallback; migrated away automatically |
| `localStorage.fastnear:bearer` | Stored bearer token when relevant |

The public direct runtime does not depend on the old iframe-only controls like `?redoclyLocal`, `?preset=`, or `?path.*=` / `?query.*=` / `?header.*=`. Those remain relevant only when validating the legacy Redocly path in `mike-docs`.

## Local Workflow

### Refresh generated artifacts

```bash
cd /Users/mikepurvis/near/mike-docs
npm install
npm run sync:apis
```

That refreshes both generated registries vendored into `builder-docs`:

- page models
- structured graph metadata for JSON-LD, hosted-page breadcrumbs, and `/structured-data/site-graph.json`

### Run the public docs UI

```bash
cd /Users/mikepurvis/near/fn/builder-docs
yarn install
yarn start
```

Then open `http://localhost:3000`.

### Run deeper backend verification

```bash
cd /Users/mikepurvis/near/mike-docs
npm run lint
npm run standalone:build
REDOCLY_LOCAL_PLAN=enterprise npm run build
```

Optional previews:

```bash
# standalone bespoke runtime
npm run standalone:dev

# legacy Redocly runtime
npm run preview
```

## Legacy Redocly Path

The Redocly path still exists in `mike-docs` for parity checks and migration cleanup. On that path:

- `@theme/ext/configure.ts` still handles auth injection and request shaping
- URL inputs like `preset`, `body`, `path.*`, `query.*`, and `header.*` are still relevant

That path is no longer the primary public delivery model.

## Embedded Hosted Pages

If an external consumer embeds `docs.fastnear.com/rpcs/...` or `docs.fastnear.com/apis/...` in an iframe, the hosted page posts resize messages:

```js
{
  type: "fastnear-docs:resize",
  height: <number>,
  pathname: window.location.pathname
}
```

That auto-height behavior comes from `FastnearHostedOperationPage`.

## Files To Know

- `/Users/mikepurvis/near/mike-docs/scripts/generate-page-models.js`
- `/Users/mikepurvis/near/mike-docs/shared/generatedFastnearPageModels.json`
- `/Users/mikepurvis/near/mike-docs/shared/generatedFastnearStructuredGraph.json`
- `/Users/mikepurvis/near/fn/builder-docs/src/data/generatedFastnearPageModels.json`
- `/Users/mikepurvis/near/fn/builder-docs/src/data/generatedFastnearStructuredGraph.json`
- `/Users/mikepurvis/near/fn/builder-docs/src/components/FastnearDirectOperation/index.js`
- `/Users/mikepurvis/near/fn/builder-docs/src/components/FastnearHostedOperationPage/index.js`
- `/Users/mikepurvis/near/fn/builder-docs/scripts/generate-bespoke-host-pages.js`

## Common Failure Modes

| Symptom | Likely cause |
| --- | --- |
| page model change does not show up in `builder-docs` | the vendored registry was not refreshed from `mike-docs` |
| network selector does nothing | the page model only has one network or the operation is mainnet-only |
| API key appears ignored | the current page model does not use auth or `?apiKey=` is being overridden by storage |
| live request and copied curl disagree | the shared direct runtime changed in one place but not the other |
| hosted page is cramped inside an external iframe | the parent page is not listening for `fastnear-docs:resize` messages |

## More Reading

- [/Users/mikepurvis/near/fn/builder-docs/README.md](/Users/mikepurvis/near/fn/builder-docs/README.md)
- [/Users/mikepurvis/near/mike-docs/README.md](/Users/mikepurvis/near/mike-docs/README.md)
- [/Users/mikepurvis/near/mike-docs/API_DOCS_ROLLOUT.md](/Users/mikepurvis/near/mike-docs/API_DOCS_ROLLOUT.md)
