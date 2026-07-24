#!/usr/bin/env node

/**
 * audit-parameter-descriptions.js
 *
 * Audits field-level descriptions on every page model's `interaction.fields[]`.
 *
 * Rule F1: `field.description` must be a non-empty string (after trim).
 * Rule F2: `field.description` must be at least 10 characters — a hint like
 *          "NEAR account ID" is fine, "id" is not.
 * Rule F3: `field.description` must differ from `field.name` (not a label echo).
 *
 * Warnings-only by default. Pass --strict to fail on any F* violation.
 * Pass --json for a machine-readable report.
 */

const fs = require('node:fs');
const path = require('node:path');

const PAGE_MODELS_PATH = path.resolve(
  __dirname,
  '../shared/generatedFastnearPageModels.json'
);

const MIN_DESC_LENGTH = 10;

function surfaceFor(model) {
  const src = model.sourceSpec || '';
  const m = src.match(/apis\/([^/]+)/);
  if (m) return m[1];
  if (src.startsWith('rpcs/') || (model.canonicalPath || '').startsWith('/rpcs/')) return 'rpc';
  return 'unknown';
}

function checkField(field) {
  const raw = field?.description == null ? '' : String(field.description);
  const trimmed = raw.trim();
  const violations = [];
  if (!trimmed) {
    violations.push({ rule: 'F1', message: 'missing or empty description' });
    return violations;
  }
  if (trimmed.length < MIN_DESC_LENGTH) {
    violations.push({ rule: 'F2', message: `description shorter than ${MIN_DESC_LENGTH} chars: ${JSON.stringify(trimmed)}` });
  }
  if (field.name && trimmed.toLowerCase() === String(field.name).toLowerCase()) {
    violations.push({ rule: 'F3', message: 'description is a verbatim echo of the field name' });
  }
  return violations;
}

function run() {
  const strict = process.argv.includes('--strict');
  const json = process.argv.includes('--json');

  const models = JSON.parse(fs.readFileSync(PAGE_MODELS_PATH, 'utf8'));

  const findings = [];
  let totalFields = 0;

  for (const model of models) {
    const fields = model.interaction?.fields || [];
    const surface = surfaceFor(model);
    for (const field of fields) {
      totalFields++;
      const violations = checkField(field);
      for (const v of violations) {
        findings.push({
          surface,
          pageModelId: model.pageModelId,
          operationId: model.info?.operationId,
          fieldName: field.name,
          location: field.location,
          rule: v.rule,
          message: v.message,
        });
      }
    }
  }

  if (json) {
    console.log(JSON.stringify({ totalFields, findings }, null, 2));
    process.exit(strict && findings.length > 0 ? 1 : 0);
  }

  console.log('Parameter Description Audit');
  console.log('===========================');
  console.log();
  console.log(`Total fields scanned: ${totalFields}`);
  console.log(`Findings: ${findings.length}`);
  console.log();

  if (findings.length === 0) {
    process.exit(0);
  }

  const bySurface = findings.reduce((acc, f) => {
    (acc[f.surface] = acc[f.surface] || []).push(f);
    return acc;
  }, {});

  for (const [surface, items] of Object.entries(bySurface)) {
    console.log(`[${surface}] ${items.length}`);
    for (const f of items) {
      console.log(`  ${f.rule} ${f.operationId || f.pageModelId}.${f.fieldName} [${f.location}] → ${f.message}`);
    }
    console.log();
  }

  if (strict) {
    console.error(`FAIL: ${findings.length} field description violation(s) under --strict.`);
    process.exit(1);
  }
}

run();
