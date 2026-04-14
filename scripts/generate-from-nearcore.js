#!/usr/bin/env node
/**
 * generate-from-nearcore.js
 *
 * Reads nearcore's auto-generated openapi.json and produces/updates
 * per-operation YAML files under rpcs/ for Redocly to render.
 *
 * Usage:
 *   node scripts/generate-from-nearcore.js [path-to-openapi.json]
 *
 * Default path: ../nearcore/chain/jsonrpc/openapi/openapi.json
 */

const fs = require('fs');
const path = require('path');
const {
  LEAF_TYPE_MAP,
  BLOCK_ID_SCHEMA,
  TX_EXECUTION_STATUS_SCHEMA,
  QUERY_RESPONSE_MAP,
  OPERATIONS,
  DEPRECATED_METHODS,
} = require('./nearcore-operation-map');
const {
  getRpcExampleParamOverride,
} = require('./rpc-example-config');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const RPCS_DIR = path.resolve(__dirname, '..', 'rpcs');
const DEFAULT_SPEC_PATH = path.resolve(__dirname, '..', '..', 'nearcore', 'chain', 'jsonrpc', 'openapi', 'openapi.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep-clone a plain JSON-serialisable object. */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Resolve a $ref string like "#/components/schemas/AccountId" → schema object */
function resolveRef(spec, ref) {
  if (!ref || !ref.startsWith('#/')) return null;
  const parts = ref.replace('#/', '').split('/');
  let node = spec;
  for (const p of parts) {
    node = node?.[p];
    if (node === undefined) return null;
  }
  return node;
}

/**
 * Resolve a schema that may be a $ref, returning the resolved schema.
 * If it is not a $ref, return the original. Does NOT follow chains.
 */
function deref(spec, schema) {
  if (!schema) return schema;
  if (schema.$ref) return resolveRef(spec, schema.$ref);
  return schema;
}

/**
 * Recursively flatten a nearcore schema into a self-contained schema suitable
 * for a mike-docs YAML file. Resolves $refs, applies LEAF_TYPE_MAP, inlines
 * properties up to `maxDepth` levels.
 */
function flattenSchema(spec, schema, depth = 0, maxDepth = 2) {
  if (!schema) return { type: 'object' };

  // Handle $ref
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    // Check leaf types first
    if (LEAF_TYPE_MAP[refName]) return clone(LEAF_TYPE_MAP[refName]);
    if (refName === 'BlockId') return clone(BLOCK_ID_SCHEMA);
    if (refName === 'TxExecutionStatus') return clone(TX_EXECUTION_STATUS_SCHEMA);
    // Resolve and recurse
    const resolved = resolveRef(spec, schema.$ref);
    if (!resolved) return { type: 'object', description: `Unresolved: ${refName}` };
    return flattenSchema(spec, resolved, depth, maxDepth);
  }

  // Handle allOf — merge properties
  if (schema.allOf) {
    // Single-item allOf with extra fields (default, description) — resolve and carry over
    if (schema.allOf.length === 1) {
      const flat = flattenSchema(spec, schema.allOf[0], depth, maxDepth);
      if (flat) {
        if (schema.default !== undefined && flat.default === undefined) flat.default = schema.default;
        if (schema.description && !flat.description) flat.description = schema.description;
        return flat;
      }
    }
    const merged = { type: 'object', properties: {}, required: [] };
    for (const part of schema.allOf) {
      const flat = flattenSchema(spec, part, depth, maxDepth);
      if (!flat) continue;
      if (flat.properties) Object.assign(merged.properties, flat.properties);
      if (flat.required) merged.required.push(...flat.required);
      if (flat.description && !merged.description) merged.description = flat.description;
    }
    if (merged.required.length === 0) delete merged.required;
    if (Object.keys(merged.properties).length === 0) delete merged.properties;
    return merged;
  }

  // Handle anyOf/oneOf — for response schemas, just note it; for simple cases, pick first
  if (schema.anyOf || schema.oneOf) {
    const variants = schema.anyOf || schema.oneOf;
    // If it has properties alongside anyOf (like RpcQueryResponse), merge
    if (schema.properties) {
      const result = { type: 'object' };
      const props = {};
      // Flatten the top-level properties
      for (const [key, val] of Object.entries(schema.properties)) {
        props[key] = flattenSchema(spec, val, depth + 1, maxDepth);
      }
      // anyOf items contribute additional properties
      for (const variant of variants) {
        const flat = flattenSchema(spec, variant, depth + 1, maxDepth);
        if (flat && flat.properties) Object.assign(props, flat.properties);
      }
      result.properties = props;
      if (schema.required) result.required = [...schema.required];
      return result;
    }
    // Nullable pattern: anyOf with a null enum
    if (variants.length === 2) {
      const nonNull = variants.find(v => !v.nullable && !(v.enum && v.enum[0] === null));
      if (nonNull) {
        const flat = flattenSchema(spec, nonNull, depth, maxDepth);
        if (flat) {
          // OpenAPI 3.1: express nullability without the deprecated nullable keyword
          if (flat.oneOf) {
            // Add null variant to oneOf
            flat.oneOf.push({ type: 'null' });
          } else {
            flat.type = flat.type ? [flat.type, 'null'] : ['object', 'null'];
          }
          return flat;
        }
      }
    }
    // All-string-enum pattern: oneOf where every variant is a string enum (like TxExecutionStatus)
    if (variants.every(v => v.type === 'string' && v.enum && v.enum.length === 1)) {
      const allEnums = variants.map(v => v.enum[0]);
      const result = { type: 'string', enum: allEnums };
      const desc = variants.find(v => v.description)?.description;
      if (desc) result.description = 'Desired level of execution status guarantee';
      return result;
    }
    // Simple: just describe it
    return { type: 'object', description: 'One of multiple possible types' };
  }

  // Null-only enum (params: null)
  if (schema.nullable && schema.enum && schema.enum[0] === null) {
    return null;  // signals no params
  }

  // Simple string/integer/number/boolean with no $ref
  if (schema.type === 'string' || schema.type === 'integer' || schema.type === 'number' || schema.type === 'boolean') {
    const result = { type: schema.type };
    if (schema.enum) result.enum = schema.enum;
    if (schema.description) result.description = schema.description;
    if (schema.format) result.format = schema.format;
    if (schema.default !== undefined) result.default = schema.default;
    if (schema.minimum !== undefined) result.minimum = schema.minimum;
    // OpenAPI 3.1: use type array instead of nullable: true
    if (schema.nullable) result.type = [schema.type, 'null'];
    return result;
  }

  // Array
  if (schema.type === 'array') {
    const result = { type: 'array' };
    if (schema.items) {
      if (depth < maxDepth) {
        result.items = flattenSchema(spec, schema.items, depth + 1, maxDepth);
      } else {
        result.items = { type: 'object' };
      }
    }
    if (schema.description) result.description = schema.description;
    return result;
  }

  // Object with properties
  if (schema.type === 'object' || schema.properties) {
    const result = { type: 'object' };
    if (schema.description) result.description = schema.description;
    if (depth >= maxDepth) return result;
    if (schema.properties) {
      result.properties = {};
      for (const [key, val] of Object.entries(schema.properties)) {
        result.properties[key] = flattenSchema(spec, val, depth + 1, maxDepth);
      }
    }
    if (schema.required) result.required = [...schema.required];
    return result;
  }

  return { type: 'object' };
}

// ---------------------------------------------------------------------------
// Response schema extraction
// ---------------------------------------------------------------------------

/**
 * Given a nearcore response schema name like
 * "JsonRpcResponse_for_RpcBlockResponse_and_RpcError",
 * extract and flatten the success result type.
 */
function extractResponseSchema(spec, responseSchemaName) {
  const respSchema = spec.components?.schemas?.[responseSchemaName];
  if (!respSchema) return { type: 'object' };

  // The response schema has oneOf: [{result: $ref}, {error: $ref}]
  // plus properties: {id, jsonrpc}
  if (respSchema.oneOf) {
    const successVariant = respSchema.oneOf.find(v =>
      v.properties?.result || v.required?.includes('result')
    );
    if (successVariant?.properties?.result) {
      const flat = flattenSchema(spec, successVariant.properties.result, 0, 2);
      return flat || { type: 'object' };
    }
  }

  return { type: 'object' };
}

/**
 * Get the response schema name from a nearcore path definition.
 */
function getResponseSchemaName(pathDef) {
  const respContent = pathDef?.post?.responses?.['200']?.content?.['application/json']?.schema;
  if (respContent?.$ref) {
    return respContent.$ref.split('/').pop();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Query method decomposition
// ---------------------------------------------------------------------------

/**
 * Extract the _by_finality variant for a given request_type from the
 * /query path's RpcQueryRequest oneOf.
 */
function extractQueryVariant(spec, requestType) {
  const rqr = spec.components?.schemas?.RpcQueryRequest;
  if (!rqr?.oneOf) return null;

  const variantTitle = `${requestType}_by_finality`;
  const variant = rqr.oneOf.find(v => v.title === variantTitle);
  if (!variant?.allOf) return null;

  // allOf[0] = block reference ({finality: ...})
  // allOf[1] = query-specific params ({request_type, account_id, ...})
  const blockRef = variant.allOf[0];
  const queryParams = variant.allOf[1];

  // Merge into a flat params schema
  const params = { type: 'object', properties: {}, required: [] };

  // Add request_type from the query params
  if (queryParams.properties) {
    for (const [key, val] of Object.entries(queryParams.properties)) {
      params.properties[key] = flattenSchema(spec, val, 0, 2);
    }
  }
  if (queryParams.required) params.required.push(...queryParams.required);

  // Add finality from block ref
  if (blockRef.properties) {
    for (const [key, val] of Object.entries(blockRef.properties)) {
      params.properties[key] = flattenSchema(spec, val, 0, 2);
    }
  }
  if (blockRef.required) params.required.push(...blockRef.required);

  return params;
}

// ---------------------------------------------------------------------------
// Per-operation YAML generation
// ---------------------------------------------------------------------------

const DEFAULT_SERVERS = [
  { url: 'https://rpc.mainnet.fastnear.com', description: 'Mainnet' },
  { url: 'https://rpc.testnet.fastnear.com', description: 'Testnet' },
];

/**
 * Build the full operation YAML structure for a given operation config entry.
 */
function buildOperationYaml(spec, op, existingYaml) {
  const method = getMethodName(spec, op);
  const paramsSchema = getParamsSchema(spec, op);
  const responseResult = getResponseResult(spec, op);
  const postExtensions = op.extensions ? clone(op.extensions) : {};
  const postOperation = {
    operationId: op.operationId,
    summary: existingYaml?.paths?.['\/']?.post?.summary || op.summary,
    description: existingYaml?.paths?.['\/']?.post?.description || op.description,
    ...postExtensions,
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: buildRequestSchema(method, paramsSchema),
        },
      },
    },
    responses: {
      '200': {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/JsonRpcResponse' },
          },
        },
      },
    },
  };

  // Start with existing or build fresh
  const doc = {
    openapi: '3.1.0',
    info: {
      title: existingYaml?.info?.title || `NEAR Protocol RPC: ${op.summary}`,
      description: existingYaml?.info?.description || op.description,
      version: existingYaml?.info?.version || '1.0.0',
    },
    servers: DEFAULT_SERVERS,
    paths: {
      '/': {
        post: postOperation,
      },
    },
    security: [{ ApiKeyAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'query',
          name: 'apiKey',
        },
      },
      schemas: {
        JsonRpcResponse: buildJsonRpcResponseSchema(responseResult, existingYaml),
      },
    },
  };

  // Preserve existing examples
  const existingExamples = existingYaml?.paths?.['\/']?.post?.requestBody?.content?.['application/json']?.examples;
  if (existingExamples) {
    doc.paths['/'].post.requestBody.content['application/json'].examples = existingExamples;
  } else {
    // Generate placeholder examples
    doc.paths['/'].post.requestBody.content['application/json'].examples =
      generatePlaceholderExamples(method, paramsSchema, op);
  }

  return doc;
}

/**
 * Determine the JSON-RPC method name for an operation.
 */
function getMethodName(spec, op) {
  if (op.type === 'query') return 'query';
  if (op.type === 'block_variant') return 'block';
  if (op.type === 'chunk_variant') return 'chunk';
  if (op.type === 'gas_variant') return 'gas_price';
  if (op.type === 'validators_variant') return 'validators';
  if (op.type === 'simple' && op.nearcorePath) {
    // The method name is the path without leading /
    const reqSchemaName = `JsonRpcRequest_for_${op.nearcorePath.slice(1)}`;
    const reqSchema = spec.components?.schemas?.[reqSchemaName];
    if (reqSchema?.properties?.method?.enum?.[0]) {
      return reqSchema.properties.method.enum[0];
    }
    return op.nearcorePath.slice(1);
  }
  return op.operationId;
}

/**
 * Extract the params schema for an operation.
 */
function getParamsSchema(spec, op) {
  if (op.paramsSchemaOverride) {
    return clone(op.paramsSchemaOverride);
  }

  switch (op.type) {
    case 'query': {
      return extractQueryVariant(spec, op.requestType);
    }
    case 'block_variant': {
      if (op.variant === 'by_height') {
        return {
          type: 'object',
          required: ['block_id'],
          properties: {
            block_id: { type: 'integer', description: 'Block height to query' },
          },
        };
      }
      if (op.variant === 'by_hash') {
        return {
          type: 'object',
          required: ['block_id'],
          properties: {
            block_id: { type: 'string', description: 'Base58-encoded block hash' },
          },
        };
      }
      return null;
    }
    case 'chunk_variant': {
      if (op.variant === 'by_hash') {
        return {
          type: 'object',
          required: ['chunk_id'],
          properties: {
            chunk_id: { type: 'string', description: 'Base58-encoded chunk hash' },
          },
        };
      }
      if (op.variant === 'by_block_shard') {
        return {
          type: 'object',
          required: ['block_id', 'shard_id'],
          properties: {
            block_id: clone(BLOCK_ID_SCHEMA),
            shard_id: { type: 'integer', description: 'Shard identifier' },
          },
        };
      }
      return null;
    }
    case 'gas_variant': {
      if (op.variant === 'null') {
        return {
          type: 'array',
          items: { type: 'null' },
          _arrayParams: true,
          _example: [null],
        };
      }
      if (op.variant === 'by_block') {
        return {
          type: 'object',
          required: ['block_id'],
          properties: {
            block_id: clone(BLOCK_ID_SCHEMA),
          },
        };
      }
      return null;
    }
    case 'validators_variant': {
      if (op.variant === 'current') {
        return {
          type: 'array',
          items: { type: 'null' },
          maxItems: 1,
          minItems: 1,
          _arrayParams: true,
          _example: [null],
        };
      }
      if (op.variant === 'by_epoch') {
        return {
          type: 'object',
          required: ['epoch_id'],
          properties: {
            epoch_id: { type: 'string', description: 'Base58-encoded epoch identifier hash' },
          },
        };
      }
      return null;
    }
    case 'simple': {
      const reqSchemaName = `JsonRpcRequest_for_${op.nearcorePath.slice(1)}`;
      const reqSchema = spec.components?.schemas?.[reqSchemaName];
      if (!reqSchema?.properties?.params) return null;
      const paramsRef = reqSchema.properties.params;
      const paramsSchema = deref(spec, paramsRef);
      if (!paramsSchema) return null;

      // Null params (health, status, etc.)
      if (paramsSchema.nullable && paramsSchema.enum && paramsSchema.enum[0] === null) {
        return {
          type: 'array',
          maxItems: 0,
          _arrayParams: true,
          _example: [],
          description: 'Empty array as this method takes no parameters',
        };
      }

      // Empty object params (split_storage_info, etc.)
      if (paramsSchema.type === 'object' && !paramsSchema.properties && !paramsSchema.oneOf && !paramsSchema.anyOf) {
        return {
          type: 'array',
          maxItems: 0,
          _arrayParams: true,
          _example: [],
          description: 'Empty array as this method takes no parameters',
        };
      }

      // Flatten the params
      return flattenSchema(spec, paramsSchema, 0, 2);
    }
    case 'custom':
      return null;  // custom operations keep their existing schemas
    default:
      return null;
  }
}

/**
 * Get the flattened response result schema for an operation.
 */
function getResponseResult(spec, op) {
  if (op.type === 'query') {
    const responseTypeName = QUERY_RESPONSE_MAP[op.requestType];
    if (responseTypeName) {
      const responseType = spec.components?.schemas?.[responseTypeName];
      if (responseType) {
        return flattenSchema(spec, responseType, 0, 2);
      }
    }
    return { type: 'object' };
  }

  if (op.type === 'block_variant') {
    return extractResponseSchema(spec, 'JsonRpcResponse_for_RpcBlockResponse_and_RpcError');
  }

  if (op.type === 'chunk_variant') {
    return extractResponseSchema(spec, 'JsonRpcResponse_for_RpcChunkResponse_and_RpcError');
  }

  if (op.type === 'gas_variant') {
    return extractResponseSchema(spec, 'JsonRpcResponse_for_RpcGasPriceResponse_and_RpcError');
  }

  if (op.type === 'validators_variant') {
    return extractResponseSchema(spec, 'JsonRpcResponse_for_RpcValidatorResponse_and_RpcError');
  }

  if (op.type === 'simple' && op.nearcorePath) {
    const pathDef = spec.paths?.[op.nearcorePath];
    if (pathDef) {
      const schemaName = getResponseSchemaName(pathDef);
      if (schemaName) {
        return extractResponseSchema(spec, schemaName);
      }
    }
    return { type: 'object' };
  }

  return null;
}

/**
 * Build the JSON-RPC request body schema.
 */
function buildRequestSchema(method, paramsSchema) {
  const schema = {
    type: 'object',
    required: ['jsonrpc', 'id', 'method', 'params'],
    properties: {
      jsonrpc: { type: 'string', enum: ['2.0'] },
      id: { type: 'string', example: 'fastnear' },
      method: { type: 'string', enum: [method] },
    },
  };

  if (!paramsSchema) {
    schema.properties.params = { type: 'array', maxItems: 0, description: 'Empty array as this method takes no parameters' };
  } else if (paramsSchema._arrayParams) {
    // Array-style params (gas_price [null], validators [null], health [], etc.)
    const p = { type: paramsSchema.type || 'array' };
    if (paramsSchema.items) p.items = paramsSchema.items;
    if (paramsSchema.maxItems !== undefined) p.maxItems = paramsSchema.maxItems;
    if (paramsSchema.minItems !== undefined) p.minItems = paramsSchema.minItems;
    if (paramsSchema.description) p.description = paramsSchema.description;
    if (paramsSchema._example) p.example = paramsSchema._example;
    schema.properties.params = p;
  } else {
    schema.properties.params = cleanSchema(paramsSchema);
  }

  return schema;
}

/**
 * Remove internal markers from a schema.
 */
function cleanSchema(schema) {
  if (!schema) return schema;
  const result = { ...schema };
  delete result._arrayParams;
  delete result._example;
  return result;
}

/**
 * Build the JsonRpcResponse component schema, preserving existing
 * hand-written response detail if present.
 */
function buildJsonRpcResponseSchema(responseResult, existingYaml) {
  // If existing file has custom response schema with properties beyond the
  // bare minimum, preserve it but merge in any new fields from nearcore.
  const existingResult = existingYaml?.components?.schemas?.JsonRpcResponse?.properties?.result;

  const result = {
    type: 'object',
    required: ['jsonrpc', 'id'],
    properties: {
      jsonrpc: { type: 'string', enum: ['2.0'] },
      id: { oneOf: [{ type: 'string' }, { type: 'number' }] },
      result: buildMergedResult(responseResult, existingResult),
      error: {
        type: 'object',
        properties: {
          code: { type: 'integer' },
          message: { type: 'string' },
          data: { type: 'object' },
        },
      },
    },
  };

  return result;
}

/**
 * Merge nearcore response result with existing hand-written result schema.
 * Nearcore provides the structure; existing provides descriptions & extras.
 */
function buildMergedResult(nearcoreResult, existingResult) {
  if (!nearcoreResult || !nearcoreResult.properties) {
    // No structured nearcore result — use existing or generic
    if (existingResult && existingResult.properties) return existingResult;
    if (existingResult && existingResult.description) return existingResult;
    if (nearcoreResult) return nearcoreResult;
    return { type: 'object' };
  }

  // If no existing, just use nearcore
  if (!existingResult || !existingResult.properties) {
    return nearcoreResult;
  }

  // Merge: nearcore structure wins, but preserve existing descriptions
  const merged = clone(nearcoreResult);
  for (const [key, val] of Object.entries(existingResult.properties)) {
    if (merged.properties[key]) {
      // Preserve existing description if nearcore doesn't have one
      if (val.description && !merged.properties[key].description) {
        merged.properties[key].description = val.description;
      }
    } else {
      // Existing has a field nearcore doesn't — keep it (hand-written extra)
      merged.properties[key] = val;
    }
  }
  if (existingResult.description && !merged.description) {
    merged.description = existingResult.description;
  }

  return merged;
}

/**
 * Generate placeholder examples for an operation.
 */
function generatePlaceholderExamples(method, paramsSchema, op) {
  const baseParams = buildExampleParams(method, paramsSchema, op);
  const buildParams = (network) => ({
    ...(clone(op?.exampleParamsByNetwork?.[network] || baseParams) || {}),
    ...(getRpcExampleParamOverride(op?.operationId, network) || {}),
  });

  return {
    mainnet: {
      summary: `${op.summary} (Mainnet)`,
      value: {
        jsonrpc: '2.0',
        id: 'fastnear',
        method: method,
        params: buildParams('mainnet'),
      },
    },
    testnet: {
      summary: `${op.summary} (Testnet)`,
      value: {
        jsonrpc: '2.0',
        id: 'fastnear',
        method: method,
        params: buildParams('testnet'),
      },
    },
  };
}

/**
 * Build example params for placeholder examples.
 */
function buildExampleParams(method, paramsSchema, op) {
  if (!paramsSchema) return [];
  if (paramsSchema._arrayParams && paramsSchema._example !== undefined) {
    return paramsSchema._example;
  }
  if (paramsSchema.type !== 'object' || !paramsSchema.properties) return {};

  const result = {};
  for (const [key, val] of Object.entries(paramsSchema.properties)) {
    result[key] = getExampleValue(key, val, op);
  }
  return result;
}

/**
 * Generate an example value for a schema property.
 */
function getExampleValue(key, schema, op) {
  if (schema.example !== undefined) return schema.example;
  if (schema.enum) return schema.enum[0];
  if (schema.default !== undefined) return schema.default;

  // Common field names
  const examples = {
    request_type: op?.requestType || 'view_account',
    account_id: 'example.near',
    finality: 'final',
    block_id: 12345,
    shard_id: 0,
    method_name: 'get_info',
    args_base64: 'e30=',
    prefix_base64: '',
    public_key: 'ed25519:example',
    tx_hash: 'ExampleTxHash',
    transaction_hash: 'ExampleTxHash',
    sender_account_id: 'example.near',
    sender_id: 'example.near',
    receiver_id: 'example.near',
    receipt_id: 'ExampleReceiptId',
    light_client_head: 'ExampleBlockHash',
    block_hash: 'ExampleBlockHash',
    last_block_hash: 'ExampleBlockHash',
    epoch_id: 'ExampleEpochId',
    chunk_id: 'ExampleChunkHash',
    signed_tx_base64: 'ExampleBase64EncodedTransaction',
    wait_until: 'EXECUTED_OPTIMISTIC',
    code_hash: 'ExampleCodeHash',
    type: 'transaction',
  };

  if (examples[key] !== undefined) return examples[key];

  // Type-based fallbacks
  if (schema.type === 'string') return 'example';
  if (schema.type === 'integer' || schema.type === 'number') return 0;
  if (schema.type === 'boolean') return false;
  if (schema.type === 'array') return [];
  if (schema.type === 'object') return {};
  return null;
}

// ---------------------------------------------------------------------------
// YAML serialisation (minimal, no external deps)
// ---------------------------------------------------------------------------

/**
 * Serialise a JavaScript object to YAML string.
 * Handles the subset of YAML needed for OpenAPI operation files.
 */
function toYaml(obj, indent = 0) {
  return yamlValue(obj, indent, true);
}

function yamlValue(val, indent, isTopLevel = false) {
  if (val === null || val === undefined) return 'null';
  if (val === true) return 'true';
  if (val === false) return 'false';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') return yamlString(val, indent);
  if (Array.isArray(val)) return yamlArray(val, indent);
  if (typeof val === 'object') return yamlObject(val, indent, isTopLevel);
  return String(val);
}

function yamlString(s, indent = 0) {
  // Empty string needs quoting
  if (s === '') return '""';
  // Strings that look like special YAML values or contain special chars
  if (/^(true|false|null|yes|no|on|off|\d+(\.\d+)?|0x[0-9a-f]+)$/i.test(s)) return `"${s}"`;
  if (/[\n\r]/.test(s)) {
    // Multi-line string — content must be indented past the parent key
    return '|-\n' + s.split('\n').map(line => '  '.repeat(indent + 1) + line).join('\n');
  }
  if (/[:{}\[\],&*?|>!'"%@`#]/.test(s) || s.startsWith('- ') || s.startsWith(' ')) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}

function yamlArray(arr, indent) {
  if (arr.length === 0) return '[]';
  // Short arrays of primitives can be inline
  if (arr.length <= 4 && arr.every(v => v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
    const items = arr.map(v => v === null ? 'null' : yamlValue(v, 0));
    const inline = `[${items.join(', ')}]`;
    if (inline.length < 80) return inline;
  }
  const prefix = '  '.repeat(indent);
  const lines = [];
  for (const item of arr) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      const entries = Object.entries(item);
      if (entries.length > 0) {
        const [firstKey, firstVal] = entries[0];
        const firstLine = `${prefix}- ${firstKey}: ${yamlValue(firstVal, indent + 2)}`;
        lines.push(firstLine);
        for (let i = 1; i < entries.length; i++) {
          const [k, v] = entries[i];
          lines.push(`${prefix}  ${k}: ${yamlValue(v, indent + 2)}`);
        }
        continue;
      }
    }
    lines.push(`${prefix}- ${yamlValue(item, indent + 1)}`);
  }
  return '\n' + lines.join('\n');
}

function yamlObject(obj, indent, isTopLevel = false) {
  const entries = Object.entries(obj);
  if (entries.length === 0) return '{}';

  const prefix = '  '.repeat(indent);
  const lines = [];

  for (const [key, val] of entries) {
    const safeKey = /[:{}\[\],&*?|>!'"%@`# ]/.test(key) || key === '' ? `"${key}"` : key;

    if (val !== null && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length > 0) {
      lines.push(`${prefix}${safeKey}:`);
      const childLines = yamlObject(val, indent + 1).split('\n').filter(l => l.trim());
      lines.push(...childLines);
    } else if (Array.isArray(val)) {
      const arrStr = yamlArray(val, indent + 1);
      if (arrStr.startsWith('\n')) {
        lines.push(`${prefix}${safeKey}:${arrStr}`);
      } else {
        lines.push(`${prefix}${safeKey}: ${arrStr}`);
      }
    } else {
      lines.push(`${prefix}${safeKey}: ${yamlValue(val, indent + 1)}`);
    }
  }

  if (isTopLevel) return lines.join('\n');
  return '\n' + lines.join('\n');
}

// ---------------------------------------------------------------------------
// YAML parsing (minimal, for reading existing files)
// ---------------------------------------------------------------------------

/**
 * Parse a simple YAML file. Handles the subset used in mike-docs operation files.
 * For robustness, falls back to JSON.parse of a transformed string.
 *
 * This is intentionally simple — it handles:
 * - Top-level keys
 * - Nested objects
 * - Arrays (inline and block)
 * - Quoted and unquoted strings
 * - null, true, false, numbers
 * - $ref strings
 */
function parseYaml(text) {
  const lines = text.split('\n');
  return parseYamlLines(lines, 0, 0).value;
}

function parseYamlLines(lines, startIdx, baseIndent) {
  const result = {};
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.replace(/\s+$/, '');

    // Skip empty lines and comments
    if (stripped === '' || stripped.trimStart().startsWith('#')) {
      i++;
      continue;
    }

    const lineIndent = line.search(/\S/);
    if (lineIndent < baseIndent) break;  // dedented, return to parent
    if (lineIndent > baseIndent && i > startIdx) break;  // shouldn't happen at this level

    // Array item
    if (stripped.trimStart().startsWith('- ')) {
      // We're in an array context, handled by parseYamlArray
      break;
    }

    // Key: value
    const match = stripped.match(/^(\s*)([\w$"'/~.]+)\s*:\s*(.*)/);
    if (!match) {
      i++;
      continue;
    }

    const key = match[2].replace(/^["']|["']$/g, '');
    let valueStr = match[3].trim();

    if (valueStr === '' || valueStr === '|-') {
      // Check for nested content
      const nextNonEmpty = findNextNonEmptyLine(lines, i + 1);
      if (nextNonEmpty !== null) {
        const nextIndent = lines[nextNonEmpty].search(/\S/);
        if (nextIndent > lineIndent) {
          if (lines[nextNonEmpty].trimStart().startsWith('- ')) {
            const arr = parseYamlArray(lines, nextNonEmpty, nextIndent);
            result[key] = arr.value;
            i = arr.nextIdx;
            continue;
          } else if (valueStr === '|-') {
            // Multi-line string
            const mlResult = parseMultilineString(lines, i + 1, nextIndent);
            result[key] = mlResult.value;
            i = mlResult.nextIdx;
            continue;
          } else {
            const nested = parseYamlLines(lines, nextNonEmpty, nextIndent);
            result[key] = nested.value;
            i = nested.nextIdx;
            continue;
          }
        }
      }
      result[key] = null;
      i++;
      continue;
    }

    // Inline value
    result[key] = parseYamlScalar(valueStr);
    i++;
  }

  return { value: result, nextIdx: i };
}

function parseYamlArray(lines, startIdx, baseIndent) {
  const result = [];
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.replace(/\s+$/, '');

    if (stripped === '' || stripped.trimStart().startsWith('#')) {
      i++;
      continue;
    }

    const lineIndent = line.search(/\S/);
    if (lineIndent < baseIndent) break;

    if (!stripped.trimStart().startsWith('- ')) {
      break;
    }

    const afterDash = stripped.trimStart().slice(2);

    // Inline array: - value or - key: value (object start)
    const kvMatch = afterDash.match(/^([\w$"'/~.]+)\s*:\s*(.*)/);
    if (kvMatch) {
      // Object item starting with first key
      const firstKey = kvMatch[1].replace(/^["']|["']$/g, '');
      const firstVal = kvMatch[2].trim();
      const obj = {};
      obj[firstKey] = firstVal === '' ? null : parseYamlScalar(firstVal);

      // Check for more keys at indent+2
      const nextNonEmpty = findNextNonEmptyLine(lines, i + 1);
      if (nextNonEmpty !== null) {
        const nextIndent = lines[nextNonEmpty].search(/\S/);
        if (nextIndent > lineIndent && !lines[nextNonEmpty].trimStart().startsWith('- ')) {
          const rest = parseYamlLines(lines, nextNonEmpty, nextIndent);
          Object.assign(obj, rest.value);
          i = rest.nextIdx;
          result.push(obj);
          continue;
        }
      }
      result.push(obj);
      i++;
      continue;
    }

    // Simple scalar item
    result.push(parseYamlScalar(afterDash));
    i++;
  }

  return { value: result, nextIdx: i };
}

function parseMultilineString(lines, startIdx, baseIndent) {
  const parts = [];
  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.replace(/\s+$/, '');
    if (stripped === '') {
      parts.push('');
      i++;
      continue;
    }
    const lineIndent = line.search(/\S/);
    if (lineIndent < baseIndent) break;
    parts.push(stripped.slice(baseIndent));
    i++;
  }
  // Strip trailing empty lines
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return { value: parts.join('\n'), nextIdx: i };
}

function findNextNonEmptyLine(lines, startIdx) {
  for (let i = startIdx; i < lines.length; i++) {
    const stripped = lines[i].replace(/\s+$/, '');
    if (stripped !== '' && !stripped.trimStart().startsWith('#')) return i;
  }
  return null;
}

function parseYamlScalar(s) {
  s = s.trim();
  if (s === '') return null;
  if (s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;

  // Inline array: [a, b, c]
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map(v => parseYamlScalar(v.trim()));
  }

  // Inline object: {}
  if (s === '{}') return {};

  // Quoted strings
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }

  // $ref value
  if (s.startsWith("'#/") || s.startsWith('"#/')) {
    return s.slice(1, -1);
  }

  // Number
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);

  return s;
}

// ---------------------------------------------------------------------------
// Aggregate openapi.yaml generation
// ---------------------------------------------------------------------------

function generateAggregateYaml(operations) {
  const categories = {};
  for (const op of operations) {
    const cat = op.category || 'other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(op);
  }

  const lines = [
    'openapi: 3.1.0',
    'info:',
    '  title: FastNEAR RPC',
    '  description: |-',
    '    NEAR Protocol JSON RPC',
    '',
    '    For exhaustive list of endpoints, refer to the [NEAR documentation](https://docs.near.org/api/rpc/transactions).',
    '  version: "1.0.0"',
    'servers:',
    '  - url: "https://rpc.mainnet.fastnear.com"',
    '    description: "Mainnet"',
    '  - url: "https://rpc.testnet.fastnear.com"',
    '    description: "Testnet"',
    '  - url: "https://archival-rpc.mainnet.fastnear.com"',
    '    description: "Mainnet Archival"',
    '  - url: "https://archival-rpc.testnet.fastnear.com"',
    '    description: "Testnet Archival"',
    '',
    'paths:',
  ];

  const categoryLabels = {
    account: 'Account operations',
    block: 'Block operations',
    contract: 'Contract operations',
    protocol: 'Protocol operations',
    transaction: 'Transaction operations',
    validators: 'Validator operations',
  };

  const categoryOrder = ['account', 'block', 'contract', 'protocol', 'transaction', 'validators'];

  for (const cat of categoryOrder) {
    const ops = categories[cat];
    if (!ops || ops.length === 0) continue;

    lines.push(`  # ${categoryLabels[cat] || cat}`);
    for (const op of ops) {
      const refPath = `./${op.file}#/paths/~1`;
      lines.push(`  /${op.operationId}:`);
      lines.push(`    $ref: '${refPath}'`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

function readExistingYaml(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseYaml(content);
  } catch (e) {
    return null;
  }
}

function writeYamlFile(filePath, doc) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const content = toYaml(doc);
  fs.writeFileSync(filePath, content + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const specPath = process.argv[2] || DEFAULT_SPEC_PATH;

  console.log(`Reading nearcore spec from: ${specPath}`);

  if (!fs.existsSync(specPath)) {
    console.error(`Error: File not found: ${specPath}`);
    process.exit(1);
  }

  const specRaw = fs.readFileSync(specPath, 'utf-8');
  const spec = JSON.parse(specRaw);

  console.log(`Loaded: ${spec.info.title} v${spec.info.version}`);
  console.log(`  ${Object.keys(spec.paths).length} paths, ${Object.keys(spec.components.schemas).length} schemas`);
  console.log();

  // Check for nearcore methods not in our operation map
  const mappedPaths = new Set();
  for (const op of OPERATIONS) {
    if (op.nearcorePath) mappedPaths.add(op.nearcorePath);
  }
  // Query variants are all under /query
  mappedPaths.add('/query');
  // Block/chunk/gas/validators are decomposed
  mappedPaths.add('/block');
  mappedPaths.add('/chunk');
  mappedPaths.add('/gas_price');
  mappedPaths.add('/validators');

  const unmappedPaths = Object.keys(spec.paths).filter(p =>
    !mappedPaths.has(p) && !DEPRECATED_METHODS.includes(p)
  );
  if (unmappedPaths.length > 0) {
    console.log('Unmapped nearcore paths (not in operation map):');
    for (const p of unmappedPaths) {
      const desc = spec.paths[p]?.post?.description?.slice(0, 60) || '';
      console.log(`  ${p}: ${desc}`);
    }
    console.log();
  }

  // Report deprecated methods being skipped
  const presentDeprecated = DEPRECATED_METHODS.filter(p => spec.paths[p]);
  if (presentDeprecated.length > 0) {
    console.log('Skipping deprecated methods:');
    for (const p of presentDeprecated) {
      console.log(`  ${p}`);
    }
    console.log();
  }

  // Process each operation
  let created = 0, updated = 0, unchanged = 0, skipped = 0;

  for (const op of OPERATIONS) {
    const filePath = path.join(RPCS_DIR, op.file);
    const existing = readExistingYaml(filePath);

    // Custom operations: leave untouched
    if (op.type === 'custom') {
      if (existing) {
        console.log(`  SKIP (custom) ${op.file}${op.note ? ` — ${op.note}` : ''}`);
        skipped++;
      } else {
        console.log(`  WARN: Custom operation ${op.file} has no existing file`);
      }
      continue;
    }

    const doc = buildOperationYaml(spec, op, existing);
    const yamlStr = toYaml(doc) + '\n';

    if (existing) {
      // Check if content changed
      const existingContent = fs.readFileSync(filePath, 'utf-8');
      if (existingContent.trim() === yamlStr.trim()) {
        console.log(`  UNCHANGED ${op.file}`);
        unchanged++;
      } else {
        writeYamlFile(filePath, doc);
        console.log(`  UPDATED   ${op.file}`);
        updated++;
      }
    } else {
      writeYamlFile(filePath, doc);
      console.log(`  CREATED   ${op.file}`);
      created++;
    }
  }

  console.log();

  // Regenerate aggregate openapi.yaml
  const aggregateContent = generateAggregateYaml(OPERATIONS);
  const aggregatePath = path.join(RPCS_DIR, 'openapi.yaml');
  fs.writeFileSync(aggregatePath, aggregateContent + '\n', 'utf-8');
  console.log('Regenerated rpcs/openapi.yaml');

  console.log();
  console.log('Summary:');
  console.log(`  Created:   ${created}`);
  console.log(`  Updated:   ${updated}`);
  console.log(`  Unchanged: ${unchanged}`);
  console.log(`  Skipped:   ${skipped} (custom, not in nearcore)`);
}

main();
