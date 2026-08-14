#!/usr/bin/env node
// Import-cycle guard (T1, docs/regression-test-plan.md). Runs as a standalone
// Node script rather than a Karma/Jasmine spec because it needs `fs` to walk
// src/**/*.ts, which isn't available in the browser context ng test runs in.
//
// Builds the relative-import graph over src/**/*.ts (excluding *.spec.ts),
// finds strongly connected components with Tarjan's algorithm, and fails if any
// component has more than one file — that's an import cycle, the root cause of
// D1's runtime NG0919 (Angular reading a component's metadata while the module
// graph is still partially initialised).
//
// Usage: node scripts/check-import-cycles.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(__dirname, "../src");

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+(?:[^'"]*?\sfrom\s*)?["']([^"']+)["']/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts") && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith(".")) return undefined; // package import, not part of src's own graph
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
  ];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

function buildGraph(files) {
  const graph = new Map(files.map((f) => [f, new Set()]));
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT_RE)) {
      const resolved = resolveSpecifier(file, match[1]);
      if (resolved && graph.has(resolved) && resolved !== file) {
        graph.get(file).add(resolved);
      }
    }
  }
  return graph;
}

// Tarjan's strongly connected components algorithm.
function findSCCs(graph) {
  let index = 0;
  const indices = new Map();
  const lowlink = new Map();
  const onStack = new Set();
  const stack = [];
  const sccs = [];

  function strongconnect(v) {
    indices.set(v, index);
    lowlink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of graph.get(v)) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v), lowlink.get(w)));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v), indices.get(w)));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      sccs.push(scc);
    }
  }

  for (const v of graph.keys()) {
    if (!indices.has(v)) strongconnect(v);
  }
  return sccs;
}

// Within a cyclic SCC every node can reach every other node, so a DFS from any
// one node back to itself, staying inside the SCC, finds a real cycle to print.
function findCycleChain(graph, scc) {
  const sccSet = new Set(scc);
  const start = scc[0];
  const path = [start];
  const visited = new Set([start]);

  function dfs(node) {
    for (const next of graph.get(node)) {
      if (!sccSet.has(next)) continue;
      if (next === start) {
        path.push(next);
        return true;
      }
      if (visited.has(next)) continue;
      visited.add(next);
      path.push(next);
      if (dfs(next)) return true;
      path.pop();
    }
    return false;
  }

  dfs(start);
  return path;
}

function main() {
  const files = walk(SRC_ROOT);
  const graph = buildGraph(files);
  const sccs = findSCCs(graph).filter((scc) => scc.length > 1);

  if (sccs.length === 0) {
    console.log(`No import cycles found (${files.length} files scanned).`);
    return;
  }

  console.error(`Found ${sccs.length} import cycle(s):\n`);
  for (const scc of sccs) {
    const chain = findCycleChain(graph, scc).map((f) => relative(SRC_ROOT, f));
    console.error(`  ${chain.join("\n    -> ")}\n`);
  }
  process.exitCode = 1;
}

main();
