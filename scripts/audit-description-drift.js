#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const BUILDER_DOCS_ROOT = path.resolve(__dirname, "../../fn/builder-docs");
const PAGE_MODELS_PATH = path.resolve(
  __dirname,
  "../shared/generatedFastnearPageModels.json"
);

const MDX_SURFACE_DIRS = [
  { surface: "api", dir: path.join(BUILDER_DOCS_ROOT, "docs/api") },
  { surface: "tx", dir: path.join(BUILDER_DOCS_ROOT, "docs/tx") },
  { surface: "transfers", dir: path.join(BUILDER_DOCS_ROOT, "docs/transfers") },
  { surface: "neardata", dir: path.join(BUILDER_DOCS_ROOT, "docs/neardata") },
  { surface: "fastdata", dir: path.join(BUILDER_DOCS_ROOT, "docs/fastdata") },
];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (entry.name.endsWith(".mdx")) {
      acc.push(full);
    }
  }
  return acc;
}

function extractPageModelId(source) {
  const match = source.match(/pageModelId="([^"]+)"/);
  return match ? match[1] : null;
}

function extractWrappedDescription(source) {
  const match = source.match(
    /data-fastnear-content="endpoint-description"[^>]*>\s*\n\s*([\s\S]*?)\s*\n\s*<\/div>/
  );
  return match ? match[1].trim() : null;
}

function hasRenderDescriptionProp(source) {
  return /renderDescription/.test(source);
}

function normalize(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function trigramSet(text) {
  const norm = normalize(text);
  const trigrams = new Set();
  for (let i = 0; i <= norm.length - 3; i++) {
    trigrams.add(norm.slice(i, i + 3));
  }
  return trigrams;
}

function trigramSimilarity(a, b) {
  const setA = trigramSet(a);
  const setB = trigramSet(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const tri of setA) {
    if (setB.has(tri)) intersection++;
  }
  return intersection / Math.max(setA.size, setB.size);
}

function classify(mdxDesc, upstreamDesc) {
  if (!mdxDesc && !upstreamDesc) return "EMPTY";
  if (!mdxDesc) return "UPSTREAM_ONLY";
  if (!upstreamDesc) return "MDX_ONLY";

  const normMdx = normalize(mdxDesc);
  const normUp = normalize(upstreamDesc);
  if (normMdx === normUp) return "IDENTICAL";

  const sim = trigramSimilarity(mdxDesc, upstreamDesc);
  return sim >= 0.5 ? "SIMILAR" : "DIVERGED";
}

function run() {
  const models = JSON.parse(fs.readFileSync(PAGE_MODELS_PATH, "utf8"));
  const modelById = new Map();
  for (const model of models) {
    if (model.pageModelId) {
      modelById.set(model.pageModelId, model);
    }
  }

  const mdxFiles = MDX_SURFACE_DIRS.flatMap(({ surface, dir }) =>
    walk(dir).map((file) => ({ surface, file }))
  );

  const rows = [];
  const buckets = {
    UPSTREAM_DIRECT: 0,
    IDENTICAL: 0,
    SIMILAR: 0,
    DIVERGED: 0,
    MDX_ONLY: 0,
    UPSTREAM_ONLY: 0,
    NO_MODEL: 0,
    NO_WRAPPER: 0,
  };

  for (const { surface, file } of mdxFiles) {
    const source = fs.readFileSync(file, "utf8");
    const pageModelId = extractPageModelId(source);
    const mdxDesc = extractWrappedDescription(source);
    const rel = path.relative(BUILDER_DOCS_ROOT, file);

    if (!pageModelId) {
      rows.push({ rel, surface, status: "NO_MODEL", mdxDesc, upstreamDesc: null, sim: null });
      buckets.NO_MODEL++;
      continue;
    }

    if (!mdxDesc) {
      if (hasRenderDescriptionProp(source)) {
        const model = modelById.get(pageModelId);
        const upstreamDesc = model?.info?.description || null;
        rows.push({ rel, surface, status: "UPSTREAM_DIRECT", mdxDesc: null, upstreamDesc, sim: null, pageModelId });
        buckets.UPSTREAM_DIRECT++;
      } else {
        rows.push({ rel, surface, status: "NO_WRAPPER", mdxDesc: null, upstreamDesc: null, sim: null });
        buckets.NO_WRAPPER++;
      }
      continue;
    }

    const model = modelById.get(pageModelId);
    const upstreamDesc = model?.info?.description || null;
    const status = classify(mdxDesc, upstreamDesc);
    const sim = mdxDesc && upstreamDesc ? trigramSimilarity(mdxDesc, upstreamDesc) : null;

    rows.push({ rel, surface, status, mdxDesc, upstreamDesc, sim, pageModelId });
    buckets[status]++;
  }

  for (const model of models) {
    if (!model.canonicalPath?.startsWith("/apis/")) continue;
    const matchedByAnyMdx = rows.some((r) => r.pageModelId === model.pageModelId);
    if (!matchedByAnyMdx) {
      rows.push({
        rel: `(no MDX) ${model.canonicalPath}`,
        surface: "?",
        status: "UPSTREAM_ONLY",
        mdxDesc: null,
        upstreamDesc: model.info?.description || null,
        sim: null,
        pageModelId: model.pageModelId,
      });
      buckets.UPSTREAM_ONLY++;
    }
  }

  const hasJson = process.argv.includes("--json");
  if (hasJson) {
    console.log(JSON.stringify({ rows, buckets }, null, 2));
    return;
  }

  console.log("Description Drift Audit");
  console.log("=======================\n");

  const pad = (s, n) => String(s).padEnd(n);
  const header = `${pad("Status", 16)} ${pad("Sim", 6)} ${pad("Surface", 12)} File`;
  console.log(header);
  console.log("-".repeat(header.length + 20));

  for (const row of rows) {
    const simStr = row.sim !== null ? (row.sim * 100).toFixed(0) + "%" : "—";
    console.log(`${pad(row.status, 16)} ${pad(simStr, 6)} ${pad(row.surface, 12)} ${row.rel}`);
  }

  console.log("");
  console.log("Summary:");
  for (const [status, count] of Object.entries(buckets)) {
    if (count > 0) {
      console.log(`  ${pad(status, 16)} ${count}`);
    }
  }
  console.log(`  ${"TOTAL".padEnd(16)} ${rows.length}`);

  if (buckets.UPSTREAM_ONLY > 0) {
    console.error(
      `\nERROR: ${buckets.UPSTREAM_ONLY} page model(s) have no corresponding MDX file.`
    );
    process.exit(1);
  }
}

run();
