# CLAUDE.md

This file is the front door for repo continuity. Keep it short, high-signal, and current. Put deeper operational knowledge in `md-CLAUDE-chapters/`.

## What This Repo Is

FastNEAR docs backend and generation repo. Public docs now render in `builder-docs` at `docs.fastnear.com`; this repo owns spec sync, enhancement manifests, page-model generation, and the local verification runtimes that support the shipped experience.

As of April 13, 2026, there are two important local verification tracks to keep in mind:

- The standalone bespoke runtime, which is now a local verification surface for the shared bespoke page model/runtime.
- The Redocly portal, which remains for legacy verification and parity checks.

## Quick Start

```bash
npm run preview               # Main Redocly preview
npm run standalone:dev        # Standalone bespoke runtime on canonical /rpcs/... and /apis/... paths
npm run standalone:build      # Static build for the standalone runtime
npm run lint                  # Workspace-aware sync + Redocly validation
npm run verify:workspace      # Broad repo verification
npm run smoke:operations      # Smoke-check representative operation routes
```

## Current State Snapshot

- The full public RPC and REST docs surface is now bespoke and direct-rendered in `builder-docs`.
- This repo remains the source of truth for:
  - RPC generation from nearcore
  - REST spec sync and leaf splitting
  - portal-owned enhancement manifests
  - generated page models vendored into `builder-docs`
  - the local standalone runtime
  - the legacy Redocly verification path
- The public canonical host is `https://docs.fastnear.com`.
- The legacy Redocly host is no longer the target architecture.
- Auth precedence remains `?apiKey=` first, then `fastnear:apiKey`, with `fastnear_api_key` migrated away automatically.
- The shared runtime uses `Authorization: Bearer ...` when the page model calls for bearer transport, while preserving the public `?apiKey=` input contract.

## Ongoing Work

- Use [API_DOCS_ROLLOUT.md](API_DOCS_ROLLOUT.md) as the tracker for remaining polish, host cutover cleanup, and post-Redocly simplification.
- Keep portal-owned interaction metadata in `enhancements/<service>/manifest.yaml`, not in sibling service repos.
- Prefer upstream contract-quality improvements only: descriptions, examples, enum clarity, nullable semantics, and stable `operationId`s.
- If a docs-quality improvement is common to multiple repos, prefer changing the shared OpenAPI generator once instead of hand-tuning each service repo.

## Feature Branch Workflow

- Treat `builder-docs` as the main product branch and deployment repo.
- Start in `builder-docs` when the change is user-facing only: layout, wording, navigation, theming, direct-render behavior, or native docs UX.
- Create a matching `mike-docs` branch only when the change needs generation or shared-runtime work: spec sync, enhancement manifests, page-model generation, nearcore mapping, or shared logic.
- When both repos are involved, use the same suffix in both repos, for example `codex/call-function-args-adapter`.
- Preferred order:
  1. change and validate generation/shared logic in `mike-docs`
  2. sync or vendor the generated artifacts into `builder-docs`
  3. finish the user-facing work in `builder-docs`
  4. open the `builder-docs` PR as the main PR and link the supporting `mike-docs` PR
- Keep branches single-purpose. Avoid mixing rollout, architecture cleanup, and UI polish in one branch unless they are tightly coupled.
- For live-site impact, `builder-docs` is the repo that must be deployed. `mike-docs` changes matter only after their generated outputs are brought into `builder-docs`.

## Reading Order

1. [01 Portal Architecture And Source Of Truth](md-CLAUDE-chapters/01-portal-architecture-and-source-of-truth.md)  
   What the repo owns, what is vendored, and how generation in `mike-docs` feeds the public runtime in `builder-docs`. For the RPC description-precedence rules, build-time warnings (`dead-override` / `gap` / `schemars-missing`), and the upstream E2E edit recipe, see [PORTAL_WORKFLOW.md](PORTAL_WORKFLOW.md) → Description Precedence.

2. [02 Auth, URL Params, And Embed Contract](md-CLAUDE-chapters/02-auth-url-and-embed-contract.md)  
   The canonical auth precedence, localStorage keys, hosted-route query params, and the browser-vs-contract distinction for API-key transport.

3. [03 Browser Automation And Verification](md-CLAUDE-chapters/03-browser-automation-and-verification.md)  
   The working pattern for Playwright/browser-assisted validation, including auth flows, screenshots, clipboard checks, and route comparisons.

4. [04 Custom Interactions And Redocly Overrides](md-CLAUDE-chapters/04-custom-interactions-and-redocly-overrides.md)  
   How the `view_account` pilot is wired into Redocly, why the request-row portal exists, and how to generalize the interaction model to more RPC endpoints.

5. [05 Standalone No-Redocly Spike](md-CLAUDE-chapters/05-standalone-no-redocly-spike.md)  
   Historical context for the standalone spike that evolved into today's local verification runtime.

6. [06 REST Enhancements And Preset Injection](md-CLAUDE-chapters/06-rest-enhancements-and-preset-injection.md)  
   How portal-owned enhancement manifests shape REST Try-It behavior without changing upstream OpenAPI contracts.

7. [07 Build, Publish, And Troubleshooting](md-CLAUDE-chapters/07-build-publish-and-troubleshooting.md)  
   The practical rules for preview, build, external spec sync, Redocly entitlement quirks, and “why is production still 404ing?” debugging.

## Companion Docs

- [PORTAL_WORKFLOW.md](PORTAL_WORKFLOW.md): operational checklist for sync, preview, build, and publication.
- [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md): current contract between generation in `mike-docs` and rendering in `builder-docs`.
- [API_DOCS_ROLLOUT.md](API_DOCS_ROLLOUT.md): rollout tracker for service-by-service API onboarding.
- [SERVICE_ONBOARDING_CHECKLIST.md](SERVICE_ONBOARDING_CHECKLIST.md): canonical checklist for onboarding a new REST API service into the docs stack.
- [docs/no-redocly-view-account-spike.md](docs/no-redocly-view-account-spike.md): concise narrative summary of the standalone spike.

## Continuity Rules

- If auth precedence, storage keys, or hosted-page query params change, update Chapter 02.
- If the preferred browser-verification workflow changes, update Chapter 03.
- If the Redocly pilot wiring changes, update Chapter 04.
- If the standalone runtime architecture or generated hosted routes change materially, update Chapter 05.
- If REST preset behavior changes, update Chapter 06.
- If preview/build/publish expectations change, update Chapter 07.
- If the cross-repo feature branch workflow changes, update this file and the `builder-docs` continuity docs together.
- Keep this file concise; move detail into the chapters rather than letting `CLAUDE.md` turn into a second operations manual.
