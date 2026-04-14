#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const {
  auditGeneratedStructuredGraph,
} = require("./structured-graph-common");

const ROOT = path.resolve(__dirname, "..");
const PAGE_MODELS_PATH = path.join(ROOT, "shared/generatedFastnearPageModels.json");
const STRUCTURED_GRAPH_PATH = path.join(ROOT, "shared/generatedFastnearStructuredGraph.json");

function loadJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${path.relative(ROOT, filePath)}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
  const pageModels = loadJson(PAGE_MODELS_PATH, "page model registry");
  const structuredGraph = loadJson(STRUCTURED_GRAPH_PATH, "structured graph registry");
  const counts = auditGeneratedStructuredGraph(structuredGraph, pageModels);

  console.log(
    `Structured graph audit passed for ${counts.families} families, ${counts.operations} operations, and ${counts.breadcrumbs} breadcrumb descriptors.`
  );
}

try {
  main();
} catch (error) {
  console.error(`Structured graph audit failed: ${error.message}`);
  process.exitCode = 1;
}
