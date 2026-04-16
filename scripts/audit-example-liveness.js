#!/usr/bin/env node
/*
 * audit-example-liveness.js
 *
 * For every endpoint in generatedFastnearPageModels.json, fires the
 * first mainnet example against the live service and classifies the
 * response. Goal: find examples that return empty/pruned/errored data
 * so a builder clicking "Send request" sees something useful.
 *
 * Usage:
 *   node scripts/audit-example-liveness.js [--only=rpc|rest]
 *
 * Classes:
 *   OK         - non-empty, success-shaped payload
 *   EMPTY      - response is valid but contains no rows / null block / etc.
 *   ERROR      - JSON-RPC error, HTTP 4xx/5xx, or network failure
 *   SKIP       - signing-required, known to need side-effects
 */

const path = require("path");
const fs = require("fs");

const PAGE_MODELS = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../shared/generatedFastnearPageModels.json"),
    "utf8"
  )
);

const SKIP_IDS = new Set([
  // Require signed transaction bytes
  "rpc-send-tx",
  "rpc-broadcast-tx-async",
  "rpc-broadcast-tx-commit",
  // Acknowledged in rpc-example-config.js TRACKED_RPC_EXAMPLE_FOLLOWUPS as
  // awaiting a curated mainnet global-contract hash; re-enable once one exists.
  "rpc-view-global-contract-code",
]);

const ARGS = process.argv.slice(2);
const ONLY = (ARGS.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "";
const VERBOSE = ARGS.includes("--verbose");

async function postJson(url, body, attempt = 0) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  // Retry once on 5xx (mainnet indexers are flaky for wide scans).
  if (response.status >= 500 && attempt === 0) {
    await new Promise((r) => setTimeout(r, 800));
    return postJson(url, body, 1);
  }
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: response.status, text, json };
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    redirect: "follow",
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: response.status, text, json };
}

function resolveMainnetUrl(model, example) {
  const net = model.interaction.networks.find(
    (n) => n.key === (example?.network || "mainnet")
  );
  return net?.url || model.interaction.networks[0]?.url;
}

function substitutePath(template, pathParams) {
  if (!template) return "";
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = pathParams?.[k];
    return v !== undefined && v !== "" ? encodeURIComponent(String(v)) : `{${k}}`;
  });
}

// JSON-RPC methods whose success payload is `null` by design
const RPC_NULL_IS_OK = new Set(["rpc-health"]);

function classifyRpc(json, id) {
  if (!json) return { status: "ERROR", detail: "non-json" };
  if (json.error) return { status: "ERROR", detail: `rpc: ${json.error.cause?.name || json.error.name || json.error.message || "?"}` };
  const result = json.result;
  if (result === null || result === undefined) {
    return RPC_NULL_IS_OK.has(id)
      ? { status: "OK", detail: "null (expected)" }
      : { status: "EMPTY", detail: "null result" };
  }
  if (Array.isArray(result) && result.length === 0) return { status: "EMPTY", detail: "empty array" };
  if (typeof result === "object" && Object.keys(result).length === 0) return { status: "EMPTY", detail: "empty object" };
  return { status: "OK", detail: summarizeResult(result) };
}

function classifyRest(json, httpStatus) {
  if (httpStatus >= 400) return { status: "ERROR", detail: `http ${httpStatus}` };
  if (json === null || json === undefined) return { status: "EMPTY", detail: "null body" };
  if (Array.isArray(json)) {
    return json.length === 0
      ? { status: "EMPTY", detail: "empty array" }
      : { status: "OK", detail: `array[${json.length}]` };
  }
  if (typeof json === "object") {
    const keys = Object.keys(json);
    for (const k of keys) {
      const v = json[k];
      if (Array.isArray(v) && v.length === 0) {
        return { status: "EMPTY", detail: `empty ${k}` };
      }
    }
    if (keys.length === 0) return { status: "EMPTY", detail: "empty object" };
    return { status: "OK", detail: summarizeResult(json) };
  }
  return { status: "OK", detail: String(json).slice(0, 60) };
}

function summarizeResult(v) {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v === "object") {
    const keys = Object.keys(v).slice(0, 4);
    return `{${keys.join(",")}${Object.keys(v).length > 4 ? ",..." : ""}}`;
  }
  return String(v).slice(0, 60);
}

async function auditOne(model) {
  const surface = model.route?.transport === "json-rpc" ? "rpc" : "rest";
  if (ONLY && ONLY !== surface) return null;
  if (SKIP_IDS.has(model.pageModelId)) {
    return { id: model.pageModelId, surface, status: "SKIP", detail: "requires signed tx" };
  }
  const example =
    model.request?.examples?.find((e) => e.network === "mainnet") ||
    model.request?.examples?.[0];
  if (!example) {
    return { id: model.pageModelId, surface, status: "SKIP", detail: "no example" };
  }
  const baseUrl = resolveMainnetUrl(model, example);
  if (!baseUrl) {
    return { id: model.pageModelId, surface, status: "SKIP", detail: "no mainnet url" };
  }

  try {
    if (surface === "rpc") {
      const body = example.request?.body || {};
      const r = await postJson(baseUrl, body);
      if (r.status >= 400) return { id: model.pageModelId, surface, status: "ERROR", detail: `http ${r.status}` };
      return { id: model.pageModelId, surface, ...classifyRpc(r.json, model.pageModelId) };
    }
    // REST
    const pathTpl = model.route?.path || "";
    const pathParams = example.request?.path || {};
    const query = example.request?.query || {};
    const qs = Object.keys(query).length
      ? "?" + new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()
      : "";
    const url = baseUrl.replace(/\/$/, "") + substitutePath(pathTpl, pathParams) + qs;
    const method = (model.route?.method || "GET").toUpperCase();
    if (method === "GET") {
      const r = await getJson(url);
      return { id: model.pageModelId, surface, ...classifyRest(r.json, r.status) };
    }
    const r = await postJson(url, example.request?.body || {});
    return { id: model.pageModelId, surface, ...classifyRest(r.json, r.status) };
  } catch (e) {
    return { id: model.pageModelId, surface, status: "ERROR", detail: `throw: ${e.message || e}` };
  }
}

function pad(s, n) { s = String(s); return s + " ".repeat(Math.max(0, n - s.length)); }

(async () => {
  const results = [];
  for (const m of PAGE_MODELS) {
    const r = await auditOne(m);
    if (!r) continue;
    results.push(r);
    if (VERBOSE) console.error(r.status, r.id);
    // Gentle pacing to avoid rate limits
    await new Promise((rr) => setTimeout(rr, 350));
  }

  const by = { OK: [], EMPTY: [], ERROR: [], SKIP: [] };
  for (const r of results) by[r.status].push(r);

  console.log("\n=== SUMMARY ===");
  console.log("OK:    ", by.OK.length);
  console.log("EMPTY: ", by.EMPTY.length);
  console.log("ERROR: ", by.ERROR.length);
  console.log("SKIP:  ", by.SKIP.length);

  for (const cat of ["EMPTY", "ERROR"]) {
    if (by[cat].length === 0) continue;
    console.log(`\n=== ${cat} ===`);
    for (const r of by[cat].sort((a, b) => a.id.localeCompare(b.id))) {
      console.log(`  ${pad(r.surface, 4)} ${pad(r.id, 48)} ${r.detail}`);
    }
  }

  if (ARGS.includes("--all")) {
    console.log("\n=== OK (detail) ===");
    for (const r of by.OK.sort((a, b) => a.id.localeCompare(b.id))) {
      console.log(`  ${pad(r.surface, 4)} ${pad(r.id, 48)} ${r.detail}`);
    }
  }

  process.exit(by.ERROR.length + by.EMPTY.length > 0 ? 1 : 0);
})();
