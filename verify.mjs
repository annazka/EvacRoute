import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = await readFile(path.join(root, "EvacRoute.html"), "utf8");
const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
for (const [, attributes, code] of scripts) {
  if (!attributes.includes("application/json") && !attributes.includes("src=")) {
    new vm.Script(code);
  }
}
const ui = await readFile(path.join(root, "evacroute-ui.js"), "utf8");
new vm.Script(ui);
new vm.Script(await readFile(path.join(root, "evacroute-performance.js"), "utf8"));
const cameraContext = vm.createContext({});
vm.runInContext(
  ui.slice(ui.indexOf("function erRouteCamera("), ui.indexOf("function erInstallRouteCamera(")),
  cameraContext,
);
const fitCamera = cameraContext.erRouteCamera;
let cameraCases = 0;
for (const rectangle of [
  { left: 630, right: 1255, top: 176, bottom: 698 },
  { left: 630, right: 1735, top: 176, bottom: 743 },
  { left: 100, right: 290, top: 140, bottom: 380 },
]) {
  for (const points of [
    [
      [0, 0],
      [1200, 2100],
      [-300, 400],
    ],
    [
      [0, 0],
      [0, 2500],
    ],
    [
      [0, 0],
      [9000, 0],
    ],
    [[42, 42]],
    [
      [-10000, 10000],
      [10000, -10000],
    ],
  ]) {
    const camera = fitCamera(points, rectangle);
    assert.ok(camera.scale > 0 && camera.scale <= 2);
    for (const [x, y] of points) {
      const screenX = x * camera.scale + camera.x;
      const screenY = y * camera.scale + camera.y;
      assert.ok(screenX >= rectangle.left - 1e-6 && screenX <= rectangle.right + 1e-6);
      assert.ok(screenY >= rectangle.top - 1e-6 && screenY <= rectangle.bottom + 1e-6);
    }
    cameraCases++;
  }
}
assert.equal(fitCamera([], { left: 0, right: 100, top: 0, bottom: 100 }), null);
const data = JSON.parse(scripts.find((s) => s[1].includes('id="map-data"'))[2]);
const core = scripts.find((s) => s[1].includes('id="core"'))[2];
const context = vm.createContext({ performance, module: { exports: {} } });
vm.runInContext(core, context);
const api = context.module.exports;
for (const density of [0, 0.02, 0.05, 0.1]) {
  const { summary } = api.randomRoadConditions(data, {}, density, 12345);
  assert.equal(summary.affected, Math.round(summary.totalRoads * density));
  assert.equal(summary.light + summary.heavy + summary.closed, summary.affected);
}
const cleared = api.randomRoadConditions(data, { 0: { risk: 3, speed: 10 } }, 0, 12345);
assert.equal(cleared.summary.affected, 0);
assert.ok(Object.values(cleared.changes).every((change) => change.risk === 0));
assert.equal(cleared.changes[0].speed, 10);
let scenarios = 0;
for (const density of [0, 0.15]) {
  const changes = density ? api.randomRoadConditions(data, {}, density, 12345).changes : {};
  for (const mode of ["safe", "emergency"]) {
    for (const shelter of data.shelters) {
      const hybrid = api.hybridSearch(
        data,
        changes,
        data.origin,
        [{ id: 0, node: shelter.node }],
        mode,
      );
      const astar = api.standaloneAstar(data, changes, data.origin, shelter.node, mode);
      const dijkstra = api.standaloneDijkstra(data, changes, data.origin, shelter.node, mode);
      assert.equal(hybrid.found, astar.found);
      assert.equal(hybrid.found, dijkstra.found);
      if (hybrid.found) {
        assert.ok(Math.abs(hybrid.seconds - astar.seconds) < 1e-6);
        assert.ok(Math.abs(hybrid.seconds - dijkstra.seconds) < 1e-6);
        assert.ok(hybrid.reverseStats.checked >= hybrid.dijkstraExplored.length - 1);
      }
      for (const route of [astar, dijkstra]) {
        assert.equal(route.stats.pushed, route.stats.relaxed + 1);
        assert.equal(route.stats.popped, route.stats.stale + route.explored.length);
        assert.ok(route.trace.every((t) => Math.abs(t.g + t.h - t.f) < 1e-8));
      }
      scenarios++;
    }
  }
}
assert.equal(
  api.shelterEligible(
    { active: true, medical: false, capacity: 20, occupants: 12, overload: 2 },
    "critical",
    2,
  ),
  false,
);
assert.equal(
  api.shelterEligible(
    { active: true, medical: true, capacity: 25, occupants: 25, overload: 2 },
    "critical",
    2,
  ),
  true,
);
assert.equal(
  api.shelterEligible(
    { active: true, medical: true, capacity: 25, occupants: 25, overload: 2 },
    "normal",
    2,
  ),
  false,
);
let assets = 0;
for (const file of await readdir(path.join(root, "assets/figma"))) {
  if (!file.endsWith(".svg")) continue;
  const location = path.join(root, "assets/figma", file);
  assert.ok((await stat(location)).size > 0);
  const svg = await readFile(location, "utf8");
  const header = svg.match(/<svg[^>]+>/)[0];
  assert.match(header, /width="\d+"/);
  assert.match(header, /height="\d+"/);
  assets++;
}
const standalone = await readFile(path.join(root, "EvacRoute_Standalone.html"), "utf8");
for (const [, attrs, code] of standalone.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (!attrs.includes("application/json")) new vm.Script(code);
}
assert.ok(!standalone.includes("https://www.figma.com/api/mcp/asset/"));
assert.ok(!standalone.includes('src="evacroute-ui.js"'));
assert.ok(!standalone.includes('src="evacroute-performance.js"'));
assert.ok(!standalone.includes('href="evacroute.css"'));
const standaloneData = JSON.parse(
  [...standalone.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].find((s) =>
    s[1].includes('id="map-data"'),
  )[2],
);
assert.deepEqual(standaloneData, data);
const result = {
  routeCameraCases: cameraCases,
  syntax: "valid",
  routingScenarios: scenarios,
  algorithmCosts: "equal",
  shelterEligibility: "passed",
  localSvgAssets: assets,
  standaloneData: "unchanged",
};
await writeFile(path.join(root, "verification.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
