#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PAGE_MODELS_PATH = path.join(ROOT, "shared/generatedFastnearPageModels.json");

const ARGS = new Set(process.argv.slice(2));
const STRICT = ARGS.has("--strict");
const REPORT = ARGS.has("--report");
const JSON_OUT = ARGS.has("--json");

const TARGETED_BASE64_FIELDS = {
  "rpc-call-function": ["args_base64"],
  "rpc-send-tx": ["signed_tx_base64"],
  "rpc-broadcast-tx-async": ["signed_tx_base64"],
  "rpc-broadcast-tx-commit": ["signed_tx_base64"],
  "rpc-tx-status": ["signed_tx_base64"],
  "rpc-EXPERIMENTAL-tx-status": ["signed_tx_base64"],
};

const GENERIC_FIELD_DESCRIPTIONS = new Set([
  "Base64-encoded method arguments",
  "Base64-encoded signed transaction",
]);

const SHARED_BLOCK_PATHS = [
  "response.shards[].chunk.receipts[]",
  "response.shards[].chunk.transactions[].transaction",
  "response.shards[].chunk.transactions[].outcome.execution_outcome",
  "response.shards[].chunk.transactions[].outcome.receipt",
  "response.shards[].receipt_execution_outcomes[].execution_outcome",
  "response.shards[].receipt_execution_outcomes[].receipt",
  "response.shards[].state_changes[].cause",
  "response.shards[].state_changes[].change",
];

const TARGETED_NEARDATA_PATHS = {
  "neardata-v0-block": SHARED_BLOCK_PATHS,
  "neardata-v0-block-optimistic": SHARED_BLOCK_PATHS,
  "neardata-v0-first-block": SHARED_BLOCK_PATHS,
  "neardata-v0-last-block-final": SHARED_BLOCK_PATHS,
  "neardata-v0-last-block-optimistic": SHARED_BLOCK_PATHS,
  "neardata-v0-block-chunk": [
    "response.receipts[]",
    "response.transactions[].transaction",
    "response.transactions[].outcome.execution_outcome",
    "response.transactions[].outcome.receipt",
  ],
  "neardata-v0-block-shard": [
    "response.chunk.receipts[]",
    "response.chunk.transactions[].transaction",
    "response.chunk.transactions[].outcome.execution_outcome",
    "response.chunk.transactions[].outcome.receipt",
    "response.receipt_execution_outcomes[].execution_outcome",
    "response.receipt_execution_outcomes[].receipt",
    "response.state_changes[].cause",
    "response.state_changes[].change",
  ],
};

function loadPageModels() {
  return JSON.parse(fs.readFileSync(PAGE_MODELS_PATH, "utf8"));
}

function getResponse200(pageModel) {
  return (pageModel.responses || []).find((response) => response.status === "200") || null;
}

function hasChildren(schema) {
  return Boolean(
    schema?.properties?.length ||
      schema?.items ||
      schema?.oneOf?.length ||
      schema?.anyOf?.length
  );
}

function isOpaqueObjectSchema(schema) {
  if (!schema || schema.circular) {
    return false;
  }

  const isObjectLike = schema.type === "object" || schema.type === undefined;
  const allowsAnyProperties =
    schema.additionalProperties === true || schema.additionalProperties === undefined;

  return isObjectLike && !hasChildren(schema) && allowsAnyProperties;
}

function isBareTopLevelResponse(schema) {
  return Boolean(
    schema &&
      schema.type === "object" &&
      !hasChildren(schema) &&
      (schema.additionalProperties === true || schema.additionalProperties === undefined)
  );
}

function familyKey(canonicalPath) {
  const parts = String(canonicalPath || "")
    .split("/")
    .filter(Boolean);
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : canonicalPath || "?";
}

function getSchemaProperty(schema, propertyName) {
  return (schema?.properties || []).find((property) => property.name === propertyName)?.schema || null;
}

function resolveSchemaPath(rootSchema, schemaPath) {
  const parts = String(schemaPath || "")
    .split(".")
    .filter(Boolean);

  if (parts[0] !== "response") {
    return null;
  }

  let current = rootSchema;

  for (const rawPart of parts.slice(1)) {
    const isArrayPart = rawPart.endsWith("[]");
    const name = isArrayPart ? rawPart.slice(0, -2) : rawPart;

    current = getSchemaProperty(current, name);
    if (!current) {
      return null;
    }

    if (isArrayPart) {
      current = current.items || null;
    }

    if (!current) {
      return null;
    }
  }

  return current;
}

function collectOpaqueNodes(schema, currentPath = "response", acc = []) {
  if (!schema || schema.circular) {
    return acc;
  }

  if (isOpaqueObjectSchema(schema)) {
    acc.push({
      path: currentPath,
      description: schema.description || "",
      refName: schema.refName || null,
      type: schema.type || "object",
    });
  }

  for (const property of schema.properties || []) {
    collectOpaqueNodes(property.schema, `${currentPath}.${property.name}`, acc);
  }

  if (schema.items) {
    collectOpaqueNodes(schema.items, `${currentPath}[]`, acc);
  }

  (schema.oneOf || []).forEach((variant, index) => {
    collectOpaqueNodes(variant, `${currentPath}.oneOf${index}`, acc);
  });

  (schema.anyOf || []).forEach((variant, index) => {
    collectOpaqueNodes(variant, `${currentPath}.anyOf${index}`, acc);
  });

  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    collectOpaqueNodes(
      schema.additionalProperties,
      `${currentPath}.additionalProperties`,
      acc
    );
  }

  return acc;
}

function run() {
  const pageModels = loadPageModels();
  const targetedFailures = [];
  const broaderOpaqueBacklog = [];

  for (const pageModel of pageModels) {
    const response200 = getResponse200(pageModel);
    const responseSchema = response200?.schema || null;

    if (isBareTopLevelResponse(responseSchema)) {
      targetedFailures.push({
        kind: "top_level_generic_response",
        pageModelId: pageModel.pageModelId,
        canonicalPath: pageModel.canonicalPath,
        path: "response",
        message: "Top-level 200 response schema is still a bare generic object.",
      });
    }

    const expectedPaths = TARGETED_NEARDATA_PATHS[pageModel.pageModelId] || [];
    for (const schemaPath of expectedPaths) {
      const targetSchema = resolveSchemaPath(responseSchema, schemaPath);

      if (!targetSchema) {
        targetedFailures.push({
          kind: "missing_targeted_schema_path",
          pageModelId: pageModel.pageModelId,
          canonicalPath: pageModel.canonicalPath,
          path: schemaPath,
          message: "Targeted NEAR Data schema path is missing from the generated response schema.",
        });
        continue;
      }

      if (isOpaqueObjectSchema(targetSchema)) {
        targetedFailures.push({
          kind: "opaque_targeted_schema_path",
          pageModelId: pageModel.pageModelId,
          canonicalPath: pageModel.canonicalPath,
          path: schemaPath,
          message: "Targeted NEAR Data schema path still resolves to an opaque object.",
        });
      }
    }

    for (const fieldName of TARGETED_BASE64_FIELDS[pageModel.pageModelId] || []) {
      const field = (pageModel.interaction?.fields || []).find((entry) => entry.name === fieldName);
      const description = String(field?.description || field?.schema?.description || "").trim();

      if (!field) {
        targetedFailures.push({
          kind: "missing_targeted_field",
          pageModelId: pageModel.pageModelId,
          canonicalPath: pageModel.canonicalPath,
          path: fieldName,
          message: "Targeted transport-ergonomic field is missing from interaction.fields.",
        });
        continue;
      }

      if (!description || GENERIC_FIELD_DESCRIPTIONS.has(description)) {
        targetedFailures.push({
          kind: "generic_targeted_field_description",
          pageModelId: pageModel.pageModelId,
          canonicalPath: pageModel.canonicalPath,
          path: fieldName,
          message: `Targeted field description is still too generic: ${JSON.stringify(description)}`,
        });
      }
    }

    const opaqueNodes = collectOpaqueNodes(responseSchema).filter(
      (entry) =>
        !entry.path.startsWith("response.error") &&
        !(
          TARGETED_NEARDATA_PATHS[pageModel.pageModelId] &&
          TARGETED_NEARDATA_PATHS[pageModel.pageModelId].includes(entry.path)
        )
    );

    for (const entry of opaqueNodes) {
      broaderOpaqueBacklog.push({
        canonicalPath: pageModel.canonicalPath,
        family: familyKey(pageModel.canonicalPath),
        pageModelId: pageModel.pageModelId,
        ...entry,
      });
    }
  }

  broaderOpaqueBacklog.sort((left, right) => {
    if (left.family !== right.family) {
      return left.family.localeCompare(right.family);
    }
    if (left.pageModelId !== right.pageModelId) {
      return left.pageModelId.localeCompare(right.pageModelId);
    }
    return left.path.localeCompare(right.path);
  });

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        {
          broaderOpaqueBacklog,
          targetedFailures,
        },
        null,
        2
      )
    );
    process.exit(STRICT && targetedFailures.length > 0 ? 1 : 0);
  }

  console.log("Schema Quality Audit");
  console.log("====================");
  console.log();
  console.log(`Targeted failures: ${targetedFailures.length}`);
  console.log(`Broader opaque backlog entries: ${broaderOpaqueBacklog.length}`);
  console.log();

  if (targetedFailures.length > 0) {
    console.log("Targeted failures:");
    for (const failure of targetedFailures) {
      console.log(
        `  ${failure.pageModelId} ${failure.path} - ${failure.message}`
      );
    }
    console.log();
  }

  if (REPORT || !STRICT) {
    const grouped = broaderOpaqueBacklog.reduce((acc, entry) => {
      (acc[entry.family] = acc[entry.family] || []).push(entry);
      return acc;
    }, {});

    console.log("Broader opaque-schema backlog:");
    if (broaderOpaqueBacklog.length === 0) {
      console.log("  none");
    } else {
      for (const [family, entries] of Object.entries(grouped)) {
        console.log(`  [${family}] ${entries.length}`);
        for (const entry of entries.slice(0, 12)) {
          const suffix = entry.description ? ` - ${entry.description}` : "";
          console.log(`    ${entry.pageModelId} ${entry.path}${suffix}`);
        }
        if (entries.length > 12) {
          console.log(`    ... ${entries.length - 12} more`);
        }
      }
    }
    console.log();
  }

  if (STRICT && targetedFailures.length > 0) {
    process.exit(1);
  }
}

run();
