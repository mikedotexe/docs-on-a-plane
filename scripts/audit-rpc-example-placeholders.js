#!/usr/bin/env node

/**
 * Fast static audit for placeholder RPC example values.
 *
 * This complements the live RPC example audit:
 * - catches obvious generator placeholders without network access
 * - documents the intentionally unresolved placeholders we still allow
 * - makes curated example coverage visible during local iteration and CI
 */

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const {
  MUTATING_RPC_METHODS,
  getAllowedRpcPlaceholders,
} = require('./rpc-example-config');

const ROOT = path.resolve(__dirname, '..');
const RPCS_DIR = path.join(ROOT, 'rpcs');

function getRpcFiles() {
  const files = [];

  for (const entry of fs.readdirSync(RPCS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const dirPath = path.join(RPCS_DIR, entry.name);
    for (const file of fs.readdirSync(dirPath)) {
      if (file.endsWith('.yaml')) {
        files.push(path.join(dirPath, file));
      }
    }
  }

  return files.sort();
}

function getOperationEntry(document) {
  for (const [pathKey, pathItem] of Object.entries(document?.paths || {})) {
    if (pathItem.post) {
      return { httpMethod: 'post', operation: pathItem.post, pathKey };
    }

    if (pathItem.get) {
      return { httpMethod: 'get', operation: pathItem.get, pathKey };
    }
  }

  return { httpMethod: null, operation: null, pathKey: '/' };
}

function getExamples(document, httpMethod) {
  if (httpMethod !== 'post') {
    return [];
  }

  const examples =
    document?.paths?.['/']?.post?.requestBody?.content?.['application/json']?.examples || {};

  return Object.entries(examples).map(([network, example]) => ({
    network,
    payload: example?.value || null,
  }));
}

function placeholderIssue(field, value, reason) {
  return { field, reason, value: String(value) };
}

function detectPlaceholderForField(field, value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (field === 'prefix_base64' && value === '') {
    return placeholderIssue(field, value, 'empty base64 state-prefix placeholder');
  }

  if (typeof value !== 'string') {
    return null;
  }

  if ((field === 'account_id' || field === 'sender_account_id' || field === 'sender_id' || field === 'receiver_id') &&
      /^example\.(near|testnet)$/.test(value)) {
    return placeholderIssue(field, value, 'generic placeholder account');
  }

  if (field === 'account_ids' && /^example\.(near|testnet)$/.test(value)) {
    return placeholderIssue(field, value, 'generic placeholder account');
  }

  if (field === 'public_key' && value === 'ed25519:example') {
    return placeholderIssue(field, value, 'generic placeholder public key');
  }

  if ((field === 'tx_hash' || field === 'transaction_hash') && value === 'ExampleTxHash') {
    return placeholderIssue(field, value, 'generic placeholder transaction hash');
  }

  if (field === 'receipt_id' && value === 'ExampleReceiptId') {
    return placeholderIssue(field, value, 'generic placeholder receipt id');
  }

  if ((field === 'block_id' || field === 'block_hash' || field === 'light_client_head' || field === 'last_block_hash') &&
      value === 'ExampleBlockHash') {
    return placeholderIssue(field, value, 'generic placeholder block hash');
  }

  if (field === 'epoch_id' && value === 'ExampleEpochId') {
    return placeholderIssue(field, value, 'generic placeholder epoch id');
  }

  if (field === 'chunk_id' && value === 'ExampleChunkHash') {
    return placeholderIssue(field, value, 'generic placeholder chunk hash');
  }

  if (field === 'code_hash' && value === 'ExampleCodeHash') {
    return placeholderIssue(field, value, 'generic placeholder code hash');
  }

  return null;
}

function collectPlaceholderIssues(value, fieldName) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectPlaceholderIssues(item, fieldName));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => collectPlaceholderIssues(child, key));
  }

  const issue = detectPlaceholderForField(fieldName, value);
  return issue ? [issue] : [];
}

function formatIssue(issue) {
  return `${issue.field}=${issue.value} (${issue.reason})`;
}

function main() {
  const files = getRpcFiles();
  let passed = 0;
  let failed = 0;
  let allowed = 0;
  let skipped = 0;

  for (const filePath of files) {
    const relativePath = path.relative(ROOT, filePath);
    const document = YAML.parse(fs.readFileSync(filePath, 'utf8'));
    const { httpMethod, operation } = getOperationEntry(document);
    const operationId = operation?.operationId || relativePath;

    if (httpMethod !== 'post') {
      skipped++;
      console.log(`SKIP ${operationId} - GET route has no JSON-RPC example payloads`);
      continue;
    }

    const examples = getExamples(document, httpMethod);
    const methodName =
      operation?.requestBody?.content?.['application/json']?.schema?.properties?.method?.enum?.[0];

    if (methodName && MUTATING_RPC_METHODS.has(methodName)) {
      skipped += examples.length;
      for (const { network } of examples) {
        console.log(`SKIP ${operationId} (${network}) - mutating example intentionally illustrative`);
      }
      continue;
    }

    for (const { network, payload } of examples) {
      const issues = collectPlaceholderIssues(payload?.params || {}, null);
      const allowedPlaceholders = getAllowedRpcPlaceholders(operationId, network);

      const unexpectedIssues = issues.filter((issue) => {
        const allowed = allowedPlaceholders[issue.field];
        if (!allowed) {
          return true;
        }

        return issue.value !== allowed.value;
      });

      if (unexpectedIssues.length > 0) {
        failed++;
        console.log(
          `FAIL ${operationId} (${network}) - ${unexpectedIssues.map(formatIssue).join('; ')}`
        );
        continue;
      }

      if (issues.length > 0) {
        allowed++;
        const allowedNotes = issues.map((issue) => {
          const reason = allowedPlaceholders[issue.field]?.reason || 'allowlisted placeholder';
          return `${issue.field}=${issue.value} (${reason})`;
        });
        console.log(`ALLOW ${operationId} (${network}) - ${allowedNotes.join('; ')}`);
        continue;
      }

      passed++;
      console.log(`PASS ${operationId} (${network}) - no placeholder defaults detected`);
    }
  }

  console.log();
  console.log(`Results: ${passed} passed, ${failed} failed, ${allowed} allowlisted, ${skipped} skipped`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
