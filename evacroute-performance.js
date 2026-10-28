"use strict";
let erCheckedRoadState = -1,
  erRoadSignature = null,
  erRoadGeneration = 0;
function erRoadAppearanceVersion() {
  if (erCheckedRoadState !== state.version) {
    erCheckedRoadState = state.version;
    const signature = Object.keys(state.changes)
      .filter((id) => state.changes[id].risk > 0)
      .map((id) => `${id}:${state.changes[id].risk}`)
      .join(",");
    if (signature !== erRoadSignature) {
      erRoadSignature = signature;
      erRoadGeneration++;
    }
  }
  return erRoadGeneration;
}

// One reusable raster while the camera moves, followed by an idle-time sharp redraw.
function erCreateMapLayerRenderer(mapImages, left, top, streetLabels, placeLabels) {
  let coarse = null,
    coarseKey = null,
    detail = null,
    timer = null,
    idle = null,
    lastKey = null;
  let fontGeneration = 0;
  const bounds = { minX: left, minY: top, maxX: left + 1440 * 6.8, maxY: top + 900 * 6.8 };
  for (const [x, y] of nodeXY) {
    bounds.minX = Math.min(bounds.minX, x - 100);
    bounds.maxX = Math.max(bounds.maxX, x + 100);
    bounds.minY = Math.min(bounds.minY, y - 100);
    bounds.maxY = Math.max(bounds.maxY, y + 100);
  }
  function paintWorld(c, scale, ready) {
    c.lineCap = "round";
    c.lineJoin = "round";
    c.setLineDash([]);
    const groups = roadPaint();
    c.strokeStyle = "#ffffff";
    for (const group of groups) {
      c.lineWidth = (group.major ? 3 : 1.2) / scale;
      c.stroke(group.path);
    }
    if (ready) for (const image of mapImages) c.drawImage(image, left, top, 1440 * 6.8, 900 * 6.8);
    for (const group of groups) {
      if (!group.risk) continue;
      c.strokeStyle = ["#ffffff", "#edbf00", "#e3641b", "#c8261d"][group.risk];
      c.lineWidth = 5 / scale;
      c.setLineDash(group.risk === 3 ? [5 / scale, 4 / scale] : []);
      c.stroke(group.path);
    }
    c.setLineDash([]);
    c.textAlign = "center";
    for (const [px, py, text, angle] of streetLabels) {
      c.save();
      c.translate(left + px * 6.8, top + py * 6.8);
      c.rotate(angle);
      c.font = `600 ${10 / scale}px 'Plus Jakarta Sans',sans-serif`;
      c.fillStyle = "#5e6673";
      c.fillText(text, 0, 0);
      c.restore();
    }
    c.font = `700 ${11 / scale}px 'Plus Jakarta Sans',sans-serif`;
    c.fillStyle = "#8a8f98";
    for (const [px, py, text] of placeLabels) c.fillText(text, left + px * 6.8, top + py * 6.8);
  }
  const dispose = (cache) => {
    if (cache) {
      cache.canvas.width = 0;
      cache.canvas.height = 0;
    }
  };
  function cancelRefinement() {
    clearTimeout(timer);
    if (idle !== null && window.cancelIdleCallback) cancelIdleCallback(idle);
    timer = idle = null;
  }
  function refine(ready, version) {
    idle = null;
    if (drag || version !== erRoadAppearanceVersion()) return;
    const margin = Math.min(160, Math.round(Math.min(width, height) * 0.2));
    const density = Math.min(devicePixelRatio || 1, 1.5, 2560 / (width + 2 * margin));
    const layer = document.createElement("canvas");
    layer.width = Math.ceil((width + 2 * margin) * density);
    layer.height = Math.ceil((height + 2 * margin) * density);
    const c = layer.getContext("2d", { alpha: false });
    c.fillStyle = "#eae6de";
    c.fillRect(0, 0, layer.width, layer.height);
    const snapshot = { scale: view.scale, x: view.x + margin, y: view.y + margin };
    c.setTransform(
      density * snapshot.scale,
      0,
      0,
      density * snapshot.scale,
      density * snapshot.x,
      density * snapshot.y,
    );
    paintWorld(c, snapshot.scale, ready);
    dispose(detail);
    detail = {
      canvas: layer,
      density,
      view: snapshot,
      key: `${version}:${ready}:${fontGeneration}`,
    };
    requestDraw();
  }
  document.fonts?.ready.then(() => {
    fontGeneration++;
    coarseKey = null;
    lastKey = null;
    requestDraw();
  });
  return function drawMapLayer(c) {
    const ready = mapImages.every((image) => image.complete && image.naturalWidth);
    const versionKey = `${erRoadAppearanceVersion()}:${ready}:${fontGeneration}`;
    if (coarseKey !== versionKey) {
      cancelRefinement();
      dispose(coarse);
      dispose(detail);
      detail = null;
      const limit = width <= 780 ? 2048 : 3072;
      const scale = limit / Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
      const layer = document.createElement("canvas");
      layer.width = Math.ceil((bounds.maxX - bounds.minX) * scale);
      layer.height = Math.ceil((bounds.maxY - bounds.minY) * scale);
      const l = layer.getContext("2d", { alpha: false });
      l.fillStyle = "#eae6de";
      l.fillRect(0, 0, layer.width, layer.height);
      l.setTransform(scale, 0, 0, scale, -bounds.minX * scale, -bounds.minY * scale);
      paintWorld(l, overview().scale, ready);
      coarse = {
        canvas: layer,
        density: 1,
        view: { x: -bounds.minX * scale, y: -bounds.minY * scale, scale },
      };
      coarseKey = versionKey;
    }
    let cache = coarse;
    if (detail?.key === versionKey) {
      const ratio = view.scale / detail.view.scale;
      const dx = view.x - detail.view.x * ratio,
        dy = view.y - detail.view.y * ratio;
      if (
        ratio >= 0.65 &&
        ratio <= 1.6 &&
        dx <= 0 &&
        dy <= 0 &&
        dx + (detail.canvas.width / detail.density) * ratio >= width &&
        dy + (detail.canvas.height / detail.density) * ratio >= height
      )
        cache = detail;
    }
    const ratio = view.scale / cache.view.scale;
    c.drawImage(
      cache.canvas,
      view.x - cache.view.x * ratio,
      view.y - cache.view.y * ratio,
      (cache.canvas.width / cache.density) * ratio,
      (cache.canvas.height / cache.density) * ratio,
    );
    const cameraKey = `${versionKey}:${width}:${height}:${view.x}:${view.y}:${view.scale}`;
    if (cameraKey !== lastKey) {
      lastKey = cameraKey;
      cancelRefinement();
      timer = setTimeout(() => {
        timer = null;
        if (window.requestIdleCallback)
          idle = requestIdleCallback(() => refine(ready, erRoadAppearanceVersion()), {
            timeout: 350,
          });
        else refine(ready, erRoadAppearanceVersion());
      }, 130);
    }
  };
}

// A small spatial grid replaces a complete network scan on each pointer movement.
function erInstallRoadIndex() {
  const cells = new Map(),
    cellSize = 200;
  for (let id = 0; id < roads.length; id++) {
    const [minX, minY, maxX, maxY] = roads[id].bounds;
    for (let x = Math.floor(minX / cellSize); x <= Math.floor(maxX / cellSize); x++) {
      for (let y = Math.floor(minY / cellSize); y <= Math.floor(maxY / cellSize); y++) {
        const key = `${x}:${y}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(id);
      }
    }
  }
  hitRoad = function (px, py) {
    const p = world([px, py]),
      radius = 8 / view.scale;
    let closest = null,
      best = radius;
    const visited = new Set();
    for (
      let x = Math.floor((p[0] - radius) / cellSize);
      x <= Math.floor((p[0] + radius) / cellSize);
      x++
    ) {
      for (
        let y = Math.floor((p[1] - radius) / cellSize);
        y <= Math.floor((p[1] + radius) / cellSize);
        y++
      ) {
        for (const id of cells.get(`${x}:${y}`) || []) {
          if (visited.has(id)) continue;
          visited.add(id);
          const road = roads[id],
            b = road.bounds;
          if (
            p[0] < b[0] - radius ||
            p[0] > b[2] + radius ||
            p[1] < b[1] - radius ||
            p[1] > b[3] + radius
          )
            continue;
          for (let k = 1; k < road.points.length; k++) {
            const distance = segmentDistance(p, road.points[k - 1], road.points[k]);
            if (distance < best) {
              best = distance;
              closest = road.ids[0];
            }
          }
        }
      }
    }
    return closest;
  };
}

function erCreateRoutingWorker() {
  let worker = null,
    readyPromise = null,
    nextId = 0;
  const pending = new Map();
  const unavailable = (message) => Object.assign(new Error(message), { workerUnavailable: true });
  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = new Promise((resolve, reject) => {
      try {
        if (typeof Worker === "undefined") throw unavailable("Web Worker tidak tersedia.");
        const workerCode =
          erGet("core").textContent + "\n(" + erRoutingWorkerMain.toString() + ")();";
        const url = URL.createObjectURL(new Blob([workerCode], { type: "text/javascript" }));
        try {
          worker = new Worker(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        worker.onmessage = ({ data }) => {
          if (data.type === "ready") {
            resolve();
            return;
          }
          const job = pending.get(data.id);
          if (!job) return;
          pending.delete(data.id);
          if (data.type === "result") job.resolve(data.result);
          else job.reject(new Error(data.error));
        };
        worker.onerror = (event) => {
          const error = unavailable(event.message || "Worker gagal dimulai.");
          reject(error);
          for (const job of pending.values()) job.reject(error);
          pending.clear();
          worker?.terminate();
          worker = null;
        };
        // Transfer numeric routing data only, not names and full road geometries.
        const coordinates = new Float64Array(DATA.nodes.length * 2);
        DATA.nodes.forEach((n, i) => {
          coordinates[i * 2] = n[1];
          coordinates[i * 2 + 1] = n[2];
        });
        const vertices = new Int32Array(DATA.edges.length * 2),
          lengths = new Float64Array(DATA.edges.length),
          access = new Uint8Array(DATA.edges.length);
        DATA.edges.forEach((e, i) => {
          vertices[i * 2] = e[0];
          vertices[i * 2 + 1] = e[1];
          lengths[i] = e[3];
          access[i] = e[8] === false ? 0 : 1;
        });
        worker.postMessage({ type: "init", coordinates, vertices, lengths, access }, [
          coordinates.buffer,
          vertices.buffer,
          lengths.buffer,
          access.buffer,
        ]);
      } catch (error) {
        reject(unavailable(error.message));
      }
    });
    return readyPromise;
  }
  return {
    ready,
    call(type, input) {
      if (!worker) return Promise.reject(unavailable("Worker tidak tersedia."));
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        worker.postMessage({ type, id, input });
      });
    },
    cancel() {
      for (const [id, job] of pending) {
        worker?.postMessage({ type: "cancel", id });
        job.reject(new Error("Penghitungan dibatalkan."));
      }
      pending.clear();
    },
  };
}

// Serialized into a Blob worker; it depends only on the existing core functions.
function erRoutingWorkerMain() {
  let data;
  const cancelled = new Set();
  const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
  self.onmessage = async ({ data: message }) => {
    if (message.type === "cancel") {
      cancelled.add(message.id);
      return;
    }
    if (message.type === "init") {
      const { coordinates, vertices, lengths, access } = message;
      data = {
        nodes: Array.from({ length: coordinates.length / 2 }, (_, i) => [
          i,
          coordinates[i * 2],
          coordinates[i * 2 + 1],
        ]),
        edges: Array.from({ length: lengths.length }, (_, i) => [
          vertices[i * 2],
          vertices[i * 2 + 1],
          0,
          lengths[i],
          null,
          null,
          0,
          "",
          !!access[i],
        ]),
      };
      self.postMessage({ type: "ready" });
      return;
    }
    const { id, input } = message;
    try {
      const started = performance.now();
      let result;
      if (message.type === "search") {
        const route = hybridSearch(data, input.changes, input.source, input.targets, input.mode);
        if (!route.found)
          throw Error("Tidak ada rute dalam batas risiko saat ini. Mode tidak dinaikkan otomatis.");
        const goal = input.targets.find((t) => t.id === route.shelter);
        const otherMode = input.mode === "safe" ? "emergency" : "safe";
        const other = hybridSearch(data, input.changes, input.source, [goal], otherMode);
        const destinations = [];
        for (const target of input.destinations) {
          if (target.id === route.shelter) continue;
          const alternative = hybridSearch(data, input.changes, input.source, [target], input.mode);
          if (alternative.found) destinations.push({ id: target.id, route: alternative });
        }
        destinations.sort((a, b) => a.route.seconds - b.route.seconds);
        result = { route, other, otherMode, destinations };
      } else if (message.type === "compare") {
        result = [];
        for (const [name, fn] of [
          [
            "Hybrid Dijkstra + A*",
            () =>
              hybridSearch(
                data,
                input.changes,
                input.source,
                [{ id: input.shelter, node: input.target }],
                input.mode,
              ),
          ],
          [
            "A* mandiri",
            () => standaloneAstar(data, input.changes, input.source, input.target, input.mode),
          ],
          [
            "Dijkstra mandiri",
            () => standaloneDijkstra(data, input.changes, input.source, input.target, input.mode),
          ],
        ]) {
          fn();
          const runs = [];
          for (let i = 0; i < 10; i++) {
            await pause();
            if (cancelled.has(id)) throw Error("Penghitungan dibatalkan.");
            runs.push(fn());
          }
          if (runs.some((r) => !r.found || Math.abs(r.seconds - input.expectedSeconds) > 1e-6))
            throw Error("Biaya algoritma pembanding tidak konsisten.");
          const r = runs[9],
            times = runs.map((r) => r.totalMs).sort((a, b) => a - b),
            meanMs = times.reduce((a, b) => a + b, 0) / 10;
          result.push({
            name,
            seconds: r.seconds,
            distance: r.distance,
            explored: r.dijkstraExplored
              ? r.dijkstraExplored.length + r.astarExplored.length
              : r.explored.length,
            meanMs,
            medianMs: (times[4] + times[5]) / 2,
            minMs: times[0],
            maxMs: times[9],
            sdMs: Math.sqrt(times.reduce((a, b) => a + (b - meanMs) ** 2, 0) / 10),
            prepMs: runs.reduce((a, b) => a + b.preprocessMs, 0) / 10,
            searchMs: runs.reduce((a, b) => a + (b.dijkstraMs ?? 0) + (b.astarMs ?? b.ms), 0) / 10,
            reverseMs: runs.reduce((a, b) => a + (b.dijkstraMs ?? 0), 0) / 10,
            forwardMs: runs.reduce((a, b) => a + (b.astarMs ?? b.ms), 0) / 10,
            repeats: 10,
            stats: r.reverseStats
              ? Object.fromEntries(
                  ["popped", "stale", "checked", "relaxed", "pushed"].map((k) => [
                    k,
                    r.reverseStats[k] + r.forwardStats[k],
                  ]),
                )
              : r.stats,
            peak: r.reverseStats
              ? Math.max(r.reverseStats.peak, r.forwardStats.peak)
              : r.stats.peak,
            trace: r.trace || [],
            reverseExplored: r.dijkstraExplored?.length ?? 0,
            forwardExplored: r.astarExplored?.length ?? r.explored.length,
          });
        }
      } else throw Error("Operasi worker tidak dikenal.");
      if (!cancelled.has(id))
        self.postMessage({
          type: "result",
          id,
          result: { value: result, workerMs: performance.now() - started },
        });
    } catch (error) {
      self.postMessage({ type: "error", id, error: error.message });
    } finally {
      cancelled.delete(id);
    }
  };
}

function erInstallPerformance() {
  erInstallRoadIndex();
  const originalPaint = roadPaint;
  let paintedGeneration = -1,
    paintedGroups = null;
  roadPaint = function () {
    const generation = erRoadAppearanceVersion();
    if (generation !== paintedGeneration) {
      paintedGeneration = generation;
      paintedGroups = originalPaint();
    }
    return paintedGroups;
  };
  const client = erCreateRoutingWorker(),
    originalSearch = search,
    originalCompare = compare,
    originalInvalidate = invalidate;
  const originalRoadDetails = renderRoadDetails,
    originalOpenDrawer = erOpenDrawer;
  let roadDetailsDirty = true;
  renderRoadDetails = function () {
    if (erGet("er-analysis").classList.contains("hidden")) {
      roadDetailsDirty = true;
      return;
    }
    originalRoadDetails();
    roadDetailsDirty = false;
  };
  erOpenDrawer = function (name) {
    originalOpenDrawer(name);
    if (name === "analysis" && roadDetailsDirty) renderRoadDetails();
  };
  invalidate = function (message) {
    client.cancel();
    originalInvalidate(message);
  };
  const diagnose = (operation, result, started) => {
    if (!new URLSearchParams(location.search).has("perf")) return;
    let output = erGet("er-compute-performance");
    if (!output) {
      output = document.createElement("output");
      output.id = "er-compute-performance";
      output.hidden = true;
      document.body.append(output);
    }
    output.textContent = JSON.stringify({
      engine: "worker",
      operation,
      workerMs: result.workerMs,
      totalMs: performance.now() - started,
    });
  };
  search = async function () {
    if (busy) return;
    invalidate();
    const job = token,
      version = state.version,
      started = performance.now();
    setBusy(true);
    notice("Mencari rute evakuasi…");
    try {
      const mission = erGet("mission").value,
        size = mission === "food" ? 1 : sizeInput(),
        mode = erGet("mode").value,
        source = origin;
      const targets = targetsFor(mission, size, erGet("target").value),
        destinations = targetsFor(mission, size, "auto");
      await client.ready();
      if (job !== token) return;
      const result = await client.call("search", {
        source,
        targets,
        destinations,
        mode,
        changes: state.changes,
      });
      if (job !== token || version !== state.version) return;
      const { route, other, otherMode, destinations: alternatives } = result.value;
      preview = {
        id: uuid(),
        version,
        signature: signature(),
        kind: "single",
        route,
        alternatives: { [mode]: route, [otherMode]: other },
        destinationAlternatives: alternatives,
        mode,
        mission,
        size,
        source,
        actions: [{ shelter: route.shelter, mission, size }],
        confirmed: false,
      };
      diagnose("search", result, started);
      renderResults();
      requestDraw();
      notice("Rute ditemukan. Tinjau hasil atau hitung perbandingan algoritma.");
    } catch (error) {
      if (job !== token) return;
      if (error.workerUnavailable) {
        setBusy(false);
        await originalSearch();
      } else notice(error.message, true);
    } finally {
      if (job === token) setBusy(false);
    }
  };
  compare = async function () {
    if (busy) return;
    if (preview?.kind !== "single" || preview.version !== state.version) {
      await search();
      if (preview?.kind !== "single") return;
    }
    const base = preview,
      job = token,
      version = state.version,
      started = performance.now(),
      source = base.source;
    const target = state.shelters[base.route.shelter].node,
      mode = base.mode,
      changes = clone(state.changes);
    setBusy(true);
    notice("Menghitung perbandingan · 10 pengukuran per metode…");
    try {
      await client.ready();
      if (job !== token) return;
      const result = await client.call("compare", {
        source,
        target,
        shelter: base.route.shelter,
        mode,
        changes,
        expectedSeconds: base.route.seconds,
      });
      if (job !== token || version !== state.version) return;
      let denied = 0,
        risky = 0,
        used = 0;
      DATA.edges.forEach((e, i) => {
        if (e[8] === false) denied++;
        else if (edgeState(DATA, i, changes).risk > (mode === "safe" ? 1 : 2)) risky++;
        else used++;
      });
      comparisonDetails = {
        source,
        target,
        mode,
        changes,
        denied,
        risky,
        used,
        vmax: Math.max(20, ...Object.values(changes).map((c) => c.speed ?? 20)) / 3.6,
        shelter: state.shelters[base.route.shelter].name,
        route: base.route,
      };
      comparison = result.value;
      diagnose("compare", result, started);
      renderResults();
      renderBenchmark();
      requestDraw();
      notice("Perbandingan selesai. Waktu perjalanan optimal ketiga metode sama.");
    } catch (error) {
      if (job !== token) return;
      if (error.workerUnavailable) {
        setBusy(false);
        await originalCompare();
      } else notice(error.message, true);
    } finally {
      if (job === token) setBusy(false);
    }
  };
  erGet("search").onclick = search;
  erGet("compare").onclick = compare;
}
