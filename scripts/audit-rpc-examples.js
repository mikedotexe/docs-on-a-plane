#!/usr/bin/env node

/**
 * Execute read-only RPC examples against live endpoints and report pass/fail.
 *
 * Usage:
 *   node scripts/audit-rpc-examples.js --subset
 *   node scripts/audit-rpc-examples.js --all-readonly
 */

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const {
  METRICS_AUDIT_ENV_VAR,
  MUTATING_RPC_METHODS,
  SUBSET_OPERATION_IDS,
  TRACKED_RPC_EXAMPLE_FOLLOWUPS,
  getAuditSkip,
} = require('./rpc-example-config');

const ROOT = path.resolve(__dirname, '..');
const RPCS_DIR = path.join(ROOT, 'rpcs');

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  const subset = args.has('--subset');
  const allReadonly = args.has('--all-readonly');

  if (subset && allReadonly) {
    throw new Error('Choose either --subset or --all-readonly, not both.');
  }

  return {
    allReadonly,
    subset: subset || !allReadonly,
  };
}

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

function inferNetworkForServer(server) {
  const description = String(server?.description || '').toLowerCase();
  const url = String(server?.url || '').toLowerCase();

  if (description.includes('mainnet') || url.includes('mainnet')) {
    return 'mainnet';
  }
  if (description.includes('testnet') || url.includes('testnet')) {
    return 'testnet';
  }

  return null;
}

function getServerUrlForNetwork(document, network) {
  const servers = Array.isArray(document?.servers) ? document.servers : [];
  const directMatch = servers.find((server) => inferNetworkForServer(server) === network);
  return directMatch?.url || null;
}

function getNetworksForDocument(document) {
  const servers = Array.isArray(document?.servers) ? document.servers : [];
  return [...new Set(
    servers
      .map((server) => inferNetworkForServer(server))
      .filter(Boolean)
  )];
}

function getExamples(document, httpMethod, operationId) {
  if (httpMethod === 'get') {
    return getNetworksForDocument(document).map((network) => ({
      network,
      payload: null,
    }));
  }

  const examples = document?.paths?.['/']?.post?.requestBody?.content?.['application/json']?.examples || {};
  return Object.entries(examples).map(([network, example]) => ({
    network,
    payload: example?.value || null,
  }));
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function buildCurlCommand(url, payload, httpMethod) {
  if (httpMethod === 'get') {
    return `curl -sS "${url}"`;
  }

  return [
    'curl -sS',
    shellQuote(url),
    "-H 'content-type: application/json'",
    `--data ${shellQuote(JSON.stringify(payload))}`,
  ].join(' ');
}

function buildEndpointUrl(serverUrl, pathKey) {
  const baseUrl = serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`;
  return new URL(pathKey, baseUrl);
}

async function runJsonRpcExample(url, payload) {
  const response = await fetch(url, {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}

  if (!response.ok) {
    return {
      ok: false,
      reason: `HTTP ${response.status}`,
    };
  }

  if (!json || typeof json !== 'object') {
    return {
      ok: false,
      reason: 'Expected JSON response body',
    };
  }

  if (json.error) {
    return {
      ok: false,
      reason: `${json.error.code} ${json.error.message}`,
    };
  }

  if (payload?.params?.request_type === 'view_state') {
    const values = json.result?.values;
    if (!Array.isArray(values) || values.length === 0) {
      return {
        ok: false,
        reason: 'Expected non-empty state values',
      };
    }
  }

  return {
    ok: true,
    reason: 'ok',
  };
}

async function runHttpGetExample(url) {
  const response = await fetch(url);
  if (!response.ok) {
    return {
      ok: false,
      reason: `HTTP ${response.status}`,
    };
  }

  return {
    ok: true,
    reason: 'ok',
  };
}

async function auditOperation(filePath, options) {
  const relativePath = path.relative(ROOT, filePath);
  const document = YAML.parse(fs.readFileSync(filePath, 'utf8'));
  const { httpMethod, operation, pathKey } = getOperationEntry(document);
  const operationId = operation?.operationId || relativePath;
  const metricsApiKey = process.env[METRICS_AUDIT_ENV_VAR] || '';

  if (options.subset && !SUBSET_OPERATION_IDS.includes(operationId)) {
    return [];
  }

  const examples = getExamples(document, httpMethod, operationId);
  const results = [];

  for (const { network, payload } of examples) {
    if (operationId === 'metrics' && !metricsApiKey) {
      results.push({
        network,
        operationId,
        path: relativePath,
        reason: `Requires ${METRICS_AUDIT_ENV_VAR} to validate GET /metrics.`,
        status: 'SKIP',
      });
      continue;
    }

    const skip = getAuditSkip(operationId, network);
    if (skip?.skip) {
      results.push({
        network,
        operationId,
        path: relativePath,
        reason: skip.reason,
        status: 'SKIP',
      });
      continue;
    }

    const url = getServerUrlForNetwork(document, network);
    if (!url) {
      results.push({
        network,
        operationId,
        path: relativePath,
        reason: `No ${network} server URL found in spec`,
        status: 'FAIL',
      });
      continue;
    }

    if (payload?.method && MUTATING_RPC_METHODS.has(payload.method)) {
      results.push({
        network,
        operationId,
        path: relativePath,
        reason: 'Mutating method intentionally skipped',
        status: 'SKIP',
      });
      continue;
    }

    const endpoint = buildEndpointUrl(url, pathKey);
    if (operationId === 'metrics' && metricsApiKey) {
      endpoint.searchParams.set('apiKey', metricsApiKey);
    }
    const requestUrl = endpoint.toString();
    const displayUrl = operationId === 'metrics' && metricsApiKey
      ? `${buildEndpointUrl(url, pathKey).toString()}?apiKey=$${METRICS_AUDIT_ENV_VAR}`
      : requestUrl;
    const curlCommand = buildCurlCommand(displayUrl, payload, httpMethod);
    const execution = httpMethod === 'get'
      ? await runHttpGetExample(requestUrl)
      : await runJsonRpcExample(requestUrl, payload);

    results.push({
      curlCommand,
      network,
      operationId,
      path: relativePath,
      reason: execution.reason,
      status: execution.ok ? 'PASS' : 'FAIL',
    });
  }

  return results;
}

async function main() {
  const options = parseArgs(process.argv);
  const files = getRpcFiles();
  const results = [];

  for (const filePath of files) {
    const operationResults = await auditOperation(filePath, options);
    results.push(...operationResults);
  }

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const result of results) {
    const prefix = `${result.status.padEnd(4)} ${result.operationId} (${result.network})`;
    if (result.status === 'PASS') {
      passed++;
      console.log(`${prefix} - ${result.reason}`);
      continue;
    }

    if (result.status === 'SKIP') {
      skipped++;
      console.log(`${prefix} - ${result.reason}`);
      continue;
    }

    failed++;
    console.log(`${prefix} - ${result.reason}`);
    if (result.curlCommand) {
      console.log(`  ${result.curlCommand}`);
    }
  }

  console.log();
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);

  if (TRACKED_RPC_EXAMPLE_FOLLOWUPS.length > 0) {
    console.log();
    console.log('Tracked RPC example follow-ups:');
    for (const followUp of TRACKED_RPC_EXAMPLE_FOLLOWUPS) {
      console.log(
        `- ${followUp.operationIds.join(', ')} (${followUp.networks.join(', ')}): ${followUp.reason} Next: ${followUp.nextStep}`
      );
    }
  }

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
