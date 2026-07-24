/**
 * Declarative mapping from nearcore's openapi.json paths/schemas
 * to mike-docs per-operation YAML files under rpcs/.
 *
 * This config is the single source of truth for how nearcore methods
 * decompose into individual mike-docs operation files.
 *
 * Description precedence (see scripts/generate-from-nearcore.js → resolveDescription):
 *   - type === 'simple':  operation-map `description` (curated override) if present,
 *                         otherwise schemars-authored description from the nearcore
 *                         OpenAPI at `nearcorePath`, otherwise existing YAML.
 *                         Drop `description` from an entry to defer to upstream.
 *   - decomposed types:   operation-map `description` (one schemars description
 *                         covers all variants, so upstream is too generic to use).
 *   - type === 'custom':  operation-map `description` only (no nearcore source).
 *
 * The generator emits warnings for:
 *   - dead-override: curated description matches schemars byte-for-byte
 *   - gap: no description from any source
 *   - schemars-missing: simple op with no schemars description at `nearcorePath`
 */

// ---------------------------------------------------------------------------
// Leaf-type mapping: nearcore $ref type names → simple OpenAPI schemas
// ---------------------------------------------------------------------------
const LEAF_TYPE_MAP = {
  AccountId: { type: 'string', description: 'NEAR account ID' },
  CryptoHash: { type: 'string', description: 'Base58-encoded hash' },
  NearToken: { type: 'string', description: 'Amount in yoctoNEAR' },
  PublicKey: { type: 'string', description: 'ed25519: or secp256k1: prefixed public key' },
  FunctionArgs: { type: 'string', description: 'Base64-encoded method arguments' },
  StoreKey: { type: 'string', description: 'Base64-encoded storage key' },
  StoreValue: { type: 'string', description: 'Base64-encoded storage value' },
  Finality: { type: 'string', enum: ['final', 'near-final', 'optimistic'], description: 'Block finality' },
  SyncCheckpoint: { type: 'string', enum: ['genesis', 'earliest_available'] },
  EpochId: { type: 'string', description: 'Base58-encoded epoch identifier hash' },
  ShardId: { type: 'integer', description: 'Shard identifier' },
  PeerId: { type: 'string', description: 'Peer identifier' },
  Signature: { type: 'string', description: 'Base58-encoded cryptographic signature' },
  SignedTransaction: { type: 'string', description: 'Base64-encoded signed transaction' },
  NearGas: { type: 'string', description: 'Gas amount' },
  ShardUId: { type: 'string', description: 'Shard unique identifier' },
};

// Portal-curated descriptions for parameter fields whose nearcore schemars
// annotations are missing or empty. Keyed by field name; applied only when
// the upstream description is empty. Add entries here rather than patching
// individual request schemas — see extractQueryVariant for the application.
const PARAM_DESCRIPTIONS = {
  method_name: 'Name of the contract view method to invoke.',
  include_proof: 'Include a Merkle proof for the queried state alongside the values.',
  // light_client_proof `type`: nearcore narrowed the enum to `[receipt]` and
  // dropped its schemars description; this restates the intent for readers.
  type: 'Proof subject — `receipt` proves inclusion of a specific receipt produced during execution.',
};

// BlockId is special: oneOf integer (height) or string (hash)
const BLOCK_ID_SCHEMA = {
  oneOf: [
    { type: 'integer', description: 'Block height' },
    { type: 'string', description: 'Base58-encoded block hash' },
  ],
  description: 'Block height (integer) or block hash (string)',
};

// TxExecutionStatus
const TX_EXECUTION_STATUS_SCHEMA = {
  type: 'string',
  enum: ['NONE', 'INCLUDED', 'INCLUDED_FINAL', 'EXECUTED', 'EXECUTED_OPTIMISTIC', 'FINAL'],
  description: 'Desired level of execution status guarantee',
};

// ---------------------------------------------------------------------------
// Response type mapping: query request_type → response schema ref name
// ---------------------------------------------------------------------------
const QUERY_RESPONSE_MAP = {
  view_account: 'AccountView',
  view_code: 'ContractCodeView',
  view_state: 'ViewStateResult',
  call_function: 'CallResult',
  view_access_key: 'AccessKeyView',
  view_access_key_list: 'AccessKeyList',
  view_global_contract_code: 'ContractCodeView',
  view_global_contract_code_by_account_id: 'ContractCodeView',
};

// ---------------------------------------------------------------------------
// Operation map: each entry maps a nearcore concept to a mike-docs YAML file
// ---------------------------------------------------------------------------
// Types:
//   'query'    — decomposes from /query oneOf by request_type, uses _by_finality variant
//   'block'    — decomposes from /block oneOf
//   'chunk'    — decomposes from /chunk anyOf
//   'gas'      — decomposes from /gas_price
//   'validators' — decomposes from /validators oneOf
//   'simple'   — 1:1 nearcore path to mike-docs file
//   'custom'   — mike-docs only, not in nearcore (e.g. metrics, latest_block)

const OPERATIONS = [
  // === Account operations ===
  {
    type: 'query',
    requestType: 'view_account',
    file: 'account/view_account.yaml',
    category: 'account',
    operationId: 'view_account',
    summary: 'View account',
    description: "Fetch an account's balance, storage usage, and code hash at a chosen block or finality.",
    exampleParamsByNetwork: {
      mainnet: {
        account_id: 'root.near',
        request_type: 'view_account',
        finality: 'final',
      },
      testnet: {
        account_id: 'root.testnet',
        request_type: 'view_account',
        finality: 'final',
      },
    },
    extensions: {
      'x-fastnear-interaction': { kind: 'rpc-view-account' },
      'x-hideReplay': true,
    },
  },
  {
    type: 'query',
    requestType: 'view_access_key',
    file: 'account/view_access_key.yaml',
    category: 'account',
    operationId: 'view_access_key',
    summary: 'View access key',
    description: "Fetch one access key's permissions and nonce by public key on a given account.",
    exampleParamsByNetwork: {
      mainnet: {
        account_id: 'root.near',
        public_key: 'ed25519:6666666666666666666666666666666666666666666',
        request_type: 'view_access_key',
        finality: 'final',
      },
      testnet: {
        account_id: 'root.testnet',
        public_key: 'ed25519:Bt6gx87fRm99KkkN1Q9UEA8vY9DBLkRSntqcLDuZt3S',
        request_type: 'view_access_key',
        finality: 'final',
      },
    },
    extensions: {
      'x-fastnear-interaction': { kind: 'rpc-view-access-key' },
      'x-hideReplay': true,
    },
  },
  {
    type: 'query',
    requestType: 'view_access_key_list',
    file: 'account/view_access_key_list.yaml',
    category: 'account',
    operationId: 'view_access_key_list',
    summary: 'View access key list',
    description: "Fetch every access key attached to an account, each with its permissions and nonce.",
    exampleParamsByNetwork: {
      mainnet: {
        account_id: 'root.near',
        request_type: 'view_access_key_list',
        finality: 'final',
      },
      testnet: {
        account_id: 'root.testnet',
        request_type: 'view_access_key_list',
        finality: 'final',
      },
    },
    extensions: {
      'x-fastnear-interaction': { kind: 'rpc-view-access-key-list' },
      'x-hideReplay': true,
    },
  },

  // === Block operations ===
  {
    type: 'block_variant',
    variant: 'by_height',
    file: 'block/block_by_height.yaml',
    category: 'block',
    operationId: 'block_by_height',
    summary: 'Get block by height',
    description: "Fetch a block's header and chunk summaries by its height in the chain.",
    exampleParamsByNetwork: {
      mainnet: {
        block_id: 9820210,
      },
      testnet: {
        block_id: 245254793,
      },
    },
    extensions: {
      'x-fastnear-interaction': { kind: 'rpc-block-by-height' },
      'x-hideReplay': true,
    },
  },
  {
    type: 'block_variant',
    variant: 'by_hash',
    file: 'block/block_by_id.yaml',
    category: 'block',
    operationId: 'block_by_id',
    summary: 'Get block by hash',
    description: "Fetch a block's header and chunk summaries by its Base58-encoded SHA-256 hash.",
    exampleParamsByNetwork: {
      mainnet: {
        block_id: 'EPnLgE7iEq9s7yTkos96M3cWymH5avBAPm3qx3NXqR8H',
      },
      testnet: {
        block_id: 'CoPszhGFqcx9L1HQYM62g3UjxMpuZD8RiZL6QdpBZXA4',
      },
    },
    extensions: {
      'x-fastnear-interaction': { kind: 'rpc-block-by-id' },
      'x-hideReplay': true,
    },
  },
  {
    type: 'simple',
    nearcorePath: '/block_effects',
    file: 'block/block_effects.yaml',
    category: 'block',
    operationId: 'block_effects',
    summary: 'Get block effects',
    description: "Summarize every state change in a block — which accounts, keys, and contract-state entries were touched.",
    exampleParamsByNetwork: {
      mainnet: {
        block_id: 9820210,
      },
      testnet: {
        block_id: 245254793,
      },
    },
    paramsSchemaOverride: {
      type: 'object',
      required: ['block_id'],
      properties: {
        block_id: BLOCK_ID_SCHEMA,
      },
    },
    extensions: {
      'x-fastnear-interaction': { kind: 'rpc-block-effects' },
      'x-hideReplay': true,
    },
  },

  // === Contract operations ===
  {
    type: 'query',
    requestType: 'call_function',
    file: 'contract/call.yaml',
    category: 'contract',
    operationId: 'call_function',
    summary: 'Call contract function',
    description: "Invoke a contract view method without gas or state changes — reads computed values from contract logic.",
    fieldDescriptions: {
      request: {
        args_base64: 'Base64-encoded argument byte array passed to the method. JSON contracts expect the UTF-8 bytes of the JSON payload (`e30=` decodes to `{}`).',
      },
    },
  },
  {
    type: 'query',
    requestType: 'view_state',
    file: 'contract/view_state.yaml',
    category: 'contract',
    operationId: 'view_state',
    summary: 'View contract state',
    description: "Fetch the raw key-value state a contract has written, optionally filtered by key prefix.",
    // nearcore ships the 2.13.0 pagination fields with no `///` docs, so they
    // fall back to the generic StoreKey leaf description ("Base64-encoded
    // storage key") or render blank. Curate their pagination role here until
    // the upstream annotations land (see drafts/nearcore-openapi-field-descriptions-issue.md).
    fieldDescriptions: {
      request: {
        prefix_base64: 'Base64-encoded key prefix; returns only trie entries whose key begins with these bytes. Empty string (`""`) removes the filter and returns the entire contract state — expensive on large contracts.',
        after_key_base64: "Exclusive start cursor: returns only keys greater than this one. Set to the prior response's `last_key` to page forward; omit to scan from the start of the prefix range.",
        limit: 'Maximum key/value entries per response (≥ 1). Omit for no client-set bound (subject to node limits).',
      },
      response: {
        last_key: 'Continuation cursor — the last key returned. Pass as `after_key_base64` to fetch the next page; absent when the result set is exhausted.',
      },
    },
  },
  {
    type: 'query',
    requestType: 'view_code',
    file: 'contract/view_code.yaml',
    category: 'contract',
    operationId: 'view_code',
    summary: 'View contract code',
    description: "Fetch the compiled WebAssembly bytes deployed directly to a single account.",
  },
  {
    type: 'query',
    requestType: 'view_global_contract_code',
    file: 'contract/view_global_contract_code.yaml',
    category: 'contract',
    operationId: 'view_global_contract_code',
    summary: 'View global contract code',
    description: "Look up a global contract's WebAssembly bytes by its Base58-encoded SHA-256 code hash.",
  },
  {
    type: 'query',
    requestType: 'view_global_contract_code_by_account_id',
    file: 'contract/view_global_contract_code_by_account_id.yaml',
    category: 'contract',
    operationId: 'view_global_contract_code_by_account_id',
    summary: 'View global contract code by account',
    description: "Look up a global contract's WebAssembly bytes by the account that registered it.",
  },

  // === Protocol operations ===
  {
    type: 'chunk_variant',
    variant: 'by_hash',
    file: 'protocol/chunk_by_hash.yaml',
    category: 'protocol',
    operationId: 'chunk_by_hash',
    summary: 'Get chunk by hash',
    description: "Fetch a single chunk's transactions and receipts by its Base58 content hash.",
    exampleParamsByNetwork: {
      mainnet: {
        chunk_id: 'CUc7UcYGcXwu5Y6UqEkkS6UbffHN4NNHhh5XLRHV8kLu',
      },
    },
  },
  {
    type: 'chunk_variant',
    variant: 'by_block_shard',
    file: 'protocol/chunk_by_block_shard.yaml',
    category: 'protocol',
    operationId: 'chunk_by_block_shard',
    summary: 'Get chunk by block and shard',
    description: "Fetch a single chunk's transactions and receipts by its parent block plus shard index.",
    exampleParamsByNetwork: {
      mainnet: {
        block_id: 9820210,
        shard_id: 0,
      },
    },
  },
  {
    type: 'gas_variant',
    variant: 'null',
    file: 'protocol/gas_price.yaml',
    category: 'protocol',
    operationId: 'gas_price',
    summary: 'Get gas price',
    description: "Fetch the current chain-wide gas price for the most recent block.",
  },
  {
    type: 'gas_variant',
    variant: 'by_block',
    file: 'protocol/gas_price_by_block.yaml',
    category: 'protocol',
    operationId: 'gas_price_by_block',
    summary: 'Get gas price by block',
    description: "Fetch the chain-wide gas price at a chosen historical block, by height or hash.",
  },
  {
    type: 'simple',
    nearcorePath: '/health',
    file: 'protocol/health.yaml',
    category: 'protocol',
    operationId: 'health',
    summary: 'Check node health',
    description: "Ping a node for liveness — returns `null` on success, an error on unhealthy state.",
  },
  {
    type: 'custom',
    file: 'protocol/latest_block.yaml',
    category: 'protocol',
    operationId: 'latest_block',
    summary: 'Get latest block',
    description: "Fetch the latest final block — finality set automatically, no block ID needed.",
    note: 'FastNEAR-specific: uses block_id="latest" which is not in nearcore spec',
  },
  {
    type: 'simple',
    nearcorePath: '/light_client_proof',
    file: 'protocol/light_client_proof.yaml',
    category: 'protocol',
    operationId: 'light_client_proof',
    summary: 'Get light client proof',
    description: "Fetch a Merkle proof — by Base58 transaction or receipt ID — that the item was included and executed, suitable for light-client verification.",
    exampleParamsByNetwork: {
      mainnet: {
        type: 'transaction',
        transaction_hash: 'ESShk21GZb6cgFRoJyEJqdJXuoP72fuCmCn6pNMhXFC7',
        sender_id: '00000000012.near',
        light_client_head: 'Fz7Koem4SW7EZ1FB1peDP2XHdF6qZN8sZvkjEQwrQURa',
      },
    },
  },
  {
    type: 'custom',
    file: 'protocol/metrics.yaml',
    category: 'protocol',
    operationId: 'metrics',
    summary: 'Get node metrics',
    description: "Scrape a node's operational counters and gauges in Prometheus text-exposition format.",
    note: 'HTTP endpoint, not JSON-RPC. Not in nearcore OpenAPI spec.',
    // metrics.yaml exposes GET /metrics, not the JSON-RPC `/` root. The
    // aggregate $ref must point at the real path for Redocly to resolve.
    aggregateRefPath: '/metrics',
  },
  {
    type: 'simple',
    nearcorePath: '/network_info',
    file: 'protocol/network_info.yaml',
    category: 'protocol',
    operationId: 'network_info',
    summary: 'Get network info',
    description: "List the node's active peer connections and the block producers it currently tracks.",
  },
  {
    type: 'simple',
    nearcorePath: '/status',
    file: 'protocol/status.yaml',
    category: 'protocol',
    operationId: 'status',
    summary: 'Get node status',
    description: "Fetch a node's binary version, sync progress, and head block in one snapshot.",
  },
  {
    type: 'simple',
    nearcorePath: '/genesis_config',
    file: 'protocol/genesis_config.yaml',
    category: 'protocol',
    operationId: 'genesis_config',
    summary: 'Get genesis config',
    description: "Fetch the chain's immutable genesis config — initial records, protocol settings, and epoch length at block 0.",
  },
  {
    type: 'simple',
    nearcorePath: '/client_config',
    file: 'protocol/client_config.yaml',
    category: 'protocol',
    operationId: 'client_config',
    summary: 'Get client config',
    description: "Fetch the node's own local client config — timeouts, retry settings, and operator-chosen parameters.",
  },
  {
    type: 'simple',
    nearcorePath: '/changes',
    file: 'protocol/changes.yaml',
    category: 'protocol',
    operationId: 'changes',
    summary: 'Get state changes',
    description: "Fetch detailed state changes in a block — filter by account, key prefix, or change type.",
  },
  {
    type: 'simple',
    nearcorePath: '/maintenance_windows',
    file: 'protocol/maintenance_windows.yaml',
    category: 'protocol',
    operationId: 'maintenance_windows',
    summary: 'Get maintenance windows',
    description: "Find upcoming block ranges where a validator can safely restart without missing block production.",
  },
  {
    type: 'simple',
    nearcorePath: '/next_light_client_block',
    file: 'protocol/next_light_client_block.yaml',
    category: 'protocol',
    operationId: 'next_light_client_block',
    summary: 'Get next light client block',
    description: "Advance a light client's verified chain by fetching the next block header after a known Base58 head hash.",
  },

  // === Transaction operations ===
  {
    type: 'simple',
    nearcorePath: '/broadcast_tx_async',
    file: 'transaction/broadcast_tx_async.yaml',
    category: 'transaction',
    operationId: 'broadcast_tx_async',
    summary: 'Send transaction asynchronously',
    description: "Broadcast a base64-encoded `SignedTransaction`; returns the transaction hash without awaiting inclusion or execution. Example payloads are placeholders and cannot be replayed.",
  },
  {
    type: 'simple',
    nearcorePath: '/broadcast_tx_commit',
    file: 'transaction/broadcast_tx_commit.yaml',
    category: 'transaction',
    operationId: 'broadcast_tx_commit',
    summary: 'Send transaction and wait',
    description: "Broadcast a base64-encoded `SignedTransaction`; blocks until execution completes or a 10-second timeout elapses. Deprecated — use `send_tx`. Example payloads are placeholders and cannot be replayed.",
  },
  {
    type: 'simple',
    nearcorePath: '/tx',
    file: 'transaction/tx_status.yaml',
    category: 'transaction',
    operationId: 'tx_status',
    summary: 'Get transaction status',
    description: "Check a transaction's final outcome by Base58 hash — succeeded, failed, or still unresolved.",
    fieldDescriptions: {
      request: {
        signed_tx_base64: "Base64-encoded Borsh serialization of a `SignedTransaction`; must be freshly signed (nonce above the access key's current value).",
      },
    },
    exampleParamsByNetwork: {
      mainnet: {
        tx_hash: 'ESShk21GZb6cgFRoJyEJqdJXuoP72fuCmCn6pNMhXFC7',
        sender_account_id: '00000000012.near',
      },
    },
  },
  {
    type: 'simple',
    nearcorePath: '/send_tx',
    file: 'transaction/send_tx.yaml',
    category: 'transaction',
    operationId: 'send_tx',
    summary: 'Send transaction',
    description: "Broadcast a base64-encoded `SignedTransaction`; blocks until the execution outcome specified by `wait_until`. Example payloads are placeholders and cannot be replayed.",
  },

  // === Validator operations ===
  {
    type: 'validators_variant',
    variant: 'current',
    file: 'validators/validators_current.yaml',
    category: 'validators',
    operationId: 'validators_current',
    summary: 'Get current validators',
    description: "Fetch the active validator set for the current epoch, with stakes and performance stats.",
  },
  {
    type: 'validators_variant',
    variant: 'by_epoch',
    file: 'validators/validators_by_epoch.yaml',
    category: 'validators',
    operationId: 'validators_by_epoch',
    summary: 'Get validators by epoch',
    description: "Fetch the validator set for a chosen past epoch, selected by epoch-start block height or Base58 epoch-id hash.",
  },

  // === EXPERIMENTAL operations (active, non-deprecated) ===
  {
    type: 'simple',
    nearcorePath: '/EXPERIMENTAL_tx_status',
    file: 'transaction/EXPERIMENTAL_tx_status.yaml',
    category: 'transaction',
    operationId: 'EXPERIMENTAL_tx_status',
    summary: 'Get detailed transaction status',
    description: "Fetch a transaction's full receipt tree and per-receipt outcomes by Base58 hash — richer than `tx_status`.",
    fieldDescriptions: {
      request: {
        signed_tx_base64: "Base64-encoded Borsh serialization of a `SignedTransaction`; must be freshly signed (nonce above the access key's current value).",
      },
    },
    exampleParamsByNetwork: {
      mainnet: {
        tx_hash: 'ESShk21GZb6cgFRoJyEJqdJXuoP72fuCmCn6pNMhXFC7',
        sender_account_id: '00000000012.near',
        wait_until: 'EXECUTED_OPTIMISTIC',
      },
    },
  },
  {
    type: 'simple',
    nearcorePath: '/EXPERIMENTAL_receipt',
    file: 'transaction/EXPERIMENTAL_receipt.yaml',
    category: 'transaction',
    operationId: 'EXPERIMENTAL_receipt',
    summary: 'Get receipt by ID',
    description: "Fetch a single receipt by Base58 ID — the cross-shard execution unit a transaction produces.",
    exampleParamsByNetwork: {
      mainnet: {
        receipt_id: 'FcFKrKQziMPCgYMFiLMZwecBtA7vqxdkatkhc1j3GYj8',
      },
    },
  },
  {
    type: 'simple',
    nearcorePath: '/EXPERIMENTAL_receipt_to_tx',
    file: 'transaction/EXPERIMENTAL_receipt_to_tx.yaml',
    category: 'transaction',
    operationId: 'EXPERIMENTAL_receipt_to_tx',
    summary: 'Resolve receipt to transaction',
    description: "Resolve a receipt ID to the transaction hash and signer that produced it. Requires a node with `save_receipt_to_tx` enabled; unindexed receipts return `UNKNOWN_RECEIPT`.",
    fieldDescriptions: {
      request: {
        receipt_id: 'Base58-encoded receipt ID to resolve to its originating transaction.',
        block_height: 'Optional hint: block height near where the receipt was created, to bound the fallback scan.',
        shard_id: 'Optional hint: shard to scan at the hint height; omit to scan all tracked shards.',
        window: 'Optional hint: ± block-height window scanned around the hint before walking ancestor blocks.',
      },
    },
    exampleParamsByNetwork: {
      mainnet: {
        receipt_id: 'FcFKrKQziMPCgYMFiLMZwecBtA7vqxdkatkhc1j3GYj8',
      },
    },
  },
  {
    type: 'simple',
    nearcorePath: '/EXPERIMENTAL_protocol_config',
    file: 'protocol/EXPERIMENTAL_protocol_config.yaml',
    category: 'protocol',
    operationId: 'EXPERIMENTAL_protocol_config',
    summary: 'Get protocol config',
    description: "Fetch the runtime protocol config at a chosen block — gas costs, storage prices, and limits currently in force.",
  },
  {
    type: 'simple',
    nearcorePath: '/EXPERIMENTAL_congestion_level',
    file: 'protocol/EXPERIMENTAL_congestion_level.yaml',
    category: 'protocol',
    operationId: 'EXPERIMENTAL_congestion_level',
    summary: 'Get congestion level',
    description: "Measure a single shard's congestion pressure at a chosen block — a 0.0-to-1.0 saturation score.",
    exampleParamsByNetwork: {
      mainnet: {
        block_id: 9820210,
        shard_id: 0,
      },
    },
  },
  {
    type: 'simple',
    nearcorePath: '/EXPERIMENTAL_light_client_block_proof',
    file: 'protocol/EXPERIMENTAL_light_client_block_proof.yaml',
    category: 'protocol',
    operationId: 'EXPERIMENTAL_light_client_block_proof',
    summary: 'Get light client block proof',
    description: "Fetch a Merkle proof — by Base58 block and light-client-head hashes — that the block is included in the light client's verified chain.",
  },
  {
    type: 'simple',
    nearcorePath: '/EXPERIMENTAL_split_storage_info',
    file: 'protocol/EXPERIMENTAL_split_storage_info.yaml',
    category: 'protocol',
    operationId: 'EXPERIMENTAL_split_storage_info',
    summary: 'Get split storage info',
    description: "Inspect a node's split-storage layout — the boundary between hot recent data and cold archival data.",
  },
  {
    type: 'simple',
    nearcorePath: '/EXPERIMENTAL_validators_ordered',
    file: 'validators/EXPERIMENTAL_validators_ordered.yaml',
    category: 'validators',
    operationId: 'EXPERIMENTAL_validators_ordered',
    summary: 'Get validators ordered',
    description: "List validators ordered by stake size at a chosen block — broader than just the current active set.",
  },
  {
    type: 'simple',
    nearcorePath: '/EXPERIMENTAL_light_client_proof',
    file: 'protocol/EXPERIMENTAL_light_client_proof.yaml',
    category: 'protocol',
    operationId: 'EXPERIMENTAL_light_client_proof',
    summary: 'Get light client execution proof',
    description: "Fetch a Merkle proof of transaction or receipt inclusion by Base58 ID — the EXPERIMENTAL alias of `light_client_proof`.",
    exampleParamsByNetwork: {
      mainnet: {
        type: 'transaction',
        transaction_hash: 'ESShk21GZb6cgFRoJyEJqdJXuoP72fuCmCn6pNMhXFC7',
        sender_id: '00000000012.near',
        light_client_head: 'Fz7Koem4SW7EZ1FB1peDP2XHdF6qZN8sZvkjEQwrQURa',
      },
    },
  },
];

// Deprecated EXPERIMENTAL methods to skip (have stable replacements)
const DEPRECATED_METHODS = [
  '/EXPERIMENTAL_changes',          // → /changes
  '/EXPERIMENTAL_changes_in_block', // → /block_effects
  '/EXPERIMENTAL_genesis_config',   // → /genesis_config
  '/EXPERIMENTAL_maintenance_windows', // → /maintenance_windows
];

module.exports = {
  LEAF_TYPE_MAP,
  BLOCK_ID_SCHEMA,
  TX_EXECUTION_STATUS_SCHEMA,
  QUERY_RESPONSE_MAP,
  OPERATIONS,
  DEPRECATED_METHODS,
  PARAM_DESCRIPTIONS,
};
