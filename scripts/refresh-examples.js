#!/usr/bin/env node

/**
 * Refresh example values in RPC YAML files with fresh data from mainnet and testnet.
 *
 * Fetches fresh block, chunk, validator, tx, receipt, and access-key data,
 * then patches affected YAML files so "Try It" examples work out of the box.
 *
 * Uses structural YAML navigation (eemeli/yaml parseDocument + getIn) to
 * locate each value's byte range, then performs surgical string replacement
 * so re-runs are idempotent and formatting is fully preserved.
 *
 * Usage: node scripts/refresh-examples.js
 */

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const {
  DISCOVERY_NETWORKS,
  getRpcExampleParamOverride,
} = require('./rpc-example-config');
const {
  discoverRpcContext,
} = require('./rpc-example-context');

const RPCS_DIR = path.join(__dirname, '..', 'rpcs');

// ---------------------------------------------------------------------------
// Structural YAML patching
// ---------------------------------------------------------------------------

/**
 * Path to an example param field inside an OpenAPI per-operation YAML.
 */
function paramPath(network, field) {
  return ['paths', '/', 'post', 'requestBody', 'content', 'application/json', 'examples', network, 'value', 'params', field];
}

/**
 * Format a replacement value to match the original YAML node's quoting style.
 * - QUOTE_DOUBLE nodes → "value"
 * - QUOTE_SINGLE nodes → 'value'
 * - PLAIN nodes → value (as-is)
 */
function formatValue(newValue, nodeType) {
  const s = String(newValue);
  if (nodeType === 'QUOTE_DOUBLE') return `"${s}"`;
  if (nodeType === 'QUOTE_SINGLE') return `'${s}'`;
  return s;
}

function overrideParam(operationId, field) {
  return {
    mainnet: (_d, network) => getRpcExampleParamOverride(operationId, network)?.[field],
    testnet: (_d, network) => getRpcExampleParamOverride(operationId, network)?.[field],
  };
}

/**
 * Declarative update map — each entry describes one YAML file and the
 * param fields to set for mainnet and testnet examples.
 *
 * Value functions receive the fetched network data object and return the
 * new value (or null/undefined to skip).
 */
const UPDATES = [
  {
    file: 'account/view_access_key.yaml',
    params: {
      public_key: { mainnet: d => d.publicKey, testnet: d => d.publicKey },
    },
  },
  {
    file: 'contract/view_code.yaml',
    params: {
      account_id: overrideParam('view_code', 'account_id'),
    },
  },
  {
    file: 'contract/call.yaml',
    params: {
      account_id: overrideParam('call_function', 'account_id'),
      args_base64: overrideParam('call_function', 'args_base64'),
      method_name: overrideParam('call_function', 'method_name'),
    },
  },
  {
    file: 'contract/view_state.yaml',
    params: {
      account_id: overrideParam('view_state', 'account_id'),
      prefix_base64: overrideParam('view_state', 'prefix_base64'),
    },
  },
  {
    file: 'contract/view_global_contract_code.yaml',
    params: {
      code_hash: overrideParam('view_global_contract_code', 'code_hash'),
    },
  },
  {
    file: 'contract/view_global_contract_code_by_account_id.yaml',
    params: {
      account_id: overrideParam('view_global_contract_code_by_account_id', 'account_id'),
    },
  },
  {
    file: 'protocol/maintenance_windows.yaml',
    params: {
      account_id: overrideParam('maintenance_windows', 'account_id'),
    },
  },
  {
    file: 'block/block_by_height.yaml',
    params: {
      block_id: { mainnet: d => d.blockHeight, testnet: d => d.blockHeight },
    },
  },
  {
    file: 'block/block_by_id.yaml',
    params: {
      block_id: { mainnet: d => d.blockHash, testnet: d => d.blockHash },
    },
  },
  {
    file: 'block/block_effects.yaml',
    params: {
      block_id: { mainnet: d => d.blockHeight, testnet: d => d.blockHeight },
    },
  },
  {
    file: 'protocol/chunk_by_hash.yaml',
    params: {
      chunk_id: { mainnet: d => d.chunkHash, testnet: d => d.chunkHash },
    },
  },
  {
    file: 'protocol/chunk_by_block_shard.yaml',
    params: {
      block_id: { mainnet: d => d.blockHash, testnet: d => d.blockHash },
      shard_id: { mainnet: d => d.shardId, testnet: d => d.shardId },
    },
  },
  {
    file: 'protocol/gas_price_by_block.yaml',
    params: {
      block_id: { mainnet: d => d.blockHash, testnet: d => d.blockHash },
    },
  },
  {
    file: 'protocol/next_light_client_block.yaml',
    params: {
      last_block_hash: { mainnet: d => d.blockHash, testnet: d => d.blockHash },
    },
  },
  {
    file: 'protocol/light_client_proof.yaml',
    params: {
      light_client_head:  { mainnet: d => d.blockHash, testnet: d => d.blockHash },
      sender_id:          { mainnet: d => d.senderId,  testnet: d => d.senderId },
      transaction_hash:   { mainnet: d => d.txHash,    testnet: d => d.txHash },
      type:               { mainnet: () => 'transaction', testnet: () => 'transaction' },
    },
  },
  {
    file: 'protocol/EXPERIMENTAL_light_client_proof.yaml',
    params: {
      light_client_head:  { mainnet: d => d.blockHash, testnet: d => d.blockHash },
      sender_id:          { mainnet: d => d.senderId,  testnet: d => d.senderId },
      transaction_hash:   { mainnet: d => d.txHash,    testnet: d => d.txHash },
      type:               { mainnet: () => 'transaction', testnet: () => 'transaction' },
    },
  },
  {
    file: 'protocol/EXPERIMENTAL_light_client_block_proof.yaml',
    params: {
      block_hash:         { mainnet: d => d.previousBlockHash || d.blockHash, testnet: d => d.previousBlockHash || d.blockHash },
      light_client_head:  { mainnet: d => d.blockHash, testnet: d => d.blockHash },
    },
  },
  {
    file: 'protocol/EXPERIMENTAL_congestion_level.yaml',
    params: {
      block_id: { mainnet: d => d.blockHash, testnet: d => d.blockHash },
      shard_id: { mainnet: d => d.shardId, testnet: d => d.shardId },
    },
  },
  {
    file: 'transaction/tx_status.yaml',
    params: {
      tx_hash:            { mainnet: d => d.txHash,    testnet: d => d.txHash },
      sender_account_id:  { mainnet: d => d.senderId,  testnet: d => d.senderId },
    },
  },
  {
    file: 'transaction/EXPERIMENTAL_tx_status.yaml',
    params: {
      tx_hash:            { mainnet: d => d.txHash,    testnet: d => d.txHash },
      sender_account_id:  { mainnet: d => d.senderId,  testnet: d => d.senderId },
    },
  },
  {
    file: 'transaction/EXPERIMENTAL_receipt.yaml',
    params: {
      receipt_id: { mainnet: d => d.receiptId, testnet: d => d.receiptId },
    },
  },
  {
    file: 'validators/validators_by_epoch.yaml',
    params: {
      epoch_id: { mainnet: d => d.epochId, testnet: d => d.epochId },
    },
  },
  {
    file: 'validators/EXPERIMENTAL_validators_ordered.yaml',
    params: {
      block_id: { mainnet: d => d.blockHeight, testnet: d => d.blockHeight },
    },
  },
];

/**
 * Apply all updates to a single file using range-based surgical replacement.
 *
 * 1. Parse the YAML to navigate structurally to each scalar node.
 * 2. Collect {offset, length, replacement} edits from end-to-start order.
 * 3. Splice them into the raw text so offsets stay valid.
 */
function patchFile(filePath, entry, data) {
  const text = fs.readFileSync(filePath, 'utf8');
  const doc = YAML.parseDocument(text);

  // Collect edits: { start, valueEnd, replacement }
  const edits = [];

  for (const [field, networks] of Object.entries(entry.params)) {
    for (const [network, valueFn] of Object.entries(networks)) {
      if (!data[network]) continue; // network fetch failed entirely
      const newValue = valueFn(data[network], network);
      if (newValue == null) continue;

      const p = paramPath(network, field);
      const node = doc.getIn(p, true);
      if (!node || !node.range) continue;

      const oldValue = node.value;
      if (String(oldValue) === String(newValue)) continue;

      const [start, valueEnd] = node.range;
      const replacement = formatValue(newValue, node.type);
      edits.push({ start, valueEnd, replacement, network, field, newValue });
    }
  }

  if (edits.length === 0) return false;

  // Sort edits by start offset descending so splicing doesn't shift later offsets
  edits.sort((a, b) => b.start - a.start);

  let result = text;
  for (const edit of edits) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.valueEnd);
    console.log(`  ${entry.file}: ${edit.network} ${edit.field} -> ${edit.newValue}`);
  }

  fs.writeFileSync(filePath, result, 'utf8');
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Fetching fresh data from NEAR networks...\n');

  const data = {};
  for (const [network, config] of Object.entries(DISCOVERY_NETWORKS)) {
    console.log(`${network} (${config.url}):`);
    try {
      data[network] = await discoverRpcContext(network, {
        account: config.discoveryAccounts?.[0],
        limit: 10,
        log: message => console.warn(message),
      });
      const d = data[network];
      console.log(`  block:      ${d.blockHeight} / ${d.blockHash}`);
      console.log(`  chunk:      ${d.chunkHash || '(none)'} / shard ${d.shardId ?? 'n/a'}`);
      console.log(`  epoch:      ${d.epochId || '(none)'}`);
      console.log(`  tx:         ${d.txHash || '(none)'} from ${d.senderId || 'n/a'}`);
      console.log(`  receipt:    ${d.receiptId || '(none)'}`);
      console.log(`  public_key: ${d.publicKey || '(none)'}`);
      console.log(`  source:     ${d.sourceKind || 'n/a'} / ${d.sourceAccount || 'n/a'}`);
      const missing = ['blockHash', 'blockHeight', 'chunkHash', 'shardId', 'epochId', 'txHash', 'receiptId', 'publicKey']
        .filter(k => !d[k]);
      if (missing.length > 0) {
        console.warn(`  Missing data points: ${missing.join(', ')}`);
      }
    } catch (e) {
      console.warn(`  FAILED: ${e.message}`);
      data[network] = null;
    }
    console.log();
  }

  if (!Object.values(data).some(Boolean)) {
    console.error('All networks failed — no files updated.');
    process.exit(1);
  }

  console.log('Updating YAML files...\n');
  let filesUpdated = 0;

  for (const entry of UPDATES) {
    const filePath = path.join(RPCS_DIR, entry.file);
    if (patchFile(filePath, entry, data)) {
      filesUpdated++;
    }
  }

  console.log(`\nDone! Updated ${filesUpdated} file(s).`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
