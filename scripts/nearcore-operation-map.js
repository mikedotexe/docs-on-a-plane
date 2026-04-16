/**
 * Declarative mapping from nearcore's openapi.json paths/schemas
 * to mike-docs per-operation YAML files under rpcs/.
 *
 * This config is the single source of truth for how nearcore methods
 * decompose into individual mike-docs operation files.
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
    description: 'Retrieves detailed information about a NEAR account including balance and storage usage',
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
    description: 'Returns information about a single access key for given account',
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
    description: 'Returns all access keys for a given account',
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
    description: 'Returns block details for a given block height',
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
    description: 'Returns block details for a given block hash',
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
    description: 'Returns changes in block for given block height or hash over all transactions for all types',
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
    description: 'Execute a view method on a smart contract without modifying state',
  },
  {
    type: 'query',
    requestType: 'view_state',
    file: 'contract/view_state.yaml',
    category: 'contract',
    operationId: 'view_state',
    summary: 'View contract state',
    description: 'Returns the state (key value pairs) of a contract based on key prefix',
  },
  {
    type: 'query',
    requestType: 'view_code',
    file: 'contract/view_code.yaml',
    category: 'contract',
    operationId: 'view_code',
    summary: 'View contract code',
    description: 'Returns the contract code (Wasm binary) deployed to the account',
  },
  {
    type: 'query',
    requestType: 'view_global_contract_code',
    file: 'contract/view_global_contract_code.yaml',
    category: 'contract',
    operationId: 'view_global_contract_code',
    summary: 'View global contract code',
    description: 'Returns a globally deployed contract code by its code hash',
  },
  {
    type: 'query',
    requestType: 'view_global_contract_code_by_account_id',
    file: 'contract/view_global_contract_code_by_account_id.yaml',
    category: 'contract',
    operationId: 'view_global_contract_code_by_account_id',
    summary: 'View global contract code by account',
    description: 'Returns the globally deployed contract code used by a specific account',
  },

  // === Protocol operations ===
  {
    type: 'chunk_variant',
    variant: 'by_hash',
    file: 'protocol/chunk_by_hash.yaml',
    category: 'protocol',
    operationId: 'chunk_by_hash',
    summary: 'Get chunk by hash',
    description: 'Returns details of a specific chunk by its hash',
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
    description: 'Returns details of a specific chunk by block ID and shard ID',
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
    description: 'Returns gas price for the latest block',
  },
  {
    type: 'gas_variant',
    variant: 'by_block',
    file: 'protocol/gas_price_by_block.yaml',
    category: 'protocol',
    operationId: 'gas_price_by_block',
    summary: 'Get gas price by block',
    description: 'Returns gas price for a specific block height or hash',
  },
  {
    type: 'simple',
    nearcorePath: '/health',
    file: 'protocol/health.yaml',
    category: 'protocol',
    operationId: 'health',
    summary: 'Check node health',
    description: 'Performs a health check on the node to determine if it is operating correctly',
  },
  {
    type: 'custom',
    file: 'protocol/latest_block.yaml',
    category: 'protocol',
    operationId: 'latest_block',
    summary: 'Get latest block',
    description: 'Retrieves the most recent block from the blockchain',
    note: 'FastNEAR-specific: uses block_id="latest" which is not in nearcore spec',
  },
  {
    type: 'simple',
    nearcorePath: '/light_client_proof',
    file: 'protocol/light_client_proof.yaml',
    category: 'protocol',
    operationId: 'light_client_proof',
    summary: 'Get light client proof',
    description: 'Returns the proofs for a transaction execution',
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
    description: 'Retrieves performance metrics and operational statistics from the node',
    note: 'HTTP endpoint, not JSON-RPC. Not in nearcore OpenAPI spec.',
  },
  {
    type: 'simple',
    nearcorePath: '/network_info',
    file: 'protocol/network_info.yaml',
    category: 'protocol',
    operationId: 'network_info',
    summary: 'Get network info',
    description: 'Queries the current state of node network connections',
  },
  {
    type: 'simple',
    nearcorePath: '/status',
    file: 'protocol/status.yaml',
    category: 'protocol',
    operationId: 'status',
    summary: 'Get node status',
    description: 'Requests the status of the connected RPC node',
  },
  {
    type: 'simple',
    nearcorePath: '/genesis_config',
    file: 'protocol/genesis_config.yaml',
    category: 'protocol',
    operationId: 'genesis_config',
    summary: 'Get genesis config',
    description: 'Get initial state and parameters for the genesis block',
  },
  {
    type: 'simple',
    nearcorePath: '/client_config',
    file: 'protocol/client_config.yaml',
    category: 'protocol',
    operationId: 'client_config',
    summary: 'Get client config',
    description: 'Queries client node configuration',
  },
  {
    type: 'simple',
    nearcorePath: '/changes',
    file: 'protocol/changes.yaml',
    category: 'protocol',
    operationId: 'changes',
    summary: 'Get state changes',
    description: 'Returns changes for a given account, contract or contract code for given block height or hash',
  },
  {
    type: 'simple',
    nearcorePath: '/maintenance_windows',
    file: 'protocol/maintenance_windows.yaml',
    category: 'protocol',
    operationId: 'maintenance_windows',
    summary: 'Get maintenance windows',
    description: 'Returns the future windows for maintenance in current epoch for the specified account',
  },
  {
    type: 'simple',
    nearcorePath: '/next_light_client_block',
    file: 'protocol/next_light_client_block.yaml',
    category: 'protocol',
    operationId: 'next_light_client_block',
    summary: 'Get next light client block',
    description: 'Returns the next light client block',
  },

  // === Transaction operations ===
  {
    type: 'simple',
    nearcorePath: '/broadcast_tx_async',
    file: 'transaction/broadcast_tx_async.yaml',
    category: 'transaction',
    operationId: 'broadcast_tx_async',
    summary: 'Send transaction asynchronously',
    description: 'Submits a transaction to the network without waiting for its execution',
  },
  {
    type: 'simple',
    nearcorePath: '/broadcast_tx_commit',
    file: 'transaction/broadcast_tx_commit.yaml',
    category: 'transaction',
    operationId: 'broadcast_tx_commit',
    summary: 'Send transaction and wait',
    description: 'Sends a transaction and waits until transaction is fully complete (10 second timeout)',
  },
  {
    type: 'simple',
    nearcorePath: '/tx',
    file: 'transaction/tx_status.yaml',
    category: 'transaction',
    operationId: 'tx_status',
    summary: 'Get transaction status',
    description: 'Queries status of a transaction by hash and returns the final transaction result',
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
    description: 'Sends transaction and returns the guaranteed execution status and results',
  },

  // === Validator operations ===
  {
    type: 'validators_variant',
    variant: 'current',
    file: 'validators/validators_current.yaml',
    category: 'validators',
    operationId: 'validators_current',
    summary: 'Get current validators',
    description: 'Retrieves the list of current validators and their details',
  },
  {
    type: 'validators_variant',
    variant: 'by_epoch',
    file: 'validators/validators_by_epoch.yaml',
    category: 'validators',
    operationId: 'validators_by_epoch',
    summary: 'Get validators by epoch',
    description: 'Retrieves validators for a specific epoch',
  },

  // === EXPERIMENTAL operations (active, non-deprecated) ===
  {
    type: 'simple',
    nearcorePath: '/EXPERIMENTAL_tx_status',
    file: 'transaction/EXPERIMENTAL_tx_status.yaml',
    category: 'transaction',
    operationId: 'EXPERIMENTAL_tx_status',
    summary: 'Get detailed transaction status',
    description: 'Queries status of a transaction by hash, returning the final transaction result and details of all receipts',
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
    description: 'Fetches a receipt by its ID (as is, without a status or execution outcome)',
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
    description: 'A configuration that defines the protocol-level parameters such as gas/storage costs, limits, feature flags, and other settings',
  },
  {
    type: 'simple',
    nearcorePath: '/EXPERIMENTAL_congestion_level',
    file: 'protocol/EXPERIMENTAL_congestion_level.yaml',
    category: 'protocol',
    operationId: 'EXPERIMENTAL_congestion_level',
    summary: 'Get congestion level',
    description: 'Queries the congestion level of a shard',
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
    description: 'Returns the proofs for a transaction execution',
  },
  {
    type: 'simple',
    nearcorePath: '/EXPERIMENTAL_split_storage_info',
    file: 'protocol/EXPERIMENTAL_split_storage_info.yaml',
    category: 'protocol',
    operationId: 'EXPERIMENTAL_split_storage_info',
    summary: 'Get split storage info',
    description: 'Contains the split storage information for archival nodes',
  },
  {
    type: 'simple',
    nearcorePath: '/EXPERIMENTAL_validators_ordered',
    file: 'validators/EXPERIMENTAL_validators_ordered.yaml',
    category: 'validators',
    operationId: 'EXPERIMENTAL_validators_ordered',
    summary: 'Get validators ordered',
    description: 'Returns the current epoch validators ordered in the block producer order with repetition',
  },
  {
    type: 'simple',
    nearcorePath: '/EXPERIMENTAL_light_client_proof',
    file: 'protocol/EXPERIMENTAL_light_client_proof.yaml',
    category: 'protocol',
    operationId: 'EXPERIMENTAL_light_client_proof',
    summary: 'Get light client execution proof',
    description: 'Returns the proofs for a transaction execution',
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
};
