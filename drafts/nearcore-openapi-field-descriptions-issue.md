# DRAFT — nearcore issue: backfill field-level `///` docs on JSON-RPC view types

> Draft for Mike to review and open at https://github.com/near/nearcore/issues
> Scope is intentionally tight (the new 2.13.0 `view_state` pagination fields) with an
> optional broader section (foundational view types). Cut the broader section if you
> want a fast, uncontroversial merge.

---

**Title:** OpenAPI/OpenRPC: backfill field-level doc comments on JSON-RPC view types

**Labels (suggested):** `A-rpc`, `C-docs`, `good first issue`

### Context

We generate the public FastNEAR RPC reference (https://docs.fastnear.com) directly from
`chain/jsonrpc/openapi/openapi.json` — the schemars-derived spec your CI keeps in sync via
`just openapi-spec`. That makes the `#[doc]` / `///` comments on the request/response structs
the *de facto* public API documentation for a lot of downstream tools (our docs, OpenRPC
clients, generated SDKs).

First: the **new** annotations in 2.13.0 are genuinely great. `EXPERIMENTAL_receipt_to_tx`
(`block_height`, `shard_id`, `window`), `DelegateActionV2`, and `NonceMode` all have clear,
role-explaining doc comments. This issue is just about bringing a few **older, high-traffic
view types** up to that same bar.

### The pattern

schemars uses a field's `///` doc comment as its OpenAPI `description`. When a field has **no**
doc comment, downstream renderers fall back to the field's **type** description — which
describes the wire *encoding*, not the field's *meaning*. So semantically distinct fields end
up rendering with identical, generic text.

Concrete: in `RpcViewStateRequest`, `prefix_base64` and `after_key_base64` are both
`StoreKey`, so both render as *"Base64-encoded storage key"* even though one is a filter prefix
and the other is a pagination cursor. `limit` renders blank (no type-level text to fall back on).

### Highest value / lowest effort: the new `view_state` pagination fields

These were added this release and shipped without doc comments. They're the paginated-state
API most integrators will reach for, so a one-line `///` each goes a long way.

`chain/jsonrpc-primitives/src/types/view_state.rs` — `RpcViewStateRequest`:

| field (`serde` name) | Rust type | today | suggested `///` |
|---|---|---|---|
| `after_key` (`after_key_base64`) | `Option<StoreKey>` | renders as generic "Base64-encoded storage key" | `Pagination cursor. Return only keys ordered after this one; pass the previous response's `last_key` here to fetch the next page. Omit to start from the beginning of `prefix_base64`.` |
| `limit` | `Option<NonZeroU32>` | blank | `Maximum number of state entries to return in this page. Omit to return all matching entries (subject to node limits).` |

`core/primitives/src/views.rs` — `ViewStateResult`:

| field | Rust type | today | suggested `///` |
|---|---|---|---|
| `last_key` | `Option<StoreKey>` | renders as generic "Base64-encoded storage key" | `Pagination cursor for the next page. Pass this back as `after_key_base64` to continue; absent when the last page has been returned.` |

*(Please sanity-check the exact cursor semantics — inclusive vs. exclusive — against the
implementation; I inferred "after / exclusive" from the field names.)*

### Optional broader pass: foundational view types

Same root cause, older types. Every field below currently has **no** `///` (readers see either
the leaf-type format string or nothing). These are the flagship `query` responses that every
dApp reads, so they'd benefit the most:

- **`AccountView`** (`view_account` response): `amount`, `locked`, `code_hash`, `storage_usage`,
  `global_contract_account_id`, `global_contract_hash`. Also `storage_paid_at` is currently
  documented only as `"TODO(2271): deprecated."` — if it's deprecated, a one-liner saying so
  (and what to use instead) would read better than the TODO.
- **`AccessKeyView`**: `nonce`, `permission`.
- **`ViewStateResult`**: `values`, `proof`.

Example wording:

```rust
pub struct AccountView {
    /// Liquid (non-staked) account balance, in yoctoNEAR (10^-24 NEAR).
    pub amount: NearToken,
    /// Balance locked as validator stake, in yoctoNEAR. Zero for non-validators.
    pub locked: NearToken,
    /// SHA-256 hash of the deployed contract code, base58-encoded; all-1s (11111…) when no contract is deployed.
    pub code_hash: CryptoHash,
    /// Total storage used by the account, in bytes; determines the storage-staking balance requirement.
    pub storage_usage: StorageUsage,
    ...
}
```

### Why upstream rather than patched downstream

1. These descriptions help **every** OpenAPI/OpenRPC consumer, not just our portal.
2. **Response-field** descriptions in particular are hard to override cleanly downstream — a
   request param can be backfilled in a generator, but response schemas are consumed as-is.
3. It keeps the schemars comments as the single source of truth, which is the model your
   `just openapi-spec` CI already enforces.

### Offer

Happy to open a PR that adds the `///` comments above if that's easier than triaging wording in
the issue — just confirm the pagination cursor semantics and whether `storage_paid_at` is truly
deprecated. Thanks!
