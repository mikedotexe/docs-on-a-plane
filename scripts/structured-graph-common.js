const RPC_FAMILY_DEFINITIONS = {
  account: {
    description: "JSON-RPC methods for account state, balances, and access-key lookups on NEAR.",
    docsPath: "/rpc",
    hostedPathPrefix: "/rpcs/account",
    id: "rpc-account",
    key: "account",
    kind: "rpc",
    name: "Account RPC",
  },
  block: {
    description: "JSON-RPC methods for block lookup, block effects, and block-oriented reads on NEAR.",
    docsPath: "/rpc",
    hostedPathPrefix: "/rpcs/block",
    id: "rpc-block",
    key: "block",
    kind: "rpc",
    name: "Block RPC",
  },
  contract: {
    description: "JSON-RPC methods for contract calls, contract code inspection, and contract state queries.",
    docsPath: "/rpc",
    hostedPathPrefix: "/rpcs/contract",
    id: "rpc-contract",
    key: "contract",
    kind: "rpc",
    name: "Contract RPC",
  },
  protocol: {
    description: "JSON-RPC methods for protocol status, gas, chunks, proofs, and network configuration.",
    docsPath: "/rpc",
    hostedPathPrefix: "/rpcs/protocol",
    id: "rpc-protocol",
    key: "protocol",
    kind: "rpc",
    name: "Protocol RPC",
  },
  transaction: {
    description: "JSON-RPC methods for transaction submission, receipt lookup, and transaction status checks.",
    docsPath: "/rpc",
    hostedPathPrefix: "/rpcs/transaction",
    id: "rpc-transaction",
    key: "transaction",
    kind: "rpc",
    name: "Transaction RPC",
  },
  validators: {
    description: "JSON-RPC methods for validator sets, epochs, and validator-ordering reads.",
    docsPath: "/rpc",
    hostedPathPrefix: "/rpcs/validators",
    id: "rpc-validators",
    key: "validators",
    kind: "rpc",
    name: "Validators RPC",
  },
};

const API_FAMILY_DEFINITIONS = {
  fastnear: {
    description: "Indexed FastNear REST endpoints for account views, public-key lookups, and system status.",
    docsPath: "/api",
    hostedPathPrefix: "/apis/fastnear",
    id: "api-fastnear",
    key: "fastnear",
    kind: "api",
    name: "FastNear API",
  },
  "kv-fastdata": {
    description: "REST endpoints for indexed key-value history and latest-state lookups across NEAR contracts.",
    docsPath: "/fastdata/kv",
    hostedPathPrefix: "/apis/kv-fastdata",
    id: "api-kv-fastdata",
    key: "kv-fastdata",
    kind: "api",
    name: "KV FastData API",
  },
  neardata: {
    description: "REST endpoints for finalized and optimistic block data, headers, shards, and block streams.",
    docsPath: "/neardata",
    hostedPathPrefix: "/apis/neardata",
    id: "api-neardata",
    key: "neardata",
    kind: "api",
    name: "NEAR Data API",
  },
  transactions: {
    description: "REST endpoints for transaction, block, account-history, and receipt lookups backed by indexed data.",
    docsPath: "/tx",
    hostedPathPrefix: "/apis/transactions",
    id: "api-transactions",
    key: "transactions",
    kind: "api",
    name: "Transactions API",
  },
  transfers: {
    description: "REST endpoints for indexed transfer history and pagination over account transfer activity.",
    docsPath: "/transfers",
    hostedPathPrefix: "/apis/transfers",
    id: "api-transfers",
    key: "transfers",
    kind: "api",
    name: "Transfers API",
  },
};

const FASTNEAR_DOCS_SEGMENT_MAP = {
  account_ft: "account-ft",
  account_full: "account-full",
  account_nft: "account-nft",
  account_staking: "account-staking",
  ft_top: "ft-top",
  public_key_lookup: "public-key",
  public_key_lookup_all: "public-key-all",
};

const RPC_DOCS_SEGMENT_MAP = {
  call: "call-function",
};

const TRANSFERS_DOCS_SEGMENT_MAP = {
  transfers: "query",
};

const EXPECTED_FAMILY_OPERATION_COUNTS = {
  "api-fastnear": 14,
  "api-kv-fastdata": 9,
  "api-neardata": 9,
  "api-transactions": 5,
  "api-transfers": 1,
  "rpc-account": 3,
  "rpc-block": 3,
  "rpc-contract": 5,
  "rpc-protocol": 20,
  "rpc-transaction": 7,
  "rpc-validators": 3,
};

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function normalizeRoute(route) {
  const normalized = String(route || "").trim();
  if (!normalized) {
    return "/";
  }

  if (normalized === "/") {
    return "/";
  }

  const prefixed = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return prefixed.replace(/\/+$/, "");
}

function toDocsSlug(segment) {
  return String(segment || "")
    .toLowerCase()
    .replace(/_/g, "-");
}

function getFamilyDefinition(canonicalPath) {
  const segments = normalizeRoute(canonicalPath).split("/").filter(Boolean);
  if (segments[0] === "rpcs") {
    return RPC_FAMILY_DEFINITIONS[segments[1]] || null;
  }

  if (segments[0] === "apis") {
    return API_FAMILY_DEFINITIONS[segments[1]] || null;
  }

  return null;
}

function getFastnearDocsPath(versionOrSystem, operationSegment) {
  if (versionOrSystem === "system") {
    return `/api/system/${toDocsSlug(operationSegment)}`;
  }

  const docsSegment = FASTNEAR_DOCS_SEGMENT_MAP[operationSegment] || toDocsSlug(operationSegment);
  return `/api/${versionOrSystem}/${docsSegment}`;
}

function getTransactionsDocsPath(operationSegment) {
  return `/tx/${toDocsSlug(operationSegment)}`;
}

function getTransfersDocsPath(operationSegment) {
  return `/${["transfers", TRANSFERS_DOCS_SEGMENT_MAP[operationSegment] || toDocsSlug(operationSegment)].join("/")}`;
}

function getNearDataDocsPath(versionOrSystem, operationSegment) {
  if (versionOrSystem === "system") {
    return `/neardata/system/${toDocsSlug(operationSegment)}`;
  }

  return `/neardata/${toDocsSlug(operationSegment)}`;
}

function getKvFastDataDocsPath(_version, operationSegment) {
  return `/fastdata/kv/${toDocsSlug(operationSegment)}`;
}

function getOperationDocsPath(canonicalPath) {
  const segments = normalizeRoute(canonicalPath).split("/").filter(Boolean);
  if (segments[0] === "rpcs") {
    const docsSegment = RPC_DOCS_SEGMENT_MAP[segments[2]] || toDocsSlug(segments[2]);
    return `/rpc/${segments[1]}/${docsSegment}`;
  }

  if (segments[0] !== "apis") {
    return null;
  }

  const [, service, versionOrSystem, operationSegment] = segments;
  if (service === "fastnear") {
    return getFastnearDocsPath(versionOrSystem, operationSegment);
  }
  if (service === "transactions") {
    return getTransactionsDocsPath(operationSegment);
  }
  if (service === "transfers") {
    return getTransfersDocsPath(operationSegment);
  }
  if (service === "neardata") {
    return getNearDataDocsPath(versionOrSystem, operationSegment);
  }
  if (service === "kv-fastdata") {
    return getKvFastDataDocsPath(versionOrSystem, operationSegment);
  }

  return null;
}

function summarizeAuth(securitySchemes) {
  if (!Array.isArray(securitySchemes) || securitySchemes.length === 0) {
    return "No auth required";
  }

  const parts = securitySchemes.map((scheme) => {
    if (scheme.type === "apiKey") {
      return `API key via ${scheme.in} ${scheme.name}`;
    }

    if (scheme.type === "http" && scheme.scheme === "bearer") {
      return "Bearer token via Authorization header";
    }

    return scheme.description || `${scheme.type || "auth"} ${scheme.id || ""}`.trim();
  });

  return parts.join("; ");
}

function buildFamilyEntityFromDefinition(definition) {
  return {
    description: definition.description,
    docsPath: definition.docsPath,
    hostedPathPrefix: definition.hostedPathPrefix,
    id: definition.id,
    key: definition.key,
    kind: definition.kind,
    name: definition.name,
    schemaType: "WebAPI",
  };
}

function buildOperationEntity(pageModel) {
  const family = getFamilyDefinition(pageModel.canonicalPath);
  assert(family, `No family definition for ${pageModel.pageModelId}: ${pageModel.canonicalPath}`);

  const docsPath = getOperationDocsPath(pageModel.canonicalPath);
  assert(docsPath, `No docsPath mapping for ${pageModel.pageModelId}: ${pageModel.canonicalPath}`);

  return {
    authSummary: summarizeAuth(pageModel.securitySchemes),
    canonicalPath: pageModel.canonicalPath,
    description: pageModel.info.description,
    docsPath,
    familyId: family.id,
    headline: pageModel.info.title,
    httpMethod: pageModel.route.method,
    id: pageModel.pageModelId,
    name: pageModel.info.title,
    networkKeys: (pageModel.interaction.networks || []).map((network) => network.key),
    operationId: pageModel.info.operationId,
    pageModelId: pageModel.pageModelId,
    requestPath: pageModel.route.path,
    requestType: pageModel.interaction.requestType || null,
    routeAliases: [...(pageModel.routeAliases || [])],
    schemaType: "APIReference",
    sourceSpec: pageModel.sourceSpec,
    summary: pageModel.info.summary,
    transport: pageModel.route.transport,
  };
}

function buildBreadcrumbDescriptor(operation, family) {
  return {
    canonicalPath: operation.canonicalPath,
    items: [
      {
        label: family.name,
        path: family.docsPath,
      },
      {
        label: operation.summary || operation.name,
        path: operation.canonicalPath,
      },
    ],
    pageModelId: operation.pageModelId,
  };
}

function buildGeneratedStructuredGraph(pageModels, options = {}) {
  assert(Array.isArray(pageModels), "Structured graph generation requires a page-model array");
  const metadata =
    options.metadata && typeof options.metadata === "object"
      ? JSON.parse(JSON.stringify(options.metadata))
      : null;

  const usedFamilies = new Map();
  const operations = pageModels
    .map((pageModel) => {
      const operation = buildOperationEntity(pageModel);
      const familyDefinition = getFamilyDefinition(pageModel.canonicalPath);
      usedFamilies.set(familyDefinition.id, buildFamilyEntityFromDefinition(familyDefinition));
      return operation;
    })
    .sort((left, right) => left.canonicalPath.localeCompare(right.canonicalPath));

  const families = [...usedFamilies.values()].sort((left, right) => left.id.localeCompare(right.id));
  const familiesById = Object.fromEntries(families.map((family) => [family.id, family]));
  const breadcrumbs = operations
    .map((operation) => buildBreadcrumbDescriptor(operation, familiesById[operation.familyId]))
    .sort((left, right) => left.canonicalPath.localeCompare(right.canonicalPath));

  return {
    breadcrumbs,
    families,
    ...(metadata ? { metadata } : {}),
    operations,
    version: 1,
  };
}

function auditGeneratedStructuredGraph(graph, pageModels) {
  assert(graph && typeof graph === "object", "Structured graph must be an object");
  assert(graph.version === 1, `Unexpected structured graph version: ${graph.version}`);
  assert(Array.isArray(graph.families), "Structured graph families must be an array");
  assert(Array.isArray(graph.operations), "Structured graph operations must be an array");
  assert(Array.isArray(graph.breadcrumbs), "Structured graph breadcrumbs must be an array");
  if (graph.metadata !== undefined) {
    assert(graph.metadata && typeof graph.metadata === "object", "Structured graph metadata must be an object");
    if (graph.metadata.nearcoreSource !== undefined) {
      const nearcoreSource = graph.metadata.nearcoreSource;
      assert(
        nearcoreSource && typeof nearcoreSource === "object",
        "Structured graph nearcoreSource metadata must be an object"
      );
      assert(
        typeof nearcoreSource.repoUrl === "string" && nearcoreSource.repoUrl,
        "Structured graph nearcoreSource repoUrl must be present"
      );
      if (nearcoreSource.tag !== null && nearcoreSource.tag !== undefined) {
        assert(
          typeof nearcoreSource.tag === "string" && nearcoreSource.tag,
          "Structured graph nearcoreSource tag must be a string when present"
        );
      }
      if (nearcoreSource.releaseUrl !== null && nearcoreSource.releaseUrl !== undefined) {
        assert(
          typeof nearcoreSource.releaseUrl === "string" &&
            nearcoreSource.releaseUrl.startsWith("https://github.com/near/nearcore/releases/tag/"),
          "Structured graph nearcoreSource releaseUrl must point at a nearcore release tag"
        );
      }
    }
  }

  const familyIds = new Set();
  const familyDocsPaths = new Map();
  const familyOperationCounts = new Map();

  graph.families.forEach((family) => {
    assert(family && typeof family === "object", "Invalid family entry in structured graph");
    assert(family.schemaType === "WebAPI", `Family ${family.id} must use schemaType WebAPI`);
    assert(typeof family.id === "string" && family.id, "Structured family is missing id");
    assert(!familyIds.has(family.id), `Duplicate structured family id ${family.id}`);
    familyIds.add(family.id);
    assert(typeof family.name === "string" && family.name, `Structured family ${family.id} is missing name`);
    assert(
      typeof family.description === "string" && family.description,
      `Structured family ${family.id} is missing description`
    );
    assert(
      typeof family.docsPath === "string" && family.docsPath.startsWith("/"),
      `Structured family ${family.id} has invalid docsPath ${family.docsPath}`
    );
    assert(
      typeof family.hostedPathPrefix === "string" &&
        /^\/(rpcs|apis)\//.test(family.hostedPathPrefix),
      `Structured family ${family.id} has invalid hostedPathPrefix ${family.hostedPathPrefix}`
    );

    if (!familyDocsPaths.has(family.docsPath)) {
      familyDocsPaths.set(family.docsPath, []);
    }
    familyDocsPaths.get(family.docsPath).push(family.id);
  });

  const pageModelsById = Object.fromEntries(pageModels.map((pageModel) => [pageModel.pageModelId, pageModel]));
  const operationIds = new Set();
  const operationDocsPaths = new Set();
  const canonicalPaths = new Set();

  graph.operations.forEach((operation) => {
    assert(operation && typeof operation === "object", "Invalid operation entry in structured graph");
    assert(operation.schemaType === "APIReference", `Operation ${operation.id} must use schemaType APIReference`);
    assert(typeof operation.id === "string" && operation.id, "Structured operation is missing id");
    assert(!operationIds.has(operation.id), `Duplicate structured operation id ${operation.id}`);
    operationIds.add(operation.id);

    const pageModel = pageModelsById[operation.pageModelId];
    assert(pageModel, `Structured operation ${operation.id} does not match any page model`);
    assert(operation.pageModelId === pageModel.pageModelId, `Structured operation ${operation.id} has mismatched pageModelId`);
    assert(operation.canonicalPath === pageModel.canonicalPath, `Structured operation ${operation.id} has mismatched canonicalPath`);
    assert(
      JSON.stringify(operation.routeAliases) === JSON.stringify(pageModel.routeAliases),
      `Structured operation ${operation.id} has mismatched routeAliases`
    );
    assert(
      typeof operation.name === "string" && operation.name,
      `Structured operation ${operation.id} is missing name`
    );
    assert(
      typeof operation.summary === "string" && operation.summary,
      `Structured operation ${operation.id} is missing summary`
    );
    assert(
      typeof operation.description === "string" && operation.description,
      `Structured operation ${operation.id} is missing description`
    );
    assert(
      typeof operation.docsPath === "string" && operation.docsPath.startsWith("/"),
      `Structured operation ${operation.id} has invalid docsPath ${operation.docsPath}`
    );
    assert(!operationDocsPaths.has(operation.docsPath), `Duplicate structured docsPath ${operation.docsPath}`);
    operationDocsPaths.add(operation.docsPath);
    assert(
      !canonicalPaths.has(operation.canonicalPath),
      `Duplicate structured canonicalPath ${operation.canonicalPath}`
    );
    canonicalPaths.add(operation.canonicalPath);
    assert(
      familyIds.has(operation.familyId),
      `Structured operation ${operation.id} references missing family ${operation.familyId}`
    );
    assert(
      typeof operation.transport === "string" && operation.transport,
      `Structured operation ${operation.id} is missing transport`
    );
    assert(
      typeof operation.httpMethod === "string" && operation.httpMethod,
      `Structured operation ${operation.id} is missing httpMethod`
    );
    assert(
      typeof operation.requestPath === "string" && operation.requestPath,
      `Structured operation ${operation.id} is missing requestPath`
    );
    assert(
      typeof operation.operationId === "string" && operation.operationId,
      `Structured operation ${operation.id} is missing operationId`
    );
    assert(
      Array.isArray(operation.networkKeys) && operation.networkKeys.length > 0,
      `Structured operation ${operation.id} is missing networkKeys`
    );
    assert(
      typeof operation.authSummary === "string" && operation.authSummary,
      `Structured operation ${operation.id} is missing authSummary`
    );
    assert(
      typeof operation.sourceSpec === "string" && operation.sourceSpec,
      `Structured operation ${operation.id} is missing sourceSpec`
    );

    familyOperationCounts.set(operation.familyId, (familyOperationCounts.get(operation.familyId) || 0) + 1);
  });

  assert(
    graph.operations.length === pageModels.length,
    `Structured graph must contain one operation per page model: expected ${pageModels.length}, got ${graph.operations.length}`
  );

  const breadcrumbIds = new Set();
  graph.breadcrumbs.forEach((breadcrumb) => {
    assert(
      typeof breadcrumb.pageModelId === "string" && breadcrumb.pageModelId,
      "Structured breadcrumb is missing pageModelId"
    );
    assert(
      typeof breadcrumb.canonicalPath === "string" && breadcrumb.canonicalPath,
      `Structured breadcrumb ${breadcrumb.pageModelId} is missing canonicalPath`
    );
    assert(!breadcrumbIds.has(breadcrumb.pageModelId), `Duplicate structured breadcrumb ${breadcrumb.pageModelId}`);
    breadcrumbIds.add(breadcrumb.pageModelId);
    assert(Array.isArray(breadcrumb.items) && breadcrumb.items.length === 2, `Structured breadcrumb ${breadcrumb.pageModelId} must have exactly two items`);

    const operation = graph.operations.find((entry) => entry.pageModelId === breadcrumb.pageModelId);
    assert(operation, `Structured breadcrumb ${breadcrumb.pageModelId} references missing operation`);
    const family = graph.families.find((entry) => entry.id === operation.familyId);
    assert(family, `Structured breadcrumb ${breadcrumb.pageModelId} references missing family`);

    assert(
      breadcrumb.items[0].path === family.docsPath,
      `Structured breadcrumb ${breadcrumb.pageModelId} has incorrect family docs path`
    );
    assert(
      breadcrumb.items[1].path === operation.canonicalPath,
      `Structured breadcrumb ${breadcrumb.pageModelId} must end at hosted canonicalPath`
    );
  });

  assert(
    graph.breadcrumbs.length === graph.operations.length,
    `Structured graph must contain one breadcrumb descriptor per operation: expected ${graph.operations.length}, got ${graph.breadcrumbs.length}`
  );

  const actualFamilyKeys = [...familyOperationCounts.keys()].sort();
  const expectedFamilyKeys = Object.keys(EXPECTED_FAMILY_OPERATION_COUNTS).sort();
  assert(
    JSON.stringify(actualFamilyKeys) === JSON.stringify(expectedFamilyKeys),
    `Unexpected structured graph families. Expected ${expectedFamilyKeys.join(", ")}, got ${actualFamilyKeys.join(", ")}`
  );

  for (const [familyId, expectedCount] of Object.entries(EXPECTED_FAMILY_OPERATION_COUNTS)) {
    const actualCount = familyOperationCounts.get(familyId) || 0;
    assert(
      actualCount === expectedCount,
      `Unexpected structured operation count for ${familyId}: expected ${expectedCount}, got ${actualCount}`
    );
  }

  return {
    breadcrumbs: graph.breadcrumbs.length,
    families: graph.families.length,
    operations: graph.operations.length,
  };
}

module.exports = {
  API_FAMILY_DEFINITIONS,
  EXPECTED_FAMILY_OPERATION_COUNTS,
  RPC_FAMILY_DEFINITIONS,
  auditGeneratedStructuredGraph,
  buildGeneratedStructuredGraph,
  getFamilyDefinition,
  getOperationDocsPath,
  normalizeRoute,
};
