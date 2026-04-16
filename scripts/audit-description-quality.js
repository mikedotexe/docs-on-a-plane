#!/usr/bin/env node
//
// audit-description-quality.js
//
// Complements audit-description-drift.js (which checks agreement across layers).
// This one checks the QUALITY of info.description on every entry in
// shared/generatedFastnearPageModels.json — coverage, boilerplate, length,
// duplicates, style.
//
// Default mode: warnings-only (exit 0). Ship it, see what's in the backlog,
// then land a clean-up PR and rerun with --strict to harden the gate.
//
// Flags:
//   --strict    hard-fail (exit 1) on any R1–R8 failure
//   --report    emit Markdown grouped by rule; good for tracking-doc triage
//   --json      emit machine-readable output
//   --help, -h

const fs = require("node:fs");
const path = require("node:path");

const PAGE_MODELS_PATH = path.resolve(
  __dirname,
  "../shared/generatedFastnearPageModels.json"
);

const ARGS = process.argv.slice(2);
if (ARGS.includes("--help") || ARGS.includes("-h")) {
  console.log(helpText());
  process.exit(0);
}
const STRICT = ARGS.includes("--strict");
const REPORT = ARGS.includes("--report");
const JSON_OUT = ARGS.includes("--json");

// Rule configuration ---------------------------------------------------------

const MIN_LENGTH = 50;
const MAX_LENGTH = 240;

const BOILERPLATE_PREFIXES = [
  /^this\s+(operation|endpoint|method|call|api)\b/i,
];

const BOILERPLATE_PATTERNS = [
  /\baccepts? a json-rpc body\b/i,
  /\b(post|get|put|delete|patch)\s+to\s+\//i,
  /\bhttp (request|method|call)\b/i,
  /\brequired request inputs\b/i,
  /\baccepts? an? (json|http) (request|body)\b/i,
];

const ACTIVE_VERB_ALLOWLIST = new Set(
  [
    "Fetch", "Fetches", "Get", "Gets", "Submit", "Submits", "Query", "Queries",
    "Return", "Returns", "List", "Lists", "Check", "Checks", "Show", "Shows",
    "Describe", "Describes", "Retrieve", "Retrieves", "Broadcast", "Broadcasts",
    "Send", "Sends", "Inspect", "Inspects", "Observe", "Observes", "Resolve",
    "Resolves", "Call", "Calls", "Count", "Counts", "Watch", "Watches",
    "Stream", "Streams", "Subscribe", "View", "Views", "Look", "Read", "Reads",
    "Report", "Reports", "Summarize", "Validate", "Validates", "Redirect",
    "Redirects", "Scan", "Scans", "Load", "Loads", "Emit", "Emits", "Post",
    "Posts", "Ping", "Pings", "Store", "Stores", "Update", "Updates", "Refresh",
    "Refreshes", "Verify", "Verifies", "Track", "Tracks", "Index", "Indexes",
    "Invoke", "Invokes", "Measure", "Measures", "Find", "Finds", "Advance",
    "Advances", "Compute", "Computes", "Discover", "Discovers", "Match",
    "Matches", "Trace", "Traces", "Compare", "Compares", "Diff", "Diffs",
    "Walk", "Walks", "Select", "Selects", "Pull", "Pulls", "Decode", "Decodes",
    "Encode", "Encodes", "Resolve", "Resolves", "Reveal", "Reveals",
  ].map((w) => w.toLowerCase())
);

const CAPS_ALLOWLIST = new Set([
  "JSON", "RPC", "NEAR", "FT", "NFT", "API", "ID", "HTTP", "HTTPS", "REST",
  "URL", "WASM", "JWT", "KV", "IPFS", "UTC", "TLS", "IPv4", "IPv6", "CORS",
  "DNS", "UUID", "POST", "GET", "PUT", "DELETE", "PATCH", "TCP", "UDP",
  "SHA", "SHA256", "SHA-256", "ED25519", "SECP256K1", "TCP/IP", "I/O", "CPU",
  "GPU", "RAM", "JSON-RPC", "XFF", "CIDR", "gRPC", "EXPERIMENTAL", "V0", "V1",
  "V2", "V3", "ABI", "CLI", "SDK", "DAO", "DEX", "IPC", "GRPC", "SQL", "ORM",
]);

const CAPS_TOKEN_RE = /\b[A-Z][A-Z0-9]{2,}\b/g;

const NEAR_DUPE_THRESHOLD = 0.85;

// Helpers --------------------------------------------------------------------

function normalize(text) {
  return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function trigramSet(text) {
  const norm = normalize(text);
  const out = new Set();
  for (let i = 0; i <= norm.length - 3; i += 1) {
    out.add(norm.slice(i, i + 3));
  }
  return out;
}

function trigramSimilarity(a, b) {
  const setA = trigramSet(a);
  const setB = trigramSet(b);
  if (!setA.size && !setB.size) return 1;
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection += 1;
  return intersection / Math.max(setA.size, setB.size);
}

function firstWord(text) {
  const m = String(text || "").trim().match(/^([A-Za-z][A-Za-z'-]*)/);
  return m ? m[1] : "";
}

// Rule checks ----------------------------------------------------------------

function checkEntry(entry) {
  const failures = [];
  const warnings = [];
  const desc = entry.info?.description ?? "";
  const summary = entry.info?.summary ?? "";
  const operationId = entry.info?.operationId ?? "";
  const method = entry.interaction?.requestMethod ?? "";

  // R1 — present and non-empty
  if (!desc || !desc.trim()) {
    failures.push({ rule: "R1", message: "description is missing or empty" });
    return { failures, warnings };
  }

  // R2 — minimum length
  if (desc.trim().length < MIN_LENGTH) {
    failures.push({
      rule: "R2",
      message: `description is ${desc.trim().length} chars (< ${MIN_LENGTH})`,
    });
  }

  // R3 — maximum length
  if (desc.trim().length > MAX_LENGTH) {
    failures.push({
      rule: "R3",
      message: `description is ${desc.trim().length} chars (> ${MAX_LENGTH})`,
    });
  }

  // R4 — description != summary
  if (summary && normalize(desc) === normalize(summary)) {
    failures.push({
      rule: "R4",
      message: "description is identical to summary (restatement)",
    });
  }

  // R5 — boilerplate prefixes
  for (const re of BOILERPLATE_PREFIXES) {
    if (re.test(desc.trim())) {
      failures.push({ rule: "R5", message: `starts with boilerplate phrase ${re}` });
      break;
    }
  }

  // R6 — transport-mechanics boilerplate
  for (const re of BOILERPLATE_PATTERNS) {
    if (re.test(desc)) {
      failures.push({ rule: "R6", message: `contains transport boilerplate ${re}` });
      break;
    }
  }

  // R7 — starts with operation id / method name
  const opTokens = [operationId, method].filter(Boolean).map((s) => s.toLowerCase());
  const descStart = normalize(desc);
  for (const tok of opTokens) {
    if (!tok) continue;
    if (descStart.startsWith(tok + " ")) {
      failures.push({
        rule: "R7",
        message: `starts with operation/method name: "${tok}"`,
      });
      break;
    }
  }

  // S1 — active-verb allowlist (warn)
  const fw = firstWord(desc);
  if (fw && !ACTIVE_VERB_ALLOWLIST.has(fw.toLowerCase())) {
    warnings.push({
      rule: "S1",
      message: `first word "${fw}" not in active-verb allowlist`,
    });
  }

  // S2 — ending period (warn)
  if (!/[.!?]$/.test(desc.trim())) {
    warnings.push({ rule: "S2", message: "does not end with sentence punctuation" });
  }

  // S3 — stray ALL-CAPS (warn)
  const stray = [];
  const trimmed = desc.replace(/`[^`]+`/g, "");
  for (const m of trimmed.matchAll(CAPS_TOKEN_RE)) {
    const tok = m[0];
    if (!CAPS_ALLOWLIST.has(tok)) stray.push(tok);
  }
  if (stray.length) {
    warnings.push({
      rule: "S3",
      message: `stray ALL-CAPS tokens: ${[...new Set(stray)].join(", ")}`,
    });
  }

  return { failures, warnings };
}

function run() {
  const models = JSON.parse(fs.readFileSync(PAGE_MODELS_PATH, "utf8"));
  const entries = models.filter((m) => m.pageModelId);

  const perEntry = entries.map((m) => ({
    pageModelId: m.pageModelId,
    canonicalPath: m.canonicalPath,
    description: m.info?.description ?? "",
    ...checkEntry(m),
  }));

  // R8 — exact duplicates
  const byDesc = new Map();
  for (const e of perEntry) {
    const key = normalize(e.description);
    if (!key) continue;
    if (!byDesc.has(key)) byDesc.set(key, []);
    byDesc.get(key).push(e);
  }
  for (const [, group] of byDesc) {
    if (group.length <= 1) continue;
    const ids = group.map((g) => g.pageModelId);
    for (const e of group) {
      e.failures.push({
        rule: "R8",
        message: `duplicate description shared with: ${ids.filter((i) => i !== e.pageModelId).join(", ")}`,
      });
    }
  }

  // W1 — near-duplicates (trigram ≥ threshold)
  for (let i = 0; i < perEntry.length; i += 1) {
    for (let j = i + 1; j < perEntry.length; j += 1) {
      const a = perEntry[i];
      const b = perEntry[j];
      if (!a.description || !b.description) continue;
      if (normalize(a.description) === normalize(b.description)) continue; // already R8
      const sim = trigramSimilarity(a.description, b.description);
      if (sim >= NEAR_DUPE_THRESHOLD) {
        a.warnings.push({
          rule: "W1",
          message: `near-duplicate (sim ${(sim * 100).toFixed(0)}%) of ${b.pageModelId}`,
        });
        b.warnings.push({
          rule: "W1",
          message: `near-duplicate (sim ${(sim * 100).toFixed(0)}%) of ${a.pageModelId}`,
        });
      }
    }
  }

  // Summarize
  const failureCounts = {};
  const warningCounts = {};
  let failingEntries = 0;
  let warningEntries = 0;
  for (const e of perEntry) {
    if (e.failures.length) failingEntries += 1;
    if (e.warnings.length) warningEntries += 1;
    for (const f of e.failures) failureCounts[f.rule] = (failureCounts[f.rule] || 0) + 1;
    for (const w of e.warnings) warningCounts[w.rule] = (warningCounts[w.rule] || 0) + 1;
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ perEntry, failureCounts, warningCounts }, null, 2));
    process.exit(!STRICT || failingEntries === 0 ? 0 : 1);
  }

  if (REPORT) {
    emitReport(perEntry, { failureCounts, warningCounts, failingEntries, warningEntries });
  } else {
    emitTerse(perEntry, { failureCounts, warningCounts, failingEntries, warningEntries });
  }

  if (STRICT && failingEntries > 0) process.exit(1);
  process.exit(0);
}

function emitTerse(perEntry, totals) {
  console.log("Description Quality Audit");
  console.log("=========================\n");
  console.log(`Total entries: ${perEntry.length}`);
  console.log(`Failing hard rules (R1–R8): ${totals.failingEntries}`);
  console.log(`Style warnings (W1, S1–S3): ${totals.warningEntries}`);
  if (Object.keys(totals.failureCounts).length) {
    console.log("\nHard-rule hits:");
    for (const [rule, n] of Object.entries(totals.failureCounts).sort()) {
      console.log(`  ${rule}: ${n}`);
    }
  }
  if (Object.keys(totals.warningCounts).length) {
    console.log("\nWarning hits:");
    for (const [rule, n] of Object.entries(totals.warningCounts).sort()) {
      console.log(`  ${rule}: ${n}`);
    }
  }

  const troubles = perEntry.filter((e) => e.failures.length || e.warnings.length);
  if (troubles.length) {
    console.log("\nDetails:");
    for (const e of troubles) {
      console.log(`\n  ${e.pageModelId}   (${e.canonicalPath ?? "-"})`);
      console.log(`    ${truncate(e.description, 90)}`);
      for (const f of e.failures) console.log(`    ✗ ${f.rule}: ${f.message}`);
      for (const w of e.warnings) console.log(`    · ${w.rule}: ${w.message}`);
    }
  }

  if (!STRICT && totals.failingEntries > 0) {
    console.log(
      `\nℹ  Running in warnings-only mode. Add --strict to fail CI on hard-rule hits.`
    );
  }
}

function emitReport(perEntry, totals) {
  const lines = [];
  lines.push("# Description quality report");
  lines.push("");
  lines.push(`- Total entries: **${perEntry.length}**`);
  lines.push(`- Entries failing hard rules: **${totals.failingEntries}**`);
  lines.push(`- Entries with warnings: **${totals.warningEntries}**`);
  lines.push("");

  const byRule = new Map();
  for (const e of perEntry) {
    for (const f of e.failures) {
      if (!byRule.has(f.rule)) byRule.set(f.rule, []);
      byRule.get(f.rule).push({ ...e, hit: f });
    }
    for (const w of e.warnings) {
      if (!byRule.has(w.rule)) byRule.set(w.rule, []);
      byRule.get(w.rule).push({ ...e, hit: w });
    }
  }

  for (const rule of [...byRule.keys()].sort()) {
    const group = byRule.get(rule);
    lines.push(`## ${rule} — ${group.length} hit${group.length === 1 ? "" : "s"}`);
    lines.push("");
    for (const g of group) {
      lines.push(`- \`${g.pageModelId}\` — ${g.hit.message}`);
      lines.push(`  > ${truncate(g.description, 140)}`);
    }
    lines.push("");
  }

  console.log(lines.join("\n"));
}

function truncate(s, n) {
  const str = String(s || "");
  return str.length <= n ? str : str.slice(0, n - 1) + "…";
}

function helpText() {
  return `
audit-description-quality.js — check info.description quality on every page model.

Default: warnings-only (exit 0). Surfaces the backlog without blocking CI.

Flags:
  --strict    exit 1 on R1–R8 failures
  --report    emit Markdown report grouped by rule
  --json      emit machine-readable output
  --help, -h

Hard rules:
  R1  description present, non-empty
  R2  ≥ ${MIN_LENGTH} chars
  R3  ≤ ${MAX_LENGTH} chars
  R4  ≠ summary
  R5  does not start with "This operation/endpoint/method/call/api"
  R6  no transport-mechanics boilerplate
  R7  does not start with operation ID or method name
  R8  no exact duplicate of another entry's description

Warnings:
  W1  trigram similarity ≥ ${NEAR_DUPE_THRESHOLD} with another entry
  S1  first word in active-verb allowlist
  S2  ends with sentence punctuation
  S3  no stray ALL-CAPS tokens outside allowlist
`.trim();
}

run();
