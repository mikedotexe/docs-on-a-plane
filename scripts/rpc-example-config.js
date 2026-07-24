const DISCOVERY_NETWORKS = {
  mainnet: {
    changesAccount: 'root.near',
    discoveryAccounts: ['intents.near', 'near-intents.near'],
    publicKeyAccount: 'root.near',
    txIndexUrl: 'https://tx.main.fastnear.com',
    url: 'https://rpc.mainnet.fastnear.com',
  },
  testnet: {
    changesAccount: 'root.testnet',
    discoveryAccounts: ['root.testnet'],
    publicKeyAccount: 'root.testnet',
    txIndexUrl: null,
    url: 'https://rpc.testnet.fastnear.com',
  },
};

const MUTATING_RPC_METHODS = new Set([
  'broadcast_tx_async',
  'broadcast_tx_commit',
  'send_tx',
]);

const SUBSET_OPERATION_IDS = [
  'view_account',
  'block_by_height',
  'chunk_by_hash',
  'changes',
  'tx_status',
  'light_client_proof',
  'validators_by_epoch',
];

const TESTNET_GLOBAL_CONTRACT_EXAMPLES = {
  byAccountId: 'ft.globals.primitives.testnet',
  byCodeHash: '3vaopJ7aRoivvzZLngPQRBEd8VJr2zPLTxQfnRCoFgNX',
};

const MAINNET_GLOBAL_CONTRACT_EXAMPLES = {
  byAccountId: 'global-contract.nfts.tg',
  byCodeHash: 'A2VxywASqbnarBAfTWobhDZjMXobjnYyJmkjhoXAiYBz',
};

const METRICS_AUDIT_ENV_VAR = 'FASTNEAR_API_KEY';

const TRACKED_RPC_EXAMPLE_FOLLOWUPS = [
  {
    id: 'metrics-authenticated-audit',
    networks: ['mainnet', 'testnet'],
    operationIds: ['metrics'],
    reason: 'The live endpoint is HTTP GET /metrics and requires an API key.',
    nextStep: `Set ${METRICS_AUDIT_ENV_VAR} to validate metrics in the audit path.`,
  },
  {
    id: 'mutating-transaction-validation',
    networks: ['mainnet', 'testnet'],
    operationIds: ['broadcast_tx_async', 'broadcast_tx_commit', 'send_tx'],
    reason: 'Mutating transaction submission methods are intentionally excluded from live audit.',
    nextStep:
      'Keep them out of CI and validate them with a dedicated signed-transaction harness or manual checklist.',
  },
];

const CURATED_RPC_EXAMPLE_PARAMS = {
  call_function: {
    mainnet: {
      account_id: 'contract.near',
      args_base64: 'e30=',
      finality: 'final',
      method_name: 'get_info',
      request_type: 'call_function',
    },
    testnet: {
      account_id: 'contract.testnet',
      args_base64: 'e30=',
      finality: 'final',
      method_name: 'get_info',
      request_type: 'call_function',
    },
  },
  maintenance_windows: {
    mainnet: {
      account_id: 'root.near',
    },
    testnet: {
      account_id: 'root.testnet',
    },
  },
  view_code: {
    mainnet: {
      account_id: 'intents.near',
      finality: 'final',
      request_type: 'view_code',
    },
    testnet: {
      account_id: 'guest-book.testnet',
      finality: 'final',
      request_type: 'view_code',
    },
  },
  view_state: {
    mainnet: {
      account_id: 'lockup.near',
      finality: 'final',
      prefix_base64: 'U1RBVEU=',
      request_type: 'view_state',
    },
    testnet: {
      // v1.signer-prod.testnet returns TOO_LARGE_CONTRACT_STATE; counter.testnet
      // has a single small key that an empty prefix returns in full.
      account_id: 'counter.testnet',
      finality: 'final',
      prefix_base64: '',
      request_type: 'view_state',
    },
  },
  EXPERIMENTAL_receipt_to_tx: {
    // Resolves only on the archival endpoint (servers set to archival-rpc) with a
    // block_height anchor near the receipt; without block_height the node returns
    // UNKNOWN_RECEIPT.
    mainnet: {
      receipt_id: 'ETMK9HmPsAYcNxfSXBejMWQs57W4Ph5HDYoYhDMpotQn',
      block_height: 194263442,
    },
    testnet: {
      receipt_id: '9uJmhNCLRgsFncH3anffPLE1YsZCPTyAZrBdekc3vTaZ',
      block_height: 246016180,
    },
  },
};

const ALLOWED_RPC_PLACEHOLDERS = {};

const MANUAL_RPC_EXAMPLE_OVERRIDES = {
  EXPERIMENTAL_protocol_config: {
    mainnet: { finality: 'final' },
    testnet: { finality: 'final' },
  },
  changes: {
    mainnet: {
      account_ids: ['root.near'],
      changes_type: 'account_changes',
      finality: 'final',
    },
    testnet: {
      account_ids: ['root.testnet'],
      changes_type: 'account_changes',
      finality: 'final',
    },
  },
  latest_block: {
    mainnet: { finality: 'optimistic' },
    testnet: { finality: 'optimistic' },
  },
  block_effects: {
    // Evergreen: query the latest block's effects instead of a pinned block_id
    // that ages out of the non-archival RPC's retention window.
    mainnet: { finality: 'final' },
    testnet: { finality: 'final' },
  },
  validators_by_epoch: {
    // Testnet is periodically reset, so pin a recent archival-resolvable epoch.
    testnet: { epoch_id: 'BARiarhzfSL7G737ik4AukX9sFYH1iR3dYU3KNUAvF3e' },
  },
  light_client_proof: {
    // The example fields are transaction_hash + sender_id, which correspond to
    // type: transaction. type: receipt would require receipt_id + receiver_id.
    mainnet: { type: 'transaction' },
    testnet: { type: 'transaction' },
  },
  EXPERIMENTAL_light_client_proof: {
    mainnet: { type: 'transaction' },
    testnet: { type: 'transaction' },
  },
  view_code: {
    mainnet: { account_id: 'intents.near' },
    testnet: { account_id: 'guest-book.testnet' },
  },
  view_global_contract_code: {
    mainnet: { code_hash: MAINNET_GLOBAL_CONTRACT_EXAMPLES.byCodeHash },
    testnet: { code_hash: TESTNET_GLOBAL_CONTRACT_EXAMPLES.byCodeHash },
  },
  view_global_contract_code_by_account_id: {
    mainnet: { account_id: MAINNET_GLOBAL_CONTRACT_EXAMPLES.byAccountId },
    testnet: { account_id: TESTNET_GLOBAL_CONTRACT_EXAMPLES.byAccountId },
  },
};

const AUDIT_SKIPS = {
  // The docs example resolves on the archival endpoint (servers point at
  // archival-rpc) with a block_height anchor near the receipt. The live audit
  // path targets the non-archival RPC, where receipt→tx returns UNKNOWN_RECEIPT,
  // so it stays excluded from that audit.
  EXPERIMENTAL_receipt_to_tx: {
    mainnet: {
      skip: true,
      reason: 'Live audit uses the non-archival RPC; receipt→tx resolves only on archival-rpc with a block_height anchor (as configured in the example).',
    },
    testnet: {
      skip: true,
      reason: 'Live audit uses the non-archival RPC; receipt→tx resolves only on archival-rpc with a block_height anchor (as configured in the example).',
    },
  },
};

function cloneJson(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function getManualOverride(operationId, network) {
  return MANUAL_RPC_EXAMPLE_OVERRIDES[operationId]?.[network];
}

function getCuratedRpcExampleParams(operationId, network) {
  return cloneJson(CURATED_RPC_EXAMPLE_PARAMS[operationId]?.[network]);
}

function getRpcExampleParamOverride(operationId, network) {
  const curated = getCuratedRpcExampleParams(operationId, network) || {};
  const manual = getManualOverride(operationId, network) || {};
  const merged = { ...curated };

  for (const [key, value] of Object.entries(manual)) {
    if (key === 'skipAudit' || key === 'skipReason') {
      continue;
    }

    merged[key] = cloneJson(value);
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

function getAllowedRpcPlaceholders(operationId, network) {
  return cloneJson(ALLOWED_RPC_PLACEHOLDERS[operationId]?.[network]) || {};
}

function getAuditSkip(operationId, network) {
  const auditSkip = AUDIT_SKIPS[operationId]?.[network];
  if (auditSkip) {
    return auditSkip;
  }

  const manualOverride = getManualOverride(operationId, network);
  if (manualOverride?.skipAudit) {
    return {
      skip: true,
      reason: manualOverride.skipReason || 'Audit disabled for this example.',
    };
  }

  return null;
}

module.exports = {
  ALLOWED_RPC_PLACEHOLDERS,
  AUDIT_SKIPS,
  CURATED_RPC_EXAMPLE_PARAMS,
  DISCOVERY_NETWORKS,
  METRICS_AUDIT_ENV_VAR,
  MANUAL_RPC_EXAMPLE_OVERRIDES,
  MUTATING_RPC_METHODS,
  SUBSET_OPERATION_IDS,
  MAINNET_GLOBAL_CONTRACT_EXAMPLES,
  TESTNET_GLOBAL_CONTRACT_EXAMPLES,
  TRACKED_RPC_EXAMPLE_FOLLOWUPS,
  getAuditSkip,
  getAllowedRpcPlaceholders,
  getCuratedRpcExampleParams,
  getManualOverride,
  getRpcExampleParamOverride,
};
