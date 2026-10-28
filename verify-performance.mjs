import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = await readFile(path.join(root, "EvacRoute.html"), "utf8");
const optimized = await readFile(path.join(root, "evacroute-performance.js"), "utf8");
const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
const data = JSON.parse(scripts.find((s) => s[1].includes('id="map-data"'))[2]);
const core = scripts.find((s) => s[1].includes('id="core"'))[2];
const math = vm.createContext({ performance, module: { exports: {} } });
vm.runInContext(core, math);
const api = math.module.exports;
const workerFunction = optimized.slice(
  optimized.indexOf("function erRoutingWorkerMain()"),
  optimized.indexOf("function erInstallPerformance()"),
);
const bridge = `const { parentPort } = require('node:worker_threads');
globalThis.self = { postMessage: value => parentPort.postMessage(value) };
${workerFunction}
erRoutingWorkerMain();
parentPort.on('message',data=>self.onmessage({data}));`;
const worker = new Worker(core + "\n" + bridge, { eval: true });
const pending = new Map();
worker.on("message", (message) => {
  const key = message.type === "ready" ? "ready" : message.id;
  if (!pending.has(key)) return;
  const { resolve, reject } = pending.get(key);
  pending.delete(key);
  if (message.type === "error") reject(new Error(message.error));
  else resolve(message.result);
});
worker.on("error", (error) => {
  for (const job of pending.values()) job.reject(error);
  pending.clear();
});
const waitFor = (key) => new Promise((resolve, reject) => pending.set(key, { resolve, reject }));
let id = 0;
const call = (type, input) => {
  const job = ++id,
    promise = waitFor(job);
  worker.postMessage({ type, id: job, input });
  return promise;
};
const coordinates = new Float64Array(data.nodes.length * 2),
  vertices = new Int32Array(data.edges.length * 2),
  lengths = new Float64Array(data.edges.length),
  access = new Uint8Array(data.edges.length);
data.nodes.forEach((n, i) => {
  coordinates[i * 2] = n[1];
  coordinates[i * 2 + 1] = n[2];
});
data.edges.forEach((e, i) => {
  vertices[i * 2] = e[0];
  vertices[i * 2 + 1] = e[1];
  lengths[i] = e[3];
  access[i] = e[8] === false ? 0 : 1;
});
const ready = waitFor("ready");
worker.postMessage({ type: "init", coordinates, vertices, lengths, access }, [
  coordinates.buffer,
  vertices.buffer,
  lengths.buffer,
  access.buffer,
]);
await ready;
let workerScenarios = 0,
  benchmarkRuns = 0;
try {
  const targets = data.shelters.map((s, id) => ({ id, node: s.node }));
  for (const density of [0, 0.15]) {
    const changes = density ? api.randomRoadConditions(data, {}, density, 12345).changes : {};
    for (const mode of ["safe", "emergency"]) {
      const expected = api.hybridSearch(data, changes, data.origin, targets, mode);
      const { value } = await call("search", {
        source: data.origin,
        targets,
        destinations: targets,
        mode,
        changes,
      });
      assert.equal(value.route.found, expected.found);
      assert.equal(value.route.shelter, expected.shelter);
      assert.ok(Math.abs(value.route.seconds - expected.seconds) < 1e-6);
      assert.deepEqual(value.route.edges, JSON.parse(JSON.stringify(expected.edges)));
      for (const alternative of value.destinations) {
        const route = api.hybridSearch(data, changes, data.origin, [targets[alternative.id]], mode);
        assert.ok(Math.abs(route.seconds - alternative.route.seconds) < 1e-6);
      }
      workerScenarios++;
    }
  }
  const reference = api.hybridSearch(data, {}, data.origin, [targets[0]], "safe");
  const { value: comparison } = await call("compare", {
    source: data.origin,
    target: targets[0].node,
    shelter: 0,
    mode: "safe",
    changes: {},
    expectedSeconds: reference.seconds,
  });
  assert.equal(comparison.length, 3);
  for (const row of comparison) {
    assert.equal(row.repeats, 10);
    benchmarkRuns += row.repeats;
    assert.ok(Math.abs(row.seconds - reference.seconds) < 1e-6);
    assert.ok(Number.isFinite(row.meanMs) && row.meanMs >= 0);
  }
  assert.equal(
    comparison[0].stats.checked,
    reference.reverseStats.checked + reference.forwardStats.checked,
  );
  const cancelledId = ++id,
    promise = waitFor(cancelledId);
  worker.postMessage({
    type: "compare",
    id: cancelledId,
    input: {
      source: data.origin,
      target: targets[0].node,
      shelter: 0,
      mode: "safe",
      changes: {},
      expectedSeconds: reference.seconds,
    },
  });
  worker.postMessage({ type: "cancel", id: cancelledId });
  await assert.rejects(promise, /dibatalkan/);
} finally {
  await worker.terminate();
}

// The spatial index must return a truly nearest road, including boundary cells.
const lat = data.metadata.center[0],
  lon = data.metadata.center[1],
  m = 111195.08,
  cos = Math.cos((lat * Math.PI) / 180);
const project = (latitude, longitude) => [(longitude - lon) * m * cos, (lat - latitude) * m];
const roads = [],
  physical = new Set();
data.edges.forEach((e, id) => {
  const key = [Math.min(e[0], e[1]), Math.max(e[0], e[1]), e[6]].join(":");
  if (physical.has(key)) return;
  physical.add(key);
  const points = e[4].map((p) => project(...p)),
    xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  roads.push({
    ids: [id],
    points,
    bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
  });
});
const app = scripts
  .filter((s) => !s[1].includes("application/json") && !s[1].includes("src="))
  .find((s) => s[2].includes("const DATA"))[2];
const segment = app.slice(
  app.indexOf("function segmentDistance("),
  app.indexOf("function hitRoad("),
);
const brute = app.slice(app.indexOf("function hitRoad("), app.indexOf("function zoom("));
const index = optimized.slice(
  optimized.indexOf("function erInstallRoadIndex("),
  optimized.indexOf("function erCreateRoutingWorker("),
);
const hitContext = vm.createContext({ roads, world: (p) => p, view: { scale: 0.15 } });
vm.runInContext(segment + "\n" + brute, hitContext);
const originalHit = hitContext.hitRoad;
vm.runInContext(index + "\nerInstallRoadIndex();", hitContext);
const acceleratedHit = hitContext.hitRoad;
const probes = [];
for (let i = 0; i < 60; i++) {
  const road = roads[Math.floor((i * (roads.length - 1)) / 59)],
    a = road.points[0],
    b = road.points[1];
  probes.push([(a[0] + b[0]) / 2 + 3, (a[1] + b[1]) / 2 - 2]);
}
probes.push([99999, 99999], [-99999, -99999], [0, 0], [200, -200]);
const lookup = new Map(roads.map((r) => [r.ids[0], r]));
function distance(id, p) {
  if (id === null) return Infinity;
  const points = lookup.get(id).points;
  let best = Infinity;
  for (let i = 1; i < points.length; i++)
    best = Math.min(best, hitContext.segmentDistance(p, points[i - 1], points[i]));
  return best;
}
for (const p of probes) {
  const expected = originalHit(...p),
    actual = acceleratedHit(...p);
  assert.equal(actual === null, expected === null);
  if (actual !== null) assert.ok(Math.abs(distance(actual, p) - distance(expected, p)) < 1e-8);
}
const fallbackCode = optimized.slice(
  optimized.indexOf("function erCreateRoutingWorker("),
  optimized.indexOf("function erRoutingWorkerMain("),
);
const fallback = vm.createContext({});
vm.runInContext(fallbackCode, fallback);
await assert.rejects(
  fallback.erCreateRoutingWorker().ready(),
  (error) => error.workerUnavailable === true,
);
const report = {
  workerScenarios,
  workerBenchmarkRuns: benchmarkRuns,
  workerCancellation: "passed",
  workerFallback: "passed",
  nearestRoadProbes: probes.length,
  workerRouteEdges: "identical",
};
await writeFile(
  path.join(root, "verification-performance.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
