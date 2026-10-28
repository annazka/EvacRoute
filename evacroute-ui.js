/* Figma interface adapter. Routing and simulation continue to use the existing core. */
"use strict";
const erAsset = (name, width, height, alt = "") =>
  `<img src="assets/figma/${name}.svg" width="${width}" height="${height}" alt="${alt}" draggable="false">`;
const erGet = (id) => document.getElementById(id);
let erToastTimer,
  erLastFocus,
  erResultId = null,
  erAlternatives = [];

function erMount() {
  document.body.classList.add("evacroute");
  const old = erGet("dashboard");
  old.id = "legacy-dashboard";
  old.classList.add("er-offscreen");
  document.querySelector(".topbar").classList.add("er-offscreen");
  document.querySelector(".statusbar").classList.add("er-offscreen");
  const saved = Object.fromEntries(
    [
      "map",
      "size",
      "pick-origin-input",
      "search",
      "confirm",
      "zoom-in",
      "zoom-out",
      "fit",
      "notice",
      "advanced-settings",
    ].map((id) => [id, erGet(id)]),
  );
  const app = document.createElement("main");
  app.id = "dashboard";
  app.className = "er-workspace";
  app.innerHTML = `
    <section class="map-card" aria-label="Peta evakuasi"><div class="busy-indicator"></div>
      <div class="canvas-wrap"><div data-er-slot="map"></div><div class="er-markers" id="er-markers"></div><div id="er-hover-slot"></div></div>
      <div class="er-alert"><span class="er-alert-icon">${erAsset("imgFrame3", 16, 16)}</span><div><strong>Siaga banjir · Kelapa Gading & Sunter</strong><p id="er-road-count">Kondisi jalan simulasi</p></div><button class="er-link" data-er-open="analysis">Detail</button></div>
      <div class="er-account"><button class="er-account-button" type="button" disabled aria-disabled="true" title="Profil belum tersedia"><span class="er-avatar">ER</span><span><strong>Relawan EvacRoute</strong><small>Posko Kelapa Gading · Mode latihan</small></span></button></div>
      <div class="er-map-controls"><div class="er-zoom-group"><span data-er-slot="zoom-in"></span><span data-er-slot="zoom-out"></span></div><span class="er-control" data-er-slot="fit"></span><button class="er-control" id="er-layers" aria-label="Tampilkan legenda kondisi jalan" aria-expanded="false">${erAsset("imgIconLayers", 18, 18)}</button></div>
      <section class="er-legend" id="er-legend"><h2>Kondisi jalan</h2><p>${erAsset("imgFrame", 22, 8)}Genangan ringan, bisa dilalui pelan</p><p>${erAsset("imgFrame1", 22, 8)}Genangan berat, hindari</p><p>${erAsset("imgFrame2", 22, 8)}Ditutup</p><small>Parameter simulasi · bukan laporan langsung</small></section>
      <a class="er-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors · ODbL</a>
    </section>
    <aside class="er-panel" aria-label="Rencana dan hasil evakuasi">
      <div id="er-plan-screen" style="display:contents">
        <header class="er-brand"><span class="er-logo">${erAsset("imgFrame4", 22, 22)}</span><div class="er-brand-copy"><h1>EvacRoute</h1><p>Evakuasi banjir Jakarta Utara & Timur</p></div><span class="er-training">Mode latihan</span></header>
        <div class="er-scroll">
          <div data-er-slot="pick-origin-input"></div>
          <section class="er-section"><div class="er-label-row"><h2>Siapa yang dievakuasi?</h2></div>
            <div class="er-missions" role="radiogroup" aria-label="Kebutuhan evakuasi">
              ${[
                ["critical", "Pasien kritis", "imgVektor"],
                ["normal", "Pengungsi", "imgVektor1"],
                ["food", "Makanan", "imgVektor2"],
              ]
                .map(
                  ([value, label, asset]) =>
                    `<button class="er-mission" type="button" role="radio" aria-checked="false" data-mission="${value}"><span class="er-mission-icon">${erAsset(asset, 20, 20)}</span><strong>${label}</strong><span class="er-radio"></span></button>`,
                )
                .join("")}
            </div><p class="er-mission-note" id="er-mission-note"></p>
          </section>
          <section class="er-section" id="er-size-section"><div class="er-label-row"><label for="size">Jumlah orang</label><span>maks. 5 per kelompok</span></div>
            <div class="er-stepper"><button id="er-minus" aria-label="Kurangi jumlah orang">${erAsset("imgIconMinus", 18, 18)}</button><div class="er-size-value"><span data-er-slot="size"></span><span>orang</span></div><button id="er-plus" aria-label="Tambah jumlah orang">${erAsset("imgIconPlus", 18, 18)}</button></div>
          </section>
          <section class="er-section"><div class="er-label-row"><h2>Tujuan shelter</h2><span>pilih salah satu</span></div><div class="er-destinations" id="er-destinations" role="radiogroup" aria-label="Tujuan shelter"></div></section>
          <section class="er-section"><button class="er-risk" id="er-risk" role="switch" aria-checked="true"><span class="er-risk-copy"><strong>Hindari genangan berat</strong><p id="er-risk-note">Direkomendasikan. Ruas tertutup selalu dihindari.</p></span><span id="er-risk-switch">${erAsset("imgSwitchOn", 40, 24)}</span></button></section>
        </div>
        <footer class="er-footer"><div data-er-slot="search"></div><p id="er-plan-summary"></p><nav class="er-panel-tools" aria-label="Alat simulasi"><button data-er-open="analysis">Analisis algoritma</button><button data-er-open="settings">Pengaturan</button><button id="er-history">Riwayat</button></nav></footer>
      </div>
      <section class="er-result-screen hidden" id="er-result-screen" aria-label="Rute ditemukan"><div class="er-result-scroll" id="er-result-detail"></div><footer class="er-footer"><div class="er-result-buttons"><button class="er-secondary" id="er-share">Ekspor</button><div data-er-slot="confirm" style="flex:1"></div></div><p>Konfirmasi akan memperbarui penghuni shelter.</p></footer></section>
      <div class="er-sheet-dimmer hidden" id="er-sheet-dimmer"></div><section class="er-sheet hidden" id="er-sheet" role="dialog" aria-modal="true" aria-labelledby="er-sheet-title" tabindex="-1"></section>
    </aside>`;
  old.after(app);
  // Keep secondary tools on the map, leaving the form footer as compact as Figma.
  app.querySelector(".map-card").append(app.querySelector(".er-panel-tools"));
  for (const [id, node] of Object.entries(saved)) {
    if (["notice", "advanced-settings"].includes(id)) continue;
    app.querySelector(`[data-er-slot="${id}"]`).replaceWith(node);
  }
  // Keep the original canvas as a direct child: its dimensions drive map rendering.
  const markerLayer = erGet("er-markers");
  markerLayer.before(saved.map);
  erGet("er-hover-slot").replaceWith(erGet("hover-tip"));
  // Retain the legacy toolbar IDs used by the routing app's event bindings.
  old.querySelector(".map-card").className = "er-offscreen";
  saved["pick-origin-input"].className = "er-origin";
  saved["pick-origin-input"].innerHTML =
    `<span class="er-origin-icon">${erAsset("imgIconPin", 16, 16)}</span><span class="er-origin-copy"><span class="er-eyebrow">Titik awal</span><strong id="er-origin-name">Pilih titik pada peta</strong><span class="er-coordinates" id="er-origin-coordinates"></span></span><span class="er-link">Ubah</span>`;
  saved.search.className = "er-primary";
  saved.search.textContent = "Cari rute evakuasi";
  saved.confirm.className = "er-primary";
  saved.confirm.textContent = "Mulai evakuasi";
  saved.size.max = "5";
  saved.size.value = "2";
  saved["zoom-in"].innerHTML = erAsset("imgIconPlus", 18, 18);
  saved["zoom-out"].innerHTML = erAsset("imgIconMinus", 18, 18);
  saved.fit.innerHTML = erAsset("imgIconLoc", 18, 18);
  saved.fit.className = "er-control";
  saved.fit.setAttribute("aria-label", "Tampilkan seluruh area peta");
  const overlays = document.createElement("div");
  overlays.innerHTML = `<div id="er-analysis" class="er-overlay hidden"><section class="er-drawer" role="dialog" aria-modal="true" aria-labelledby="er-analysis-title"><header class="er-drawer-head"><h2 id="er-analysis-title">Analisis & kapasitas pengungsian</h2><button class="er-close" data-er-close aria-label="Tutup analisis">×</button></header><div id="er-analysis-content"></div></section></div><div id="er-settings" class="er-overlay hidden"><section class="er-drawer panel-input" role="dialog" aria-modal="true" aria-labelledby="er-settings-title"><header class="er-drawer-head"><h2 id="er-settings-title">Pengaturan simulasi</h2><button class="er-close" data-er-close aria-label="Tutup pengaturan">×</button></header><div id="er-settings-content"></div></section></div>`;
  document.body.append(overlays);
  erGet("er-analysis-content").append(
    old.querySelector(".comparison-card"),
    old.querySelector(".right-panel"),
  );
  const settingsContent = erGet("er-settings-content");
  const roadSettings = document.createElement("section");
  roadSettings.className = "er-road-settings";
  roadSettings.innerHTML = "<h3>Jalan Terhalang</h3>";
  const densityField = erGet("random-density").closest(".field");
  densityField.querySelector("label").textContent = "Tingkat hambatan";
  roadSettings.append(
    densityField,
    erGet("randomize"),
    erGet("reset-roads"),
    erGet("random-summary"),
  );
  const shelterSettings = [...saved["advanced-settings"].children].find(
    (node) =>
      node.tagName === "DETAILS" &&
      node.querySelector("summary")?.textContent.trim() === "Pengaturan Shelter",
  );
  const shelterSection = document.createElement("section");
  shelterSection.className = "er-shelter-settings";
  const shelterHeading = document.createElement("h3");
  shelterHeading.textContent = "Pengaturan Shelter";
  shelterSection.append(
    shelterHeading,
    ...[...shelterSettings.children].filter((node) => node.tagName !== "SUMMARY"),
  );
  shelterSettings.remove();
  settingsContent.append(roadSettings, shelterSection);
  saved.notice.className = "er-toast";
  saved.notice.textContent = "";
  document.body.append(saved.notice);
  erGet("mission").value = "critical";
  document.title = "EvacRoute · Rencanakan evakuasi";
}

function erOpenDrawer(name) {
  erLastFocus = document.activeElement;
  const overlay = erGet(`er-${name}`);
  overlay.classList.remove("hidden");
  overlay.querySelector("[data-er-close]").focus();
}
function erCloseDrawers() {
  document.querySelectorAll(".er-overlay").forEach((node) => node.classList.add("hidden"));
  erLastFocus?.focus();
}
function erMissionName() {
  return { critical: "Pasien kritis", normal: "Pengungsi", food: "Bantuan makanan" }[
    erGet("mission").value
  ];
}
const erOriginRoadNames = new Map();
function erOriginRoad() {
  if (erOriginRoadNames.has(origin)) return erOriginRoadNames.get(origin);
  const edge = DATA.edges.find(
    (e) => (e[0] === origin || e[1] === origin) && e[5] && e[5] !== "Jalan tanpa nama",
  );
  const name = edge?.[5] || "Titik awal di peta";
  erOriginRoadNames.set(origin, name);
  return name;
}
function erDestinationRow(id, inSheet = false) {
  const mission = erGet("mission").value,
    size = mission === "food" ? 1 : Number(erGet("size").value);
  const s = id === "auto" ? null : state.shelters[id],
    n = s ? spaces(s)[0] : 0;
  const eligible = !s || shelterEligible(s, mission, size);
  const tone = !s
    ? "auto"
    : !eligible
      ? "muted"
      : n < size && mission === "critical"
        ? "warn"
        : "ok";
  let description = !s
    ? mission === "critical"
      ? "Tercepat yang punya tim medis"
      : mission === "food"
        ? "Shelter layak tercepat untuk bantuan"
        : "Tercepat yang masih ada tempat"
    : !s.active
      ? "Tidak operasional"
      : mission === "critical" && !s.medical
        ? "Tanpa tim medis, tidak untuk pasien kritis"
        : !eligible
          ? "Kapasitas tidak cukup untuk kelompok ini"
          : mission === "critical"
            ? n < size
              ? `Penuh · cadangan medis ${spaces(s)[1]} tempat`
              : `${n} tempat · ada tim medis`
            : `${n} tempat kosong${s.medical ? " · tim medis" : " · nonkritis saja"}`;
  return `<button type="button" class="er-destination" data-target="${id}" data-tone="${tone}" data-ineligible="${!eligible}" ${inSheet ? "" : `role="radio" aria-checked="${erGet("target").value === String(id)}"`}><span class="er-radio-asset">${erAsset(erGet("target").value === String(id) && !inSheet ? "imgRadio" : !eligible ? "imgRadio2" : "imgRadio1", 18, 18)}</span><span class="er-destination-icon">${erAsset(s ? "imgFrame6" : "imgFrame5", 14, 14)}</span><span class="er-destination-copy"><strong>${escape(s ? s.name : "Otomatis")}</strong><span>${escape(description)}</span></span>${s ? `<span class="er-destination-count">${s.occupants}/${s.capacity}</span>` : ""}</button>`;
}
let erLastFormKey = null;
function erSyncForm() {
  const formKey = [
    state.version,
    origin,
    erGet("mission").value,
    erGet("size").value,
    erGet("mode").value,
    erGet("target").value,
  ].join(":");
  if (formKey === erLastFormKey) return;
  erLastFormKey = formKey;
  const mission = erGet("mission").value,
    size = Number(erGet("size").value);
  document.querySelectorAll(".er-mission").forEach((button) => {
    const active = button.dataset.mission === mission;
    button.setAttribute("aria-checked", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  const note = erGet("er-mission-note");
  note.textContent =
    mission === "critical"
      ? "Prioritas medis · cadangan sesuai kapasitas tersedia."
      : mission === "normal"
        ? "Hanya ke shelter dengan tempat normal yang cukup."
        : "Bantuan tidak menambah jumlah penghuni shelter.";
  note.style.background =
    mission === "critical" ? "#fdecea" : mission === "normal" ? "#e8f0fc" : "#fff3e0";
  note.style.color =
    mission === "critical" ? "#c8261d" : mission === "normal" ? "#1d5fd1" : "#b54708";
  erGet("er-size-section").classList.toggle("hidden", mission === "food");
  erGet("er-minus").disabled = size <= 1;
  erGet("er-plus").disabled = size >= 5;
  erGet("er-destinations").innerHTML = ["auto", 1, 0, 2].map((id) => erDestinationRow(id)).join("");
  const safe = erGet("mode").value === "safe";
  erGet("er-risk").setAttribute("aria-checked", String(safe));
  erGet("er-risk-switch").innerHTML = safe
    ? erAsset("imgSwitchOn", 40, 24)
    : '<span class="er-switch-off" style="display:block"></span>';
  erGet("er-risk-note").textContent = safe
    ? "Direkomendasikan. Ruas tertutup selalu dihindari."
    : "Risiko berat diizinkan. Ruas tertutup tetap dihindari.";
  erGet("er-plan-summary").textContent =
    `${erMissionName()}${mission === "food" ? "" : ` · ${size} orang`} · ${erGet("target").value === "auto" ? "tujuan otomatis" : state.shelters[Number(erGet("target").value)].short_name || state.shelters[Number(erGet("target").value)].name}`;
  erGet("er-origin-name").textContent = erOriginRoad();
  const node = DATA.nodes[origin];
  erGet("er-origin-coordinates").textContent = `${node[1].toFixed(5)}, ${node[2].toFixed(5)}`;
  const r = state.randomization;
  const affected = new Set(
    DATA.edges
      .filter((e, i) => edgeState(DATA, i, state.changes).risk > 0)
      .map((e) => [Math.min(e[0], e[1]), Math.max(e[0], e[1]), e[6]].join(":")),
  ).size;
  erGet("er-road-count").textContent = `${affected} ruas terhalang · kondisi simulasi`;
}
function erChooseTarget(id) {
  if (
    id !== "auto" &&
    !shelterEligible(
      state.shelters[Number(id)],
      erGet("mission").value,
      erGet("mission").value === "food" ? 1 : Number(erGet("size").value),
    )
  ) {
    erShowShelterSheet(Number(id));
    return;
  }
  erGet("target").value = String(id);
  erGet("target").dispatchEvent(new Event("change"));
  erHideSheet();
  erSyncForm();
}
function erShowShelterSheet(id) {
  const s = state.shelters[id],
    mission = erGet("mission").value,
    size = mission === "food" ? 1 : Number(erGet("size").value);
  erLastFocus = document.activeElement;
  const alternatives = state.shelters
    .map((s, id) => ({ s, id }))
    .filter(({ s }) => shelterEligible(s, mission, size));
  const reason = !s.active
    ? "Shelter ini sedang tidak operasional."
    : mission === "critical" && !s.medical
      ? "Shelter ini tidak memiliki tim medis untuk pasien kritis."
      : "Kapasitas yang tersedia tidak cukup untuk kelompok ini. Cadangan medis hanya untuk pasien kritis.";
  erGet("er-sheet").innerHTML =
    `<h2 id="er-sheet-title">${escape(s.name)} tidak sesuai</h2><p>${escape(reason)} Pilih shelter lain yang memenuhi kebutuhan.</p>${alternatives.map(({ id }) => erDestinationRow(id, true)).join("") || "<p>Tidak ada shelter yang memenuhi kebutuhan saat ini. Ubah jumlah orang atau pengaturan shelter.</p>"}<button class="er-link" id="er-sheet-back">Kembali ubah pilihan</button>`;
  erGet("er-sheet-dimmer").classList.remove("hidden");
  erGet("er-sheet").classList.remove("hidden");
  erGet("er-sheet").focus();
}
function erHideSheet() {
  const wasOpen = !erGet("er-sheet").classList.contains("hidden");
  erGet("er-sheet").classList.add("hidden");
  erGet("er-sheet-dimmer").classList.add("hidden");
  if (wasOpen) erLastFocus?.focus();
}
function erRouteSteps(route) {
  const streets = [];
  for (const id of route.edges) {
    const e = DATA.edges[id],
      name = e[5] || "Jalan penghubung";
    if (streets.at(-1)?.name === name) streets.at(-1).distance += e[3];
    else streets.push({ name, distance: e[3] });
  }
  return streets;
}
function erRenderResult() {
  const isSingle = preview?.kind === "single";
  erGet("er-plan-screen").classList.toggle("hidden", !!isSingle);
  erGet("er-result-screen").classList.toggle("hidden", !isSingle);
  if (!isSingle) {
    erSyncForm();
    return;
  }
  const r = preview.route,
    s = state.shelters[r.shelter],
    streets = erRouteSteps(r);
  if (erResultId !== preview.id) {
    erResultId = preview.id;
    erAlternatives = [];
    // The worker supplies alternatives without blocking map interaction.
    if (Array.isArray(preview.destinationAlternatives)) {
      erAlternatives = preview.destinationAlternatives;
    } else {
      // Alternative destinations are calculated independently; they are not benchmark runs.
      for (let id = 0; id < state.shelters.length; id++) {
        if (id === r.shelter || !shelterEligible(state.shelters[id], preview.mission, preview.size))
          continue;
        const route = hybridSearch(
          DATA,
          state.changes,
          origin,
          [{ id, node: state.shelters[id].node }],
          preview.mode,
        );
        if (route.found) erAlternatives.push({ id, route });
      }
    }
    erAlternatives.sort((a, b) => a.route.seconds - b.route.seconds);
  }
  const overflow = Math.max(0, preview.size - spaces(s)[0]);
  const steps = streets.map(
    (road, i) =>
      `<div class="er-route-step"><span class="er-step-index">${i + 1}</span><span><strong>${i === 0 ? "Mulai di " : "Lanjut ke "}${escape(road.name)}</strong><p>${i === 0 ? "Dari titik awal" : "Ikuti ruas pada peta"}</p></span><em>${Math.round(road.distance)} m</em></div>`,
  );
  erGet("er-result-detail").innerHTML =
    `<div class="er-result-top"><button id="er-back-plan">‹ &nbsp; Ubah rencana</button><span class="er-mission-chip">${escape(erMissionName())}${preview.mission === "food" ? "" : ` · ${preview.size} orang`}</span></div><p class="er-eyebrow">Tujuan evakuasi</p><h2 class="er-result-title">${escape(s.name)}</h2><p class="er-result-subtitle">${s.medical ? "Memiliki tim medis" : "Pengungsian nonkritis"} · ${s.occupants}/${s.capacity} penghuni</p><div class="er-route-stats"><div><strong>${Math.ceil(r.seconds / 60)}</strong> <span>menit</span><small>Waktu tempuh</small></div><div><strong>${(r.distance / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}</strong> <span>km</span><small>Jarak</small></div><div><strong>${RISK[r.risk]}</strong><small>Risiko tertinggi</small></div></div><div class="er-result-notice"><span class="er-destination-icon">${erAsset("imgFrame6", 14, 14)}</span><div><strong>${preview.mission === "food" ? "Shelter dapat menerima bantuan" : overflow > 0 ? "Cadangan medis tersedia" : "Shelter dapat menerima kelompok"}</strong><p>${preview.mission === "food" ? "Perjalanan bantuan tidak mengubah jumlah penghuni." : overflow > 0 ? `${overflow} orang memakai cadangan medis. Penghuni bertambah setelah konfirmasi.` : `${preview.size} orang dapat ditampung. Penghuni bertambah setelah konfirmasi.`}</p></div></div><section class="er-result-section"><h3>Ringkasan kondisi rute</h3><p class="er-result-subtitle">${preview.mode === "safe" ? "Menghindari ruas berisiko berat dan ditutup." : "Mengizinkan risiko berat; seluruh ruas ditutup tetap dihindari."}${r.heavyDistance > 0 ? ` Melewati ${Math.round(r.heavyDistance)} m ruas berisiko berat.` : ""}</p></section><section class="er-result-section"><div class="er-label-row"><h3>Petunjuk jalan</h3><span>${streets.length} ruas bernama</span></div>${steps.slice(0, 3).join("")}${steps.length > 3 ? `<details class="er-route-more"><summary>Lihat ${steps.length - 3} ruas lagi sampai ${escape(s.short_name || s.name)}</summary>${steps.slice(3).join("")}</details>` : ""}</section>${erAlternatives.length ? `<section class="er-result-section"><h3>Alternatif tujuan</h3>${erAlternatives.map(({ id, route }) => `<button class="er-destination" data-alternative="${id}"><span class="er-destination-icon">${erAsset("imgFrame6", 14, 14)}</span><span class="er-destination-copy"><strong>${escape(state.shelters[id].name)}</strong><span>${Math.ceil(route.seconds / 60)} mnt · ${(route.distance / 1000).toFixed(1)} km · ${spaces(state.shelters[id])[0]} tempat normal kosong</span></span><span class="er-link">Pilih</span></button>`).join("")}</section>` : ""}<div class="er-section"><button class="er-link" data-er-open="analysis">Lihat perbandingan A* dan Dijkstra →</button></div>`;
  erGet("confirm").disabled = busy || !!preview.confirmed;
}

function initEvacRoute() {
  const originalState = renderState,
    originalOrigin = renderOrigin,
    originalResults = renderResults,
    originalNotice = notice,
    originalBusy = setBusy;
  renderState = function () {
    originalState();
    erSyncForm();
  };
  renderOrigin = function () {
    originalOrigin();
    erSyncForm();
  };
  renderResults = function () {
    originalResults();
    erRenderResult();
  };
  notice = function (message, error = false) {
    originalNotice(message, error);
    clearTimeout(erToastTimer);
    erToastTimer = setTimeout(() => (erGet("notice").textContent = ""), error ? 8500 : 4500);
  };
  setBusy = function (value) {
    originalBusy(value);
    erGet("search").textContent = value ? "Menghitung rute…" : "Cari rute evakuasi";
  };
  const trigger = (id) => erGet(id).dispatchEvent(new Event("change"));
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.erOpen) erOpenDrawer(button.dataset.erOpen);
    if (button.hasAttribute("data-er-close")) erCloseDrawers();
    if (button.dataset.mission) {
      erGet("mission").value = button.dataset.mission;
      trigger("mission");
      erSyncForm();
    }
    if (button.dataset.target !== undefined) erChooseTarget(button.dataset.target);
    if (button.dataset.alternative !== undefined) {
      erChooseTarget(button.dataset.alternative);
      search();
    }
    if (button.id === "er-sheet-back") erHideSheet();
    if (button.id === "er-back-plan") {
      invalidate();
      erGet("search").focus();
    }
  });
  document.querySelectorAll(".er-overlay").forEach((overlay) =>
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) erCloseDrawers();
    }),
  );
  erGet("er-sheet-dimmer").onclick = erHideSheet;
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      erCloseDrawers();
      erHideSheet();
    }
    const modal = !erGet("er-sheet").classList.contains("hidden")
      ? erGet("er-sheet")
      : document.querySelector(".er-overlay:not(.hidden) .er-drawer");
    if (event.key === "Tab" && modal) {
      const focusable = [
        ...modal.querySelectorAll(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,a[href],[tabindex="0"]',
        ),
      ].filter((node) => node.getClientRects().length);
      const first = focusable[0],
        last = focusable.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === modal)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    const mission = event.target.closest(".er-mission");
    if (mission && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      const buttons = [...document.querySelectorAll(".er-mission")],
        next =
          (buttons.indexOf(mission) + (["ArrowLeft", "ArrowUp"].includes(event.key) ? 2 : 1)) % 3;
      buttons[next].click();
      buttons[next].focus();
    }
  });
  erGet("er-minus").onclick = () => {
    erGet("size").value = Math.max(1, Number(erGet("size").value) - 1);
    trigger("size");
    erSyncForm();
  };
  erGet("er-plus").onclick = () => {
    erGet("size").value = Math.min(5, Number(erGet("size").value) + 1);
    trigger("size");
    erSyncForm();
  };
  erGet("size").addEventListener("change", () => {
    erGet("size").value = Math.max(1, Math.min(5, Number(erGet("size").value) || 1));
    erSyncForm();
  });
  erGet("er-risk").onclick = () => {
    erGet("mode").value = erGet("mode").value === "safe" ? "emergency" : "safe";
    trigger("mode");
    erSyncForm();
  };
  erGet("er-history").onclick = () => erGet("nav-history").click();
  erGet("er-share").onclick = () => erGet("export").click();
  erGet("er-layers").onclick = () => {
    const open = erGet("er-legend").classList.toggle("er-expanded");
    erGet("er-layers").setAttribute("aria-expanded", String(open));
  };
  erInstallPerformance();
  erInstallMap();
  erSyncForm();
  erRenderResult();
  erGet("mission").dispatchEvent(new Event("change"));
  erGet("notice").textContent = "";
  erGet("er-startup")?.remove();
}

// Fit only the actual route geometry into the unobstructed portion of the map.
function erRouteCamera(points, rectangle, maxScale = 2) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return null;
  const availableWidth = Math.max(1, rectangle.right - rectangle.left);
  const availableHeight = Math.max(1, rectangle.bottom - rectangle.top);
  const scale = Math.min(
    maxScale,
    availableWidth / Math.max(1, maxX - minX),
    availableHeight / Math.max(1, maxY - minY),
  );
  return {
    scale,
    x: (rectangle.left + rectangle.right) / 2 - ((minX + maxX) / 2) * scale,
    y: (rectangle.top + rectangle.bottom) / 2 - ((minY + maxY) / 2) * scale,
  };
}

function erInstallRouteCamera() {
  const originalClamp = clampView;
  let frame = null,
    scheduled = false,
    autoFitKey = null,
    routeMinScale = null;
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const routes = () =>
    preview ? (preview.kind === "single" ? [preview.route] : preview.routes || []) : [];
  const key = () => `${preview?.id || "overview"}:${width}:${height}`;
  const cancel = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
  const rectangle = () => {
    const mapBox = canvas.getBoundingClientRect();
    const panelBox = document.querySelector(".er-panel").getBoundingClientRect();
    const mobile = window.matchMedia("(max-width: 780px)").matches;
    if (mobile) {
      return {
        left: Math.min(100, width * 0.27),
        right: width - Math.min(100, width * 0.27),
        top: Math.min(140, height * 0.32),
        bottom: Math.min(height - 42, panelBox.top - mapBox.top - 20),
      };
    }
    const left = Math.max(24, panelBox.right - mapBox.left + 24),
      right = width - 72;
    const availableWidth = Math.max(100, right - left);
    const legendBox = erGet("er-legend").getBoundingClientRect();
    return {
      left: left + Math.min(190, availableWidth * 0.23),
      right: right - Math.min(105, availableWidth * 0.14),
      top: Math.min(176, height * 0.26),
      bottom: Math.min(height - 48, legendBox.top - mapBox.top - 44),
    };
  };
  function focus(animate) {
    if (width < 100 || height < 100 || erGet("dashboard").classList.contains("hidden")) return;
    cancel();
    const paths = routes().filter((route) => route?.found);
    const points = [];
    for (const route of paths) {
      for (const id of route.edges) points.push(...edgeXY[id]);
      if (route.nodes.length) points.push(nodeXY[route.nodes[0]], nodeXY[route.nodes.at(-1)]);
      const shelter = state.shelters[route.shelter];
      if (shelter) points.push(project(shelter.lat, shelter.lon));
    }
    const target = points.length ? erRouteCamera(points, rectangle()) : overview();
    if (!target) return;
    routeMinScale = points.length ? Math.min(overview().scale, target.scale) : null;
    erGet("fit").setAttribute(
      "aria-label",
      points.length ? "Fokuskan peta ke rute" : "Tampilkan seluruh area peta",
    );
    erGet("fit").title = points.length ? "Fokuskan ke rute" : "Tampilkan seluruh area";
    const start = { ...view },
      started = performance.now();
    const duration = animate && !reducedMotion() ? 450 : 0;
    const finish = () => {
      Object.assign(view, { x: target.x, y: target.y, scale: target.scale });
      if (!points.length) originalClamp();
      erGet("zoom-out").disabled = view.scale <= (routeMinScale ?? overview().scale) * (1 + 1e-9);
      requestDraw();
    };
    if (!duration) {
      finish();
      return;
    }
    function step(now) {
      const progress = Math.min(1, (now - started) / duration),
        eased = 1 - (1 - progress) ** 3;
      view.scale = start.scale * (target.scale / start.scale) ** eased;
      view.x = start.x + (target.x - start.x) * eased;
      view.y = start.y + (target.y - start.y) * eased;
      requestDraw();
      if (progress < 1) frame = requestAnimationFrame(step);
      else {
        frame = null;
        finish();
      }
    }
    frame = requestAnimationFrame(step);
  }
  // Recenter once per new route (or resize), never while inspecting route details.
  scheduleFit = function () {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const nextKey = key();
      if (nextKey === autoFitKey) return;
      const previousKey = autoFitKey;
      autoFitKey = nextKey;
      const newRoute = routes().length && previousKey?.split(":")[0] !== preview.id;
      if (newRoute && window.matchMedia("(max-width: 780px)").matches) {
        erGet("er-legend").classList.remove("er-expanded");
        erGet("er-layers").setAttribute("aria-expanded", "false");
      }
      focus(!!newRoute);
      if (newRoute && window.matchMedia("(max-width: 780px)").matches) {
        document
          .querySelector(".map-card")
          .scrollIntoView({ behavior: reducedMotion() ? "instant" : "smooth", block: "start" });
      }
    });
  };
  fitMap = function () {
    autoFitKey = key();
    focus(true);
  };
  erGet("fit").onclick = fitMap;
  clampView = function () {
    if (routeMinScale === null || !routes().length) {
      originalClamp();
      return;
    }
    // Allow the camera to shift behind the sidebar so the route itself stays visible.
    view.scale = Math.max(routeMinScale, Math.min(2, view.scale));
    erGet("zoom-out").disabled = view.scale <= routeMinScale * (1 + 1e-9);
  };
  zoom = function (factor, x, y) {
    cancel();
    const area = rectangle();
    x ??= (area.left + area.right) / 2;
    y ??= (area.top + area.bottom) / 2;
    const oldScale = view.scale;
    view.scale = Math.max(
      routes().length ? (routeMinScale ?? overview().scale) : overview().scale,
      Math.min(2, view.scale * factor),
    );
    view.x = x - ((x - view.x) * view.scale) / oldScale;
    view.y = y - ((y - view.y) * view.scale) / oldScale;
    clampView();
    requestDraw();
  };
  for (const event of ["pointerdown", "wheel", "keydown"])
    canvas.addEventListener(event, cancel, { capture: true, passive: true });
  erGet("zoom-in").addEventListener("click", cancel, true);
  erGet("zoom-out").addEventListener("click", cancel, true);
}

function erInstallMap() {
  const imageNames = [
    "imgJalanPerumahanResidential1",
    "imgJalanPerumahanResidential2",
    "imgJalanLingkunganTertiary",
    "imgJalanKolektorSecondary",
    "imgJalanArteriPrimaryTrunk",
    "imgJalanTolMotorway",
  ];
  const mapImages = imageNames.map((name) => {
    const image = new Image();
    image.onload = requestDraw;
    image.src = `assets/figma/${name}.svg`;
    return image;
  });
  const anchor = project(-6.1688, 106.8926),
    left = anchor[0] - 966 * 6.8,
    top = anchor[1] - 486 * 6.8;
  overview = function () {
    const minX = left,
      maxX = left + 1440 * 6.8,
      minY = top,
      maxY = top + 900 * 6.8,
      scale = Math.max(width / (maxX - minX), height / (maxY - minY));
    return {
      minX,
      maxX,
      minY,
      maxY,
      horizontal: 0,
      top: 0,
      bottom: 0,
      scale,
      x: (width - (maxX - minX) * scale) / 2 - minX * scale,
      y: (height - (maxY - minY) * scale) / 2 - minY * scale,
    };
  };
  const streetLabels = [
    [1000, 615, "Jl. Perintis Kemerdekaan", 0.485],
    [882, 215, "Jl. Yos Sudarso", -1.108],
    [800, 364, "Tol Wiyoto Wiyono", -1.087],
    [695, 700, "Jl. Jend. Ahmad Yani", -1.443],
    [1170, 360, "Jl. Boulevard Raya", -1.01],
    [1340, 330, "Jl. Pegangsaan Dua", 1.47],
    [880, 53, "Jl. Danau Sunter Utara", 0.29],
    [795, 872, "Jl. Pemuda", 0],
    [946, 420, "Jl. Bukit Gading Raya", -1.065],
    [1122, 435, "Jl. Bulevar Utara", -1.066],
    [951, 720, "Jl. Raya Kayu Putih", -1.349],
    [570, 500, "Jl. Letjen Suprapto", -0.396],
    [1040, 290, "Jl. Boulevard Barat", 0.522],
    [788, 190, "Jl. Danau Indah Raya", -0.164],
    [1290, 450, "Tol Sunter Pulo Gebang", 0.843],
    [1170, 225, "Jl. Raya Kelapa Nias", 0.567],
  ];
  const placeLabels = [
    [1190, 300, "KELAPA GADING"],
    [625, 215, "SUNTER JAYA"],
    [880, 600, "PULOMAS"],
    [735, 860, "RAWAMANGUN"],
    [1360, 195, "PEGANGSAAN DUA"],
    [1080, 740, "KAYU PUTIH"],
  ];
  const drawCachedMap = erCreateMapLayerRenderer(mapImages, left, top, streetLabels, placeLabels);
  const routePaths = new WeakMap();
  drawMap = function () {
    const renderStarted = performance.now();
    const c = context,
      ratio = Math.min(devicePixelRatio || 1, 1.5);
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, width, height);
    c.fillStyle = "#eae6de";
    c.fillRect(0, 0, width, height);
    drawCachedMap(c);
    c.lineCap = "round";
    c.lineJoin = "round";
    const paths = preview ? (preview.kind === "single" ? [preview.route] : preview.routes) : [];
    paths.forEach((route, j) => {
      c.save();
      c.translate(view.x, view.y);
      c.scale(view.scale, view.scale);
      c.strokeStyle = "white";
      c.lineWidth = 10 / view.scale;
      if (!routePaths.has(route)) {
        const path = new Path2D();
        for (const id of route.edges) {
          const points = edgeXY[id];
          path.moveTo(...points[0]);
          for (let i = 1; i < points.length; i++) path.lineTo(...points[i]);
        }
        routePaths.set(route, path);
      }
      c.stroke(routePaths.get(route));
      c.strokeStyle = ["#2364ef", "#147a4b", "#b54708"][j % 3];
      c.lineWidth = 6 / view.scale;
      c.stroke(routePaths.get(route));
      c.restore();
    });
    if (selected !== null) {
      c.save();
      c.translate(view.x, view.y);
      c.scale(view.scale, view.scale);
      c.strokeStyle = "#7856c9";
      c.lineWidth = 7 / view.scale;
      drawPolyline(c, edgeXY[selected]);
      c.restore();
    }
    if (showTrace && preview?.kind === "single")
      for (const i of preview.route.astarExplored) {
        const [x, y] = screen(nodeXY[i]);
        c.fillStyle = "#7856c970";
        c.fillRect(x - 1, y - 1, 3, 3);
      }
    for (const group of groups) {
      const [x, y] = screen(nodeXY[group.node]);
      circle(x, y, 6, "#7856c9");
      label("G" + group.id, x + 10, y, "#7856c9");
    }
    erRenderMapMarkers();
    erTrackRender(renderStarted);
  };
  erInstallRouteCamera();
  fitMap();
  requestDraw();
}
function erBuildMapMarkers() {
  const markerLayer = erGet("er-markers"),
    mission = erGet("mission").value,
    size = mission === "food" ? 1 : Number(erGet("size").value);
  markerLayer.innerHTML = state.shelters
    .map((s, id) => {
      const [x, y] = screen(project(s.lat, s.lon)),
        eligible = shelterEligible(s, mission, size),
        color = !eligible
          ? "#9aa2ae"
          : spaces(s)[0] < size && mission === "critical"
            ? "#b54708"
            : "#147a4b";
      const selected = preview?.kind === "single" && preview.route.shelter === id;
      const description = !s.active
        ? "Nonaktif"
        : !eligible
          ? mission === "critical" && !s.medical
            ? "Tanpa tim medis"
            : "Tidak sesuai kebutuhan"
          : selected
            ? "Tujuan evakuasi terpilih"
            : spaces(s)[0] < size
              ? "Penuh · cadangan medis tersedia"
              : `${spaces(s)[0]} tempat${s.medical ? " · ada tim medis" : " · nonkritis"}`;
      return `<button class="er-shelter-pin" data-target="${id}" style="left:${x}px;top:${y}px;--pin-color:${color}" aria-label="${escape(s.name + ": " + description)}"><span class="er-pin-body"><span class="er-pin-icon">${erAsset("imgIconHouse", 15, 15)}</span><span><strong>${escape(s.short_name || s.name)}</strong><small>${escape(description)}</small></span></span>${erAsset("imgEkor", 12, 7)}${erAsset(id === 0 ? "imgTitikGorKelapaGading" : id === 1 ? "imgTitikGorSunter" : "imgTitikVelodromeRawamangun", 10, 10)}</button>`;
    })
    .join("");
  const [x, y] = screen(nodeXY[origin]);
  markerLayer.innerHTML += `<div class="er-origin-pin" style="left:${x}px;top:${y}px">${erAsset("imgTitikJemput", 60, 60)}<span><strong>Titik awal</strong><small>${escape(erOriginRoad())}</small></span></div>`;
  if (preview?.kind === "single" && preview.route.nodes.length) {
    const route = preview.route,
      node = route.nodes[Math.floor(route.nodes.length / 2)],
      [px, py] = screen(nodeXY[node]);
    markerLayer.innerHTML += `<div class="er-route-eta" style="left:${px}px;top:${py - 18}px">${Math.ceil(route.seconds / 60)} mnt &nbsp; ${(route.distance / 1000).toFixed(1)} km</div>`;
  }
}
let erMarkerSignature = null;
let erMarkerNodes = null;
function erRenderMapMarkers() {
  const layer = erGet("er-markers");
  const signature = [
    state.version,
    origin,
    erGet("mission").value,
    erGet("size").value,
    preview?.id || "none",
  ].join(":");
  if (signature !== erMarkerSignature) {
    erMarkerSignature = signature;
    erBuildMapMarkers();
    erMarkerNodes = {
      shelters: [...layer.querySelectorAll(".er-shelter-pin")],
      origin: layer.querySelector(".er-origin-pin"),
      eta: layer.querySelector(".er-route-eta"),
    };
    for (const node of [...erMarkerNodes.shelters, erMarkerNodes.origin, erMarkerNodes.eta]) {
      if (node) {
        node.style.left = "0";
        node.style.top = "0";
      }
    }
  }
  const position = (node, point, bottom) => {
    if (!node) return;
    const [x, y] = screen(point);
    node.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,${bottom ? "-100%" : "-50%"})`;
    const visibility =
      x < -230 || x > width + 230 || y < -100 || y > height + 100 ? "hidden" : "visible";
    if (node.style.visibility !== visibility) node.style.visibility = visibility;
  };
  state.shelters.forEach((s, id) =>
    position(erMarkerNodes.shelters[id], project(s.lat, s.lon), true),
  );
  position(erMarkerNodes.origin, nodeXY[origin], false);
  if (erMarkerNodes.eta && preview?.kind === "single") {
    const nodes = preview.route.nodes,
      point = nodeXY[nodes[Math.floor(nodes.length / 2)]];
    position(erMarkerNodes.eta, [point[0], point[1] - 18 / view.scale], false);
  }
}

erMount();

// Local, opt-in performance diagnostics; no data is sent anywhere.
const erPerformanceEnabled = new URLSearchParams(location.search).has("perf");
const erPerformanceSamples = [];
function erTrackRender(started) {
  if (!erPerformanceEnabled) return;
  erPerformanceSamples.push(performance.now() - started);
  if (erPerformanceSamples.length > 180) erPerformanceSamples.shift();
  const sorted = [...erPerformanceSamples].sort((a, b) => a - b);
  let output = document.getElementById("er-render-performance");
  if (!output) {
    output = document.createElement("output");
    output.id = "er-render-performance";
    output.hidden = true;
    document.body.append(output);
  }
  output.textContent = JSON.stringify({
    frames: sorted.length,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.floor((sorted.length - 1) * 0.95)],
    meanMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
  });
}
