#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const { auditPageModels } = require("./audit-page-model-routes");
const { buildGeneratedStructuredGraph, auditGeneratedStructuredGraph } = require("./structured-graph-common");
const { readGeneratedNearcoreSourceJson } = require("./nearcore-source-metadata");

const ROOT = path.resolve(__dirname, "..");
const ENHANCEMENTS_ROOT = path.resolve(ROOT, "enhancements");
const GENERATED_FASTNEAR_PAGE_MODELS_MODULE = path.resolve(
  ROOT,
  "shared/generatedFastnearPageModels.ts"
);
const GENERATED_FASTNEAR_PAGE_MODELS_JSON = path.resolve(
  ROOT,
  "shared/generatedFastnearPageModels.json"
);
const GENERATED_FASTNEAR_STRUCTURED_GRAPH_MODULE = path.resolve(
  ROOT,
  "shared/generatedFastnearStructuredGraph.ts"
);
const GENERATED_FASTNEAR_STRUCTURED_GRAPH_JSON = path.resolve(
  ROOT,
  "shared/generatedFastnearStructuredGraph.json"
);
const BUILDER_DOCS_ROOT = path.resolve(ROOT, "../fn/builder-docs");
const BUILDER_DOCS_FASTNEAR_PAGE_MODELS_PATH = path.resolve(
  BUILDER_DOCS_ROOT,
  "src/data/generatedFastnearPageModels.json"
);
const BUILDER_DOCS_FASTNEAR_STRUCTURED_GRAPH_PATH = path.resolve(
  BUILDER_DOCS_ROOT,
  "src/data/generatedFastnearStructuredGraph.json"
);
const NETWORK_FALLBACKS = {
  account_id: {
    mainnet: "root.near",
    testnet: "root.testnet",
  },
};
function toPosixRelative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function readYaml(filePath) {
  return YAML.parse(fs.readFileSync(filePath, "utf8"));
}

function decodeJsonPointerToken(token) {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function resolveJsonPointer(document, pointer) {
  if (!pointer || !pointer.startsWith("#/")) {
    throw new Error(`Unsupported JSON pointer: ${pointer}`);
  }

  return pointer
    .slice(2)
    .split("/")
    .map(decodeJsonPointerToken)
    .reduce((current, segment) => {
      if (current && typeof current === "object" && segment in current) {
        return current[segment];
      }

      throw new Error(`Could not resolve pointer segment "${segment}" from ${pointer}`);
    }, document);
}

function cloneJson(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function stableJsonStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function loadPreviousGeneratedPageModels() {
  if (!fs.existsSync(GENERATED_FASTNEAR_PAGE_MODELS_JSON)) {
    return [];
  }

  return JSON.parse(fs.readFileSync(GENERATED_FASTNEAR_PAGE_MODELS_JSON, "utf8"));
}

function auditPageModelCompatibility(models, previousModels = []) {
  const currentModelsByCanonicalPath = new Map(
    models
      .filter((model) => typeof model?.canonicalPath === "string" && model.canonicalPath)
      .map((model) => [model.canonicalPath, model])
  );

  for (const previousModel of previousModels) {
    if (typeof previousModel?.canonicalPath !== "string" || !previousModel.canonicalPath) {
      continue;
    }

    const currentModel = currentModelsByCanonicalPath.get(previousModel.canonicalPath);
    if (!currentModel) {
      throw new Error(
        [
          `Page model compatibility check failed for ${previousModel.canonicalPath}.`,
          `The previously generated page model ${previousModel.pageModelId} is missing from the new output.`,
          "Canonical operation routes are treated as a compatibility contract.",
          "Coordinate the route removal explicitly before regenerating page models.",
        ].join(" ")
      );
    }

    if (currentModel.pageModelId !== previousModel.pageModelId) {
      throw new Error(
        [
          `Page model compatibility check failed for ${previousModel.canonicalPath}.`,
          `pageModelId changed from ${previousModel.pageModelId} to ${currentModel.pageModelId}.`,
          "pageModelId is treated as stable contract data for an existing canonical route.",
          "Preserve the prior pageModelId or coordinate the compatibility break before regenerating page models.",
        ].join(" ")
      );
    }
  }
}

function getRequestExampleSignature(example) {
  if (!example?.request || typeof example.request !== "object") {
    return undefined;
  }

  return stableJsonStringify(example.request);
}

function getRequestExampleLabelKey(example) {
  const label = typeof example?.label === "string" ? example.label.trim() : "";
  return label || undefined;
}

function getRequestExampleNetworkKey(example) {
  return typeof example?.network === "string" && example.network ? example.network : undefined;
}

function describeRequestExample(example) {
  return JSON.stringify({
    id: example?.id,
    label: example?.label,
    network: example?.network,
  });
}

function matchRequestExamplesUniquely(previousExamples, nextExamples, keyBuilder, onMatch) {
  const previousByKey = new Map();
  const nextByKey = new Map();

  for (const example of previousExamples) {
    const key = keyBuilder(example);
    if (!key) {
      continue;
    }

    const bucket = previousByKey.get(key) || [];
    bucket.push(example);
    previousByKey.set(key, bucket);
  }

  for (const example of nextExamples) {
    const key = keyBuilder(example);
    if (!key) {
      continue;
    }

    const bucket = nextByKey.get(key) || [];
    bucket.push(example);
    nextByKey.set(key, bucket);
  }

  for (const [key, previousMatches] of previousByKey.entries()) {
    const nextMatches = nextByKey.get(key);
    if (previousMatches.length !== 1 || nextMatches?.length !== 1) {
      continue;
    }

    onMatch(previousMatches[0], nextMatches[0]);
  }
}

function auditRequestExampleIds(models) {
  for (const model of models) {
    const examples = Array.isArray(model?.request?.examples) ? model.request.examples : [];
    const seenIds = new Set();

    for (const example of examples) {
      if (typeof example?.id !== "string" || !example.id.trim()) {
        throw new Error(
          `Request example ids must be non-empty strings for ${model.pageModelId}.`
        );
      }

      if (seenIds.has(example.id)) {
        throw new Error(
          `Duplicate request example id "${example.id}" detected for ${model.pageModelId}.`
        );
      }

      seenIds.add(example.id);
    }
  }
}

function reconcileRequestExampleIdsForModel(model, previousModel) {
  const nextExamples = Array.isArray(model?.request?.examples) ? model.request.examples : [];
  const previousExamples = Array.isArray(previousModel?.request?.examples)
    ? previousModel.request.examples
    : [];

  if (nextExamples.length === 0 || previousExamples.length === 0) {
    return;
  }

  const matchedPrevious = new Set();
  const matchedNext = new Set();
  const previousById = new Map(
    previousExamples
      .filter((example) => typeof example?.id === "string" && example.id)
      .map((example) => [example.id, example])
  );

  const matchPair = (previousExample, nextExample) => {
    if (matchedPrevious.has(previousExample) || matchedNext.has(nextExample)) {
      return;
    }

    nextExample.id = previousExample.id;
    matchedPrevious.add(previousExample);
    matchedNext.add(nextExample);
  };

  for (const nextExample of nextExamples) {
    const previousExample = previousById.get(nextExample.id);
    if (previousExample) {
      matchedPrevious.add(previousExample);
      matchedNext.add(nextExample);
    }
  }

  const runMatchStrategy = (keyBuilder) => {
    const unmatchedPrevious = previousExamples.filter((example) => !matchedPrevious.has(example));
    const unmatchedNext = nextExamples.filter((example) => !matchedNext.has(example));
    matchRequestExamplesUniquely(unmatchedPrevious, unmatchedNext, keyBuilder, matchPair);
  };

  runMatchStrategy(getRequestExampleSignature);
  runMatchStrategy(getRequestExampleNetworkKey);
  runMatchStrategy(getRequestExampleLabelKey);

  if (previousExamples.length === 1 && nextExamples.length === 1) {
    const unmatchedPrevious = previousExamples.filter((example) => !matchedPrevious.has(example));
    const unmatchedNext = nextExamples.filter((example) => !matchedNext.has(example));

    if (unmatchedPrevious.length === 1 && unmatchedNext.length === 1) {
      matchPair(unmatchedPrevious[0], unmatchedNext[0]);
    }
  }

  const unresolvedPrevious = previousExamples.filter((example) => !matchedPrevious.has(example));
  if (unresolvedPrevious.length === 0) {
    return;
  }

  const unresolvedNext = nextExamples.filter((example) => !matchedNext.has(example));

  throw new Error(
    [
      `Request example id compatibility check failed for ${model.pageModelId}.`,
      `These ids are part of the public share-link contract and could not be preserved automatically.`,
      `Previous examples: ${previousExamples.map(describeRequestExample).join(", ") || "(none)"}.`,
      `New examples: ${nextExamples.map(describeRequestExample).join(", ") || "(none)"}.`,
      `Unresolved previous examples: ${unresolvedPrevious.map(describeRequestExample).join(", ") || "(none)"}.`,
      `Unresolved new examples: ${unresolvedNext.map(describeRequestExample).join(", ") || "(none)"}.`,
      "Preserve the prior ids explicitly or coordinate the compatibility break before regenerating page models.",
    ].join(" ")
  );
}

function reconcileRequestExampleIds(models, previousModels = []) {
  const previousModelsById = new Map(
    previousModels
      .filter((model) => typeof model?.pageModelId === "string" && model.pageModelId)
      .map((model) => [model.pageModelId, model])
  );

  for (const model of models) {
    const previousModel = previousModelsById.get(model.pageModelId);
    if (!previousModel) {
      continue;
    }

    reconcileRequestExampleIdsForModel(model, previousModel);
  }
}

function getNetworkKey(value) {
  const lowered = `${value || ""}`.toLowerCase();
  if (lowered.includes("testnet")) {
    return "testnet";
  }
  if (lowered.includes("mainnet")) {
    return "mainnet";
  }
  return undefined;
}

function normalizeType(typeValue) {
  const values = Array.isArray(typeValue) ? typeValue : typeValue ? [typeValue] : [];
  const nullable = values.includes("null");
  const filtered = values.filter((value) => value !== "null");

  if (filtered.length === 0) {
    return { nullable, type: undefined };
  }

  return {
    nullable,
    type: filtered.length === 1 ? filtered[0] : filtered,
  };
}

function normalizeSchema(schema, document, seenRefs = []) {
  if (!schema || typeof schema !== "object") {
    return null;
  }

  if (schema.$ref) {
    const ref = schema.$ref;
    const refName = ref.split("/").pop();

    if (seenRefs.includes(ref)) {
      return {
        circular: true,
        refName,
        title: schema.title || refName,
      };
    }

    const resolved = normalizeSchema(resolveJsonPointer(document, ref), document, [...seenRefs, ref]);
    return {
      ...resolved,
      description: schema.description || resolved?.description,
      refName: resolved?.refName || refName,
      title: schema.title || resolved?.title,
    };
  }

  const { type, nullable } = normalizeType(schema.type);
  const normalized = {};

  if (type !== undefined) {
    normalized.type = type;
  }
  if (nullable) {
    normalized.nullable = true;
  }
  if (schema.title) {
    normalized.title = schema.title;
  }
  if (schema.description) {
    normalized.description = schema.description;
  }
  if (schema.format) {
    normalized.format = schema.format;
  }
  if (schema.default !== undefined) {
    normalized.default = schema.default;
  }
  if (schema.example !== undefined) {
    normalized.example = cloneJson(schema.example);
  }
  if (Array.isArray(schema.enum)) {
    normalized.enum = cloneJson(schema.enum);
  }
  if (Array.isArray(schema.required) && schema.required.length > 0) {
    normalized.required = [...schema.required];
  }
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    normalized.oneOf = schema.oneOf
      .map((candidate) => normalizeSchema(candidate, document, seenRefs))
      .filter(Boolean);
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    normalized.anyOf = schema.anyOf
      .map((candidate) => normalizeSchema(candidate, document, seenRefs))
      .filter(Boolean);
  }
  if (schema.items) {
    normalized.items = normalizeSchema(schema.items, document, seenRefs);
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    normalized.additionalProperties = normalizeSchema(
      schema.additionalProperties,
      document,
      seenRefs
    );
  } else if (typeof schema.additionalProperties === "boolean") {
    normalized.additionalProperties = schema.additionalProperties;
  }

  const properties = Object.entries(schema.properties || {});
  if (properties.length > 0) {
    normalized.properties = properties.map(([name, propertySchema]) => ({
      name,
      required: Array.isArray(schema.required) ? schema.required.includes(name) : false,
      schema: normalizeSchema(propertySchema, document, seenRefs),
    }));
  }

  return normalized;
}

function loadCustomPageSpecsFromEnhancements() {
  if (!fs.existsSync(ENHANCEMENTS_ROOT)) {
    return [];
  }

  const manifests = fs
    .readdirSync(ENHANCEMENTS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(ENHANCEMENTS_ROOT, entry.name, "manifest.yaml"))
    .filter((manifestPath) => fs.existsSync(manifestPath));

  const pageSpecs = [];

  for (const manifestPath of manifests) {
    const manifest = readYaml(manifestPath);
    for (const [canonicalPath, operation] of Object.entries(manifest?.operations || {})) {
      const customPage = operation?.customPage;
      if (!customPage?.pageModelId || !customPage?.sourceSpec) {
        continue;
      }

      pageSpecs.push({
        authTransport: customPage.authTransport || "bearer",
        canonicalPath,
        enhancementOperation: operation,
        kind: customPage.kind || "fastnear-rest-read",
        pageModelId: customPage.pageModelId,
        replaceOperationPage: Boolean(customPage.replaceOperationPage),
        routeAliases: customPage.operationRoute ? [customPage.operationRoute] : [],
        sourceSpec: path.resolve(ROOT, customPage.sourceSpec),
        transport: customPage.kind === "fastnear-rest-read" ? "http" : undefined,
      });
    }
  }

  return pageSpecs;
}

function listLeafRpcSpecs(dir, baseDir = dir) {
  const files = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listLeafRpcSpecs(absolutePath, baseDir));
      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith(".yaml") &&
      entry.name !== "openapi.yaml"
    ) {
      const relativePath = path.relative(baseDir, absolutePath);
      if (relativePath.includes(path.sep)) {
        files.push(relativePath);
      }
    }
  }

  return files.sort();
}

function loadRpcPageSpecs() {
  const rpcRoot = path.resolve(ROOT, "rpcs");
  if (!fs.existsSync(rpcRoot)) {
    return [];
  }

  return listLeafRpcSpecs(rpcRoot).map((relativePath) => {
    const sourceSpec = path.join(rpcRoot, relativePath);
    const document = readYaml(sourceSpec);
    const { operation } = getSingleOperation(document, sourceSpec);
    const relativeCanonicalPath = relativePath.replace(/\\/g, "/").replace(/\.yaml$/, "");
    const canonicalPath = `/rpcs/${relativeCanonicalPath}`;
    const pageModelId = `rpc-${operation.operationId.replace(/_/g, "-")}`;

    return {
      authTransport: "bearer",
      canonicalPath,
      kind: pageModelId,
      pageModelId,
      routeAliases: [
        `${canonicalPath}/other/${operation.operationId}`,
        `/reference/operation/${operation.operationId}`,
      ],
      sourceSpec,
      transport: "json-rpc",
    };
  });
}

const PAGE_SPECS = [...loadRpcPageSpecs(), ...loadCustomPageSpecsFromEnhancements()].map(
  (pageSpec) => ({
    ...pageSpec,
  })
);
const SOURCE_SPECS = PAGE_SPECS.map(({ sourceSpec }) => sourceSpec);

function getSingleOperation(document, sourceSpec) {
  const pathEntries = Object.entries(document.paths || {});
  if (pathEntries.length !== 1) {
    throw new Error(`Expected ${sourceSpec} to contain exactly one path.`);
  }

  const [pathName, pathItem] = pathEntries[0];
  const methodEntry = Object.entries(pathItem || {}).find(([, value]) => value && typeof value === "object" && !Array.isArray(value) && value.operationId);
  if (!methodEntry) {
    throw new Error(`Expected ${sourceSpec} to contain exactly one operation.`);
  }

  const [methodKey, operation] = methodEntry;
  return { methodKey, method: methodKey.toUpperCase(), operation, pathItem, pathName };
}

function resolveRef(document, value) {
  if (value?.$ref) {
    return resolveJsonPointer(document, value.$ref);
  }

  return value;
}

function collectParameters(document, pathItem, operation) {
  const resolved = [];
  const seen = new Map();

  for (const parameter of [...(pathItem?.parameters || []), ...(operation?.parameters || [])]) {
    const normalized = resolveRef(document, parameter);
    if (!normalized?.name || !normalized?.in) {
      continue;
    }

    const key = `${normalized.in}:${normalized.name}`;
    seen.set(key, normalized);
  }

  return [...seen.values()];
}

function normalizeParameter(parameter, document) {
  const resolved = resolveRef(document, parameter);
  const schema = normalizeSchema(resolved?.schema, document);
  const example =
    resolved?.example !== undefined
      ? cloneJson(resolved.example)
      : resolved?.schema?.example !== undefined
        ? cloneJson(resolved.schema.example)
        : undefined;
  const defaultValue = resolved?.schema?.default !== undefined ? cloneJson(resolved.schema.default) : undefined;

  return {
    description: resolved?.description,
    example,
    location: resolved?.in,
    name: resolved?.name,
    required: resolved?.in === "path" ? true : Boolean(resolved?.required),
    schema,
    default: defaultValue,
  };
}

function normalizeParameterGroups(parameters, document) {
  const groups = {
    header: [],
    path: [],
    query: [],
  };

  for (const parameter of parameters) {
    const normalized = normalizeParameter(parameter, document);
    if (normalized.location === "path" || normalized.location === "query" || normalized.location === "header") {
      groups[normalized.location].push(normalized);
    }
  }

  return groups;
}

function getFieldLabel(name, schema) {
  const description = `${schema?.description || ""}`.toLowerCase();

  switch (name) {
    case "account_id":
      return "Account ID";
    case "block_id":
      if (description.includes("height") && description.includes("hash")) {
        return "Block ID";
      }
      if (description.includes("height")) {
        return "Block Height";
      }
      if (description.includes("hash")) {
        return "Block Hash";
      }
      return "Block ID";
    case "public_key":
      return "Public Key";
    default:
      return name
        .split("_")
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ");
  }
}

function normalizeSecuritySchemes(document, operation, parameters) {
  const definitions = document.components?.securitySchemes || {};
  const operationRequirements = operation.security || document.security || [];
  const usedIds = new Set();

  for (const requirement of operationRequirements) {
    for (const id of Object.keys(requirement || {})) {
      usedIds.add(id);
    }
  }

  const schemes = [...usedIds].map((id) => {
    const scheme = definitions[id] || {};
    return {
      description:
        scheme.type === "apiKey" && scheme.in === "query"
          ? "The OpenAPI contract describes the FastNEAR API key as a query parameter named apiKey."
          : scheme.description,
      id,
      in: scheme.in,
      name: scheme.name,
      type: scheme.type,
    };
  });

  if (schemes.length > 0) {
    return schemes;
  }

  const apiKeyParameter = parameters.find(
    (parameter) => parameter?.in === "query" && parameter?.name === "apiKey"
  );
  if (!apiKeyParameter) {
    return [];
  }

  return [
    {
      description:
        apiKeyParameter.description ||
        "The OpenAPI contract describes the FastNEAR API key as a query parameter named apiKey.",
      id: "ApiKeyAuth",
      in: "query",
      name: "apiKey",
      type: "apiKey",
    },
  ];
}

function normalizeResponses(document, responses) {
  return Object.entries(responses || {})
    .map(([status, response]) => {
      const mediaTypeEntry = Object.entries(response.content || {})[0];
      const [mediaType, mediaValue] = mediaTypeEntry || [];
      return {
        description: response.description || "",
        mediaType,
        schema: mediaValue?.schema ? normalizeSchema(mediaValue.schema, document) : null,
        status,
      };
    })
    .sort((left, right) => left.status.localeCompare(right.status, undefined, { numeric: true }));
}

function getTransport(operation, pageSpec) {
  if (pageSpec.transport) {
    return pageSpec.transport;
  }

  const requestSchema = operation.requestBody?.content?.["application/json"]?.schema?.properties;
  if (requestSchema?.jsonrpc && requestSchema?.method && requestSchema?.params) {
    return "json-rpc";
  }

  return "http";
}

function getRpcParamsSchema(operation) {
  return operation.requestBody?.content?.["application/json"]?.schema?.properties?.params;
}

function buildRpcFields(operation, document) {
  const paramsSchema = getRpcParamsSchema(operation);
  const paramsProperties = paramsSchema?.properties || {};
  const requiredFields = new Set(paramsSchema?.required || []);

  return Object.entries(paramsProperties)
    .filter(([fieldName]) => fieldName !== "request_type" && fieldName !== "finality")
    .map(([fieldName, fieldSchema]) => ({
      description: fieldSchema?.description,
      label: getFieldLabel(fieldName, fieldSchema),
      location: "body",
      name: fieldName,
      required: requiredFields.has(fieldName),
      schema: normalizeSchema(fieldSchema, document),
    }));
}

function normalizeRpcExamples(examples) {
  return Object.entries(examples || {}).map(([name, example]) => ({
    id: name,
    label: example.summary || name,
    network: getNetworkKey(name) || getNetworkKey(example.summary),
    request: {
      body: cloneJson(example.value),
      headers: {},
      path: {},
      query: {},
    },
  }));
}

function collectRpcDefaultFields(examples, fields) {
  const defaultsByNetwork = {};
  let defaultId = "fastnear";

  for (const [name, example] of Object.entries(examples || {})) {
    const requestValue = example?.value;
    const params = requestValue?.params || {};
    const network =
      getNetworkKey(name) ||
      getNetworkKey(example?.summary) ||
      getNetworkKey(params.account_id);

    if (typeof requestValue?.id === "string" && requestValue.id) {
      defaultId = requestValue.id;
    }

    if (!network) {
      continue;
    }

    const fieldDefaults = (defaultsByNetwork[network] ||= {});
    for (const field of fields) {
      const fieldValue = params[field.name];
      if (
        fieldValue !== undefined &&
        fieldValue !== null &&
        fieldDefaults[field.name] === undefined
      ) {
        fieldDefaults[field.name] = cloneJson(fieldValue);
      }
    }
  }

  return { defaultId, defaultsByNetwork };
}

function buildNetworks(document, defaultsByNetwork = {}, fields = []) {
  const fieldNames = new Set(fields.map((field) => field.name));

  return (document.servers || []).map((server) => {
    const key = getNetworkKey(server.description || server.url);
    const defaultFields = cloneJson(defaultsByNetwork[key]) || {};

    for (const [fieldName, fallbackValues] of Object.entries(NETWORK_FALLBACKS)) {
      if (key && fieldNames.has(fieldName) && !defaultFields[fieldName] && fallbackValues[key]) {
        defaultFields[fieldName] = fallbackValues[key];
      }
    }

    return {
      defaultFields,
      key,
      label: server.description || server.url,
      url: server.url,
    };
  });
}

function buildRpcSections(pageSpec, document, operation) {
  const requestMediaType = operation.requestBody?.content?.["application/json"];
  const rawExamples = requestMediaType?.examples || {};
  const fields = buildRpcFields(operation, document);
  const requestExamples = normalizeRpcExamples(rawExamples);
  const { defaultId, defaultsByNetwork } = collectRpcDefaultFields(rawExamples, fields);
  const paramsProperties = getRpcParamsSchema(operation)?.properties || {};

  return {
    interaction: {
      authTransport: pageSpec.authTransport || "bearer",
      defaultId,
      fields,
      kind: pageSpec.kind || operation["x-fastnear-interaction"]?.kind || "rpc-view-account",
      networks: buildNetworks(document, defaultsByNetwork, fields),
      requestMethod:
        requestMediaType?.schema?.properties?.method?.enum?.[0] || operation.operationId,
      requestType: paramsProperties.request_type?.enum?.[0],
      supportsFinality: Boolean(paramsProperties.finality),
      transport: "json-rpc",
    },
    request: {
      bodySchema: requestMediaType?.schema
        ? normalizeSchema(requestMediaType.schema, document)
        : null,
      examples: requestExamples,
      mediaType: "application/json",
      parameters: {
        header: [],
        path: [],
        query: [],
      },
      required: Boolean(operation.requestBody?.required),
    },
  };
}

function getParameterSeedValue(parameter) {
  if (parameter?.example !== undefined && parameter.example !== null) {
    return parameter.example;
  }

  if (parameter?.default !== undefined && parameter.default !== null) {
    return parameter.default;
  }

  if (parameter?.schema?.example !== undefined && parameter.schema.example !== null) {
    return parameter.schema.example;
  }

  if (parameter?.schema?.default !== undefined && parameter.schema.default !== null) {
    return parameter.schema.default;
  }

  return "";
}

function getEnhancementPreset(operationEnhancement) {
  const presetName = operationEnhancement?.defaults?.preset;
  if (!presetName) {
    return undefined;
  }

  return operationEnhancement?.presets?.[presetName];
}

function getManifestValueForNetwork(value, networkKey) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  ) {
    if (networkKey && value[networkKey] !== undefined && value[networkKey] !== null) {
      return value[networkKey];
    }

    if (value.default !== undefined && value.default !== null) {
      return value.default;
    }

    return undefined;
  }

  return value;
}

function collectEnhancementFieldDefaults(pageSpec, interactionFields) {
  const preset = getEnhancementPreset(pageSpec.enhancementOperation);
  if (!preset) {
    return {};
  }

  const fieldNames = new Set(interactionFields.map((field) => field.name));
  const defaultsByNetwork = {};

  for (const location of ["path", "query", "body"]) {
    const values = preset?.[location];
    if (!values || typeof values !== "object") {
      continue;
    }

    for (const [fieldName, rawValue] of Object.entries(values)) {
      if (!fieldNames.has(fieldName)) {
        continue;
      }

      for (const networkKey of ["mainnet", "testnet"]) {
        const resolvedValue = getManifestValueForNetwork(rawValue, networkKey);
        if (resolvedValue === undefined || resolvedValue === null || resolvedValue === "") {
          continue;
        }

        const networkDefaults = (defaultsByNetwork[networkKey] ||= {});
        networkDefaults[fieldName] = cloneJson(resolvedValue);
      }
    }
  }

  const bodyByNetwork = preset?.bodyByNetwork;
  if (bodyByNetwork && typeof bodyByNetwork === "object") {
    for (const [networkKey, values] of Object.entries(bodyByNetwork)) {
      if (!values || typeof values !== "object") {
        continue;
      }

      for (const [fieldName, rawValue] of Object.entries(values)) {
        if (!fieldNames.has(fieldName)) {
          continue;
        }

        if (rawValue === undefined || rawValue === null || rawValue === "") {
          continue;
        }

        const networkDefaults = (defaultsByNetwork[networkKey] ||= {});
        networkDefaults[fieldName] = cloneJson(rawValue);
      }
    }
  }

  return defaultsByNetwork;
}

function getRequestBodyMediaTypeEntry(operation) {
  const content = operation?.requestBody?.content || {};

  if (content["application/json"]) {
    return ["application/json", content["application/json"]];
  }

  return Object.entries(content)[0] || [];
}

function buildHttpBodyFields(operation, document) {
  const [mediaType, mediaValue] = getRequestBodyMediaTypeEntry(operation);
  const resolvedSchema = resolveRef(document, mediaValue?.schema);
  const normalizedBodySchema = mediaValue?.schema ? normalizeSchema(mediaValue.schema, document) : null;

  if (!resolvedSchema || resolvedSchema.type !== "object" || !resolvedSchema.properties) {
    return {
      bodyFields: [],
      bodySchema: normalizedBodySchema,
      mediaType,
      rawExamples: mediaValue?.examples || {},
    };
  }

  const requiredFields = new Set(resolvedSchema.required || []);
  const bodyFields = Object.entries(resolvedSchema.properties || {}).map(([fieldName, fieldSchema]) => {
    const normalizedSchema = normalizeSchema(fieldSchema, document);
    const example =
      fieldSchema?.example !== undefined
        ? cloneJson(fieldSchema.example)
        : normalizedSchema?.example !== undefined
          ? cloneJson(normalizedSchema.example)
          : undefined;
    const defaultValue =
      fieldSchema?.default !== undefined
        ? cloneJson(fieldSchema.default)
        : normalizedSchema?.default !== undefined
          ? cloneJson(normalizedSchema.default)
          : undefined;

    return {
      default: defaultValue,
      description: fieldSchema?.description,
      example,
      label: getFieldLabel(fieldName, fieldSchema),
      location: "body",
      name: fieldName,
      required: requiredFields.has(fieldName),
      schema: normalizedSchema,
    };
  });

  return {
    bodyFields,
    bodySchema: normalizedBodySchema,
    mediaType,
    rawExamples: mediaValue?.examples || {},
  };
}

function splitFieldValuesByLocation(fields, fieldValues) {
  const body = {};
  const path = {};
  const query = {};

  for (const field of fields) {
    const value = fieldValues?.[field.name];
    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (field.location === "path") {
      path[field.name] = value;
      continue;
    }

    if (field.location === "query") {
      query[field.name] = value;
      continue;
    }

    if (field.location === "body") {
      body[field.name] = value;
    }
  }

  return { body, path, query };
}

function normalizeHttpExamples(rawExamples, interactionFields, networks, fallbackDefaultFields) {
  const exampleEntries = Object.entries(rawExamples || {});
  if (exampleEntries.length === 0) {
    return (networks.length > 0 ? networks : [{ defaultFields: fallbackDefaultFields, key: undefined, label: "Default" }]).map(
      (network, index) => {
        const defaults = cloneJson(network.defaultFields || fallbackDefaultFields);
        const request = splitFieldValuesByLocation(interactionFields, defaults);

        return {
          id: network.key || `network-${index + 1}`,
          label: network.label,
          network: network.key,
          request: {
            body: Object.keys(request.body).length > 0 ? request.body : null,
            headers: {},
            path: request.path,
            query: request.query,
          },
        };
      }
    );
  }

  return exampleEntries.map(([name, example], index) => {
    const network =
      getNetworkKey(name) ||
      getNetworkKey(example?.summary) ||
      (networks.length === 1 ? networks[0]?.key : undefined);
    const networkDefaults =
      cloneJson(
        networks.find((candidate) => candidate.key === network)?.defaultFields || fallbackDefaultFields
      ) || {};
    const requestDefaults = splitFieldValuesByLocation(interactionFields, networkDefaults);

    return {
      id: name || `example-${index + 1}`,
      label: example?.summary || name || `Example ${index + 1}`,
      network,
      request: {
        body: cloneJson(example?.value) ?? (Object.keys(requestDefaults.body).length > 0 ? requestDefaults.body : null),
        headers: {},
        path: requestDefaults.path,
        query: requestDefaults.query,
      },
    };
  });
}

function buildHttpSections(pageSpec, document, operation, parameters) {
  const parameterGroups = normalizeParameterGroups(parameters, document);
  const { bodyFields, bodySchema, mediaType, rawExamples } = buildHttpBodyFields(operation, document);
  const interactionFields = [...parameterGroups.path, ...parameterGroups.query]
    .filter((parameter) => parameter.name !== "apiKey")
    .map((parameter) => ({
      default: parameter.default,
      description: parameter.description,
      example: parameter.example,
      label: getFieldLabel(parameter.name, parameter.schema),
      location: parameter.location,
      name: parameter.name,
      required: parameter.required,
      schema: parameter.schema,
    }))
    .concat(bodyFields);

  const defaultFields = Object.fromEntries(
    interactionFields.map((field) => {
      const seedValue =
        field.default !== undefined && field.default !== null
          ? field.default
          : field.example !== undefined && field.example !== null
            ? field.example
            : getParameterSeedValue(field);

      return [field.name, seedValue === undefined || seedValue === null ? "" : cloneJson(seedValue)];
    })
  );
  const enhancementDefaultsByNetwork = collectEnhancementFieldDefaults(pageSpec, interactionFields);
  const networks = buildNetworks(
    document,
    {
      mainnet: {
        ...defaultFields,
        ...(enhancementDefaultsByNetwork.mainnet || {}),
      },
      testnet: {
        ...defaultFields,
        ...(enhancementDefaultsByNetwork.testnet || {}),
      },
    },
    interactionFields
  );
  const requestExamples = normalizeHttpExamples(
    rawExamples,
    interactionFields,
    networks,
    defaultFields
  );
  const hasBodyFields = bodyFields.length > 0 || Boolean(bodySchema);

  return {
    interaction: {
      authTransport: pageSpec.authTransport || "bearer",
      defaultId: undefined,
      fields: interactionFields,
      kind: pageSpec.kind || "fastnear-rest-read",
      networks,
      requestMethod: operation.operationId,
      requestType: undefined,
      supportsFinality: false,
      transport: "http",
    },
    request: {
      bodySchema: bodySchema || null,
      examples: requestExamples,
      mediaType: mediaType || undefined,
      parameters: parameterGroups,
      required: Boolean(operation.requestBody?.required) || interactionFields.some((field) => field.required),
      supportsBody: hasBodyFields,
    },
  };
}

function buildStandalonePageModel(pageSpec) {
  const document = readYaml(pageSpec.sourceSpec);
  const { method, operation, pathItem, pathName } = getSingleOperation(document, pageSpec.sourceSpec);
  const parameters = collectParameters(document, pathItem, operation);
  const transport = getTransport(operation, pageSpec);
  const sections =
    transport === "json-rpc"
      ? buildRpcSections(pageSpec, document, operation)
      : buildHttpSections(pageSpec, document, operation, parameters);

  return {
    canonicalPath: pageSpec.canonicalPath,
    info: {
      description: operation.description || document.info?.description || "",
      operationId: operation.operationId,
      summary: operation.summary,
      title: document.info?.title,
      version: document.info?.version,
    },
    interaction: sections.interaction,
    pageModelId: pageSpec.pageModelId,
    replaceOperationPage: pageSpec.replaceOperationPage !== false,
    request: sections.request,
    responses: normalizeResponses(document, operation.responses),
    route: {
      method,
      path: pathName,
      transport,
    },
    routeAliases: pageSpec.routeAliases || [],
    securitySchemes: normalizeSecuritySchemes(document, operation, parameters),
    sourceSpec: toPosixRelative(pageSpec.sourceSpec),
  };
}

function buildPageModels() {
  const previousModels = loadPreviousGeneratedPageModels();
  const models = PAGE_SPECS.map((pageSpec) => buildStandalonePageModel(pageSpec));
  auditPageModelCompatibility(models, previousModels);
  reconcileRequestExampleIds(models, previousModels);
  auditRequestExampleIds(models);
  return models;
}

function writeGeneratedFastnearPageModelsModule(models) {
  const lines = [
    "/* This file is auto-generated by scripts/generate-page-models.js. */",
    "/* Do not edit it by hand; regenerate it via npm run sync:apis or npm run standalone:build. */",
    "",
    'import allPageModels from "./generatedFastnearPageModels.json";',
    "",
    "export const ALL_PAGE_MODELS = allPageModels;",
    "",
    "export type GeneratedFastnearPageModel = (typeof ALL_PAGE_MODELS)[number];",
    "",
  ];

  fs.mkdirSync(path.dirname(GENERATED_FASTNEAR_PAGE_MODELS_MODULE), { recursive: true });
  fs.writeFileSync(GENERATED_FASTNEAR_PAGE_MODELS_MODULE, lines.join("\n"), "utf8");
}

function writeGeneratedFastnearPageModelsJson(models) {
  const serialized = `${JSON.stringify(models, null, 2)}\n`;

  fs.mkdirSync(path.dirname(GENERATED_FASTNEAR_PAGE_MODELS_JSON), { recursive: true });
  fs.writeFileSync(GENERATED_FASTNEAR_PAGE_MODELS_JSON, serialized, "utf8");

  if (fs.existsSync(BUILDER_DOCS_ROOT)) {
    fs.mkdirSync(path.dirname(BUILDER_DOCS_FASTNEAR_PAGE_MODELS_PATH), { recursive: true });
    fs.writeFileSync(BUILDER_DOCS_FASTNEAR_PAGE_MODELS_PATH, serialized, "utf8");
  }
}

function writeGeneratedFastnearStructuredGraphModule(graph) {
  const lines = [
    "/* This file is auto-generated by scripts/generate-page-models.js. */",
    "/* Do not edit it by hand; regenerate it via npm run sync:apis or npm run standalone:build. */",
    "",
    'import structuredGraph from "./generatedFastnearStructuredGraph.json";',
    "",
    "export const FASTNEAR_STRUCTURED_GRAPH = structuredGraph;",
    "",
    "export type GeneratedFastnearStructuredGraph = typeof FASTNEAR_STRUCTURED_GRAPH;",
    "",
  ];

  fs.mkdirSync(path.dirname(GENERATED_FASTNEAR_STRUCTURED_GRAPH_MODULE), { recursive: true });
  fs.writeFileSync(GENERATED_FASTNEAR_STRUCTURED_GRAPH_MODULE, lines.join("\n"), "utf8");
}

function writeGeneratedFastnearStructuredGraphJson(graph) {
  const serialized = `${JSON.stringify(graph, null, 2)}\n`;

  fs.mkdirSync(path.dirname(GENERATED_FASTNEAR_STRUCTURED_GRAPH_JSON), { recursive: true });
  fs.writeFileSync(GENERATED_FASTNEAR_STRUCTURED_GRAPH_JSON, serialized, "utf8");

  if (fs.existsSync(BUILDER_DOCS_ROOT)) {
    fs.mkdirSync(path.dirname(BUILDER_DOCS_FASTNEAR_STRUCTURED_GRAPH_PATH), { recursive: true });
    fs.writeFileSync(BUILDER_DOCS_FASTNEAR_STRUCTURED_GRAPH_PATH, serialized, "utf8");
  }
}

function writeGeneratedPageModelArtifacts() {
  const models = buildPageModels();
  auditPageModels(models);
  const nearcoreSource = readGeneratedNearcoreSourceJson();
  const structuredGraph = buildGeneratedStructuredGraph(models, {
    metadata: nearcoreSource ? { nearcoreSource } : undefined,
  });
  auditGeneratedStructuredGraph(structuredGraph, models);
  writeGeneratedFastnearPageModelsModule(models);
  writeGeneratedFastnearPageModelsJson(models);
  writeGeneratedFastnearStructuredGraphModule(structuredGraph);
  writeGeneratedFastnearStructuredGraphJson(structuredGraph);
  return models;
}

if (require.main === module) {
  const models = writeGeneratedPageModelArtifacts();
  for (const model of models) {
    console.log(`Generated page model: ${model.sourceSpec} -> ${model.pageModelId}`);
  }
}

module.exports = {
  auditPageModelCompatibility,
  auditRequestExampleIds,
  GENERATED_FASTNEAR_PAGE_MODELS_JSON,
  GENERATED_FASTNEAR_PAGE_MODELS_MODULE,
  GENERATED_FASTNEAR_STRUCTURED_GRAPH_JSON,
  GENERATED_FASTNEAR_STRUCTURED_GRAPH_MODULE,
  PAGE_SPECS,
  ROOT,
  SOURCE_SPECS,
  buildStandalonePageModel,
  buildPageModels,
  reconcileRequestExampleIds,
  writeGeneratedPageModelArtifacts,
};
