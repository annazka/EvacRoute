/* A shared analysis model powers the compact interface and offline PDF export. */
"use strict";

const erAnalysisNumber = (value, digits = 3) =>
  Number(value).toLocaleString("id-ID", { maximumFractionDigits: digits });
const erAnalysisMs = (value) => `${erAnalysisNumber(value)} ms`;

function erCreateAnalysisModel(input) {
  const { data, changes, results, route, source, target, shelters, mission, size, mode } = input;
  const order = [results[1], results[2], results[0]];
  const names = ["A*", "Dijkstra", "Hybrid"];
  const n = erAnalysisNumber,
    ms = erAnalysisMs;
  let denied = 0,
    closed = 0,
    heavy = 0,
    allowed = 0,
    riskPassed = 0;
  const maxRisk = mode === "safe" ? 1 : 2;
  data.edges.forEach((edge, id) => {
    const risk = changes[id]?.risk ?? 0;
    if (risk <= maxRisk) riskPassed++;
    if (edge[8] === false) denied++;
    else if (risk === 3) closed++;
    else if (risk > maxRisk) heavy++;
    else allowed++;
  });
  const shelterRows = shelters.map((s, id) => {
    const normal = Math.max(0, s.capacity - s.occupants);
    const total = Math.max(0, s.capacity + s.overload - s.occupants);
    const medical = mission !== "critical" || s.medical;
    const capacity =
      mission === "food"
        ? s.occupants < s.capacity
        : size <= (mission === "critical" ? total : normal);
    const selected = input.selectedTarget === "auto" || Number(input.selectedTarget) === id;
    return {
      name: s.name,
      active: !!s.active,
      medical,
      capacity,
      selected,
      eligible: !!s.active && medical && capacity && selected,
      available: mission === "critical" ? total : normal,
    };
  });
  let cumulative = 0,
    distance = 0,
    routeViolations = 0;
  const routeRows = route.edges.map((id, index) => {
    const edge = data.edges[id],
      speed = changes[id]?.speed ?? 20,
      risk = changes[id]?.risk ?? 0;
    const seconds = edge[3] / (speed / 3.6);
    cumulative += seconds;
    distance += edge[3];
    if (edge[8] === false || risk > maxRisk) routeViolations++;
    return [
      index + 1,
      edge[5] || "Jalan tanpa nama",
      n(edge[3], 1),
      n(speed),
      n(seconds),
      n(cumulative),
    ];
  });
  const table = (title, headers, rows, note = "", widths) => ({
    title,
    headers,
    rows,
    note,
    widths,
  });
  const byMethod = (label, fn) => [label, ...order.map(fn)];
  const counts = {
    vertices: data.nodes.length,
    totalEdges: data.edges.length,
    allowed,
    denied,
    closed,
    heavy,
  };
  const times = table(
    "Rincian waktu komputasi",
    ["Ukuran", ...names],
    [
      byMethod("Persiapan graf + heuristik", (r) => ms(r.prepMs)),
      byMethod("Pencarian", (r) => ms(r.searchMs)),
      byMethod("Rekonstruksi + overhead", (r) => ms(Math.max(0, r.meanMs - r.prepMs - r.searchMs))),
      byMethod("Total rata-rata", (r) => ms(r.meanMs)),
      byMethod("Median total", (r) => ms(r.medianMs)),
      byMethod("Minimum total", (r) => ms(r.minMs)),
      byMethod("Maksimum total", (r) => ms(r.maxMs)),
      byMethod("Simpangan baku populasi", (r) => ms(r.sdMs)),
      [
        "Dijkstra terbalik (hybrid)",
        "Tidak digunakan",
        "Tidak digunakan",
        ms(results[0].reverseMs),
      ],
      ["A* maju (hybrid)", "Tidak digunakan", "Tidak digunakan", ms(results[0].forwardMs)],
    ],
    "Setiap metode: 1 pemanasan + 10 pengukuran. Total = persiapan + pencarian + rekonstruksi/overhead. Dua tahap hybrid adalah bagian dari waktu pencarian, bukan tambahan terhadap total. Inisialisasi worker, pengiriman data, rendering dan jeda antarrun tidak termasuk. Hasil dipengaruhi perangkat serta beban browser.",
  );
  const samples = table(
    "Sepuluh pengukuran total",
    ["Run", ...names],
    Array.from({ length: 10 }, (_, i) => [
      i + 1,
      ...order.map((r) => (r.samples?.[i] ? ms(r.samples[i].total) : "Tidak tersedia")),
    ]),
    "Urutan pengukuran asli, tidak diurutkan. Rata-rata = jumlah 10 waktu / 10; median = rata-rata posisi 5 dan 6 setelah diurutkan; SD = akar(jumlah (waktu - rata-rata)^2 / 10).",
  );
  const phases = order.map((r, i) =>
    table(
      `Waktu setiap run: ${names[i]}`,
      ["Run", "Persiapan ms", "Cari ms", "Lainnya ms", "Total ms"],
      (r.samples || []).map((s, j) => [
        j + 1,
        n(s.prep),
        n(s.search),
        n(Math.max(0, s.total - s.prep - s.search)),
        n(s.total),
      ]),
    ),
  );
  const v = data.nodes.length,
    e0 = data.edges.length,
    e = allowed;
  const log = Math.log2(Math.max(2, e + 1));
  const complexity = table(
    "Kompleksitas teoretis",
    ["Aspek", ...names],
    [
      [
        "Waktu, batas atas implementasi",
        "O(V + E0 + (V+E) log(E+1))",
        "O(V + E0 + (V+E) log(E+1))",
        "O(V + E0 + 2(V+E) log(E+1))",
      ],
      ["Memori, batas atas", "O(V + E0)", "O(V + E0)", "O(V + E0)"],
      [
        "Substitusi V / E0 / E",
        `${n(v)} / ${n(e0)} / ${n(e)}`,
        `${n(v)} / ${n(e0)} / ${n(e)}`,
        `${n(v)} / ${n(e0)} / ${n(e)}`,
      ],
      ["log2(E + 1)", n(log), n(log), n(log)],
      [
        "Indeks skala rumus waktu",
        n(v + e0 + (v + e) * log, 0),
        n(v + e0 + (v + e) * log, 0),
        n(v + e0 + 2 * (v + e) * log, 0),
      ],
    ],
    "V = seluruh simpul; E0 = seluruh ruas berarah; E = ruas lolos constraint. Semua metode membangun graf dengan memindai E0. Binary heap menyimpan entri pengganti (lazy), sehingga log(E+1) dipakai sebagai batas konservatif. Hybrid melakukan dua pencarian; faktor 2 tidak mengubah kelas Big-O. Indeks skala hanya substitusi rumus dengan koefisien 1: bukan hitungan operasi aktual, byte, atau prediksi milidetik. Memori mencakup graf, bobot E0, array V dan antrean hingga O(E). A* dapat memeriksa lebih sedikit simpul tanpa mengubah kelas terburuk.",
  );
  const operations = table(
    "Operasi aktual pada run terakhir",
    ["Operasi", ...names],
    [
      byMethod("Simpul diperiksa", (r) => n(r.explored)),
      byMethod("Ruas dicek", (r) => n(r.stats.checked)),
      byMethod("Relaksasi berhasil", (r) => n(r.stats.relaxed)),
      byMethod("Heap masuk", (r) => n(r.stats.pushed)),
      byMethod("Heap keluar", (r) => n(r.stats.popped)),
      byMethod("Entri kedaluwarsa", (r) => n(r.stats.stale)),
      byMethod("Puncak isi heap", (r) => n(r.peak)),
      [
        "Simpul tahap balik / maju",
        "-",
        "-",
        `${n(results[0].reverseExplored)} / ${n(results[0].forwardExplored)}`,
      ],
    ],
    "Hybrid menjumlahkan operasi kedua tahap; simpul yang sama dapat dihitung dua kali. Puncak heap adalah maksimum kedua tahap karena berjalan bergantian. Big-O menyatakan pertumbuhan, sedangkan tabel ini menghitung pekerjaan yang terjadi pada skenario ini.",
  );
  const partition = table(
    "Penyaringan graf",
    ["Kategori eksklusif", "Jumlah ruas berarah"],
    [
      ["Akses kendaraan ditolak", n(denied)],
      ["Ditutup (setelah lolos akses)", n(closed)],
      ["Risiko berat dilarang mode aman (setelah lolos akses)", n(heavy)],
      ["Lolos akses dan risiko", n(allowed)],
      ["Total E0", n(e0)],
    ],
    `${n(denied)} + ${n(closed)} + ${n(heavy)} + ${n(allowed)} = ${n(e0)}. Akses diperiksa dahulu, lalu penutupan dan batas risiko. Ruas lolos belum tentu diperiksa pencarian atau dipakai rute akhir. Penyaringan O(V+E0); setiap ruas menjalani uji akses dan batas risiko yang sama bagi ketiga metode.`,
  );
  const constraints = table(
    "Constraint yang dievaluasi",
    ["Aturan", "Lolos", "Gagal", "Dasar"],
    [
      ["Akses kendaraan", n(e0 - denied), n(denied), "edge[8] bukan false"],
      [
        "Batas risiko ruas",
        n(riskPassed),
        n(e0 - riskPassed),
        `risiko <= ${maxRisk}; risiko 3 selalu dilarang`,
      ],
      [
        "Shelter operasional",
        n(shelterRows.filter((s) => s.active).length),
        n(shelterRows.filter((s) => !s.active).length),
        "Status operasional aktif",
      ],
      [
        "Tim medis",
        mission === "critical" ? n(shelterRows.filter((s) => s.medical).length) : "Tidak berlaku",
        mission === "critical" ? n(shelterRows.filter((s) => !s.medical).length) : "Tidak berlaku",
        "Wajib untuk pasien kritis",
      ],
      [
        "Kapasitas shelter",
        n(shelterRows.filter((s) => s.capacity).length),
        n(shelterRows.filter((s) => !s.capacity).length),
        mission === "food"
          ? "Penghuni < kapasitas normal"
          : mission === "critical"
            ? `${size} orang <= sisa normal + cadangan medis`
            : `${size} orang <= sisa normal`,
      ],
      [
        "Tujuan sesuai pilihan",
        n(shelterRows.filter((s) => s.selected).length),
        n(shelterRows.filter((s) => !s.selected).length),
        input.selectedTarget === "auto"
          ? "Semua shelter dipertimbangkan"
          : "Hanya shelter yang dipilih",
      ],
    ],
    "Lolos/gagal dihitung untuk setiap aturan secara independen; satu ruas atau shelter dapat gagal lebih dari satu aturan. Karena itu jumlah gagal antaraturn tidak boleh dijumlahkan sebagai jumlah objek unik. Tidak ada penalti risiko tambahan ke biaya waktu. Constraint memilih ruas dan tujuan yang layak.",
  );
  const sheltersTable = table(
    "Evaluasi shelter",
    ["Shelter", "Aktif", "Medis", "Kapasitas", "Tujuan", "Hasil"],
    shelterRows.map((s) => [
      s.name,
      s.active ? "Lolos" : "Gagal",
      mission === "critical" ? (s.medical ? "Lolos" : "Gagal") : "N/A",
      s.capacity ? `Lolos (${s.available} tempat)` : `Gagal (${s.available} tempat)`,
      s.selected ? "Sesuai" : "Tidak dipilih",
      s.eligible ? "Layak" : "Tidak layak",
    ]),
    "Pasien kritis dapat memakai cadangan medis. Pengungsi biasa hanya memakai kapasitas normal. Bantuan makanan mensyaratkan shelter aktif dengan penghuni di bawah kapasitas normal; tim medis tidak diwajibkan.",
  );
  const audit = table(
    "Audit rute terpilih",
    ["Pemeriksaan", "Hasil"],
    [
      ["Ruas rute yang melanggar akses/risiko", `${routeViolations} dari ${route.edges.length}`],
      ["Jumlah panjang ruas", `${n(distance)} m`],
      ["Jumlah biaya ruas", `${n(cumulative)} detik = ${n(cumulative / 60)} menit`],
      [
        "Selisih jumlah biaya dengan hasil algoritma",
        `${n(Math.abs(cumulative - route.seconds), 9)} detik`,
      ],
      [
        "Biaya ketiga metode sama (toleransi 0,000001 detik)",
        order.every((r) => Math.abs(r.seconds - route.seconds) < 1e-6) ? "Lolos" : "Gagal",
      ],
    ],
    "Biaya w(u,v) = panjang meter / (kecepatan km/jam / 3,6). Waktu perjalanan berasal dari jumlah biaya ruas, berbeda dari waktu komputasi dalam ms.",
  );
  const components = table(
    "Cara kerja ketiga metode",
    ["Komponen", ...names],
    [
      ["Prioritas", "f = g + h", "f = g; h = 0", "Dijkstra balik, lalu A* maju"],
      [
        "Heuristik h",
        "Jarak geografis / kecepatan maksimum",
        "Tidak dipakai",
        "Waktu sisa optimal dari Dijkstra balik",
      ],
      [
        "Biaya g",
        "Jumlah waktu ruas dari awal",
        "Jumlah waktu ruas dari awal",
        "Jumlah waktu ruas pada tahap maju",
      ],
      ["Constraint akses, risiko, shelter", "Sama", "Sama", "Sama"],
      ["DP / prediksi banjir langsung", "Tidak dipakai", "Tidak dipakai", "Tidak dipakai"],
    ],
  );
  const edgeTable = table(
    "Perhitungan seluruh ruas rute hybrid",
    ["#", "Jalan", "Meter", "km/jam", "Biaya detik", "Kumulatif detik"],
    routeRows,
    "g(v) = g(u) + w(u,v). Jalan yang optimal dapat berbeda antaralgoritma jika biaya totalnya sama. Pembulatan hanya untuk tampilan.",
    [0.06, 0.33, 0.12, 0.12, 0.17, 0.2],
  );
  const traces = order.map((r, i) =>
    table(
      `Jejak ${names[i]} (maksimal 60 simpul)`,
      ["#", "ID simpul", "g detik", "h detik", "f detik"],
      (r.trace || []).map((t, j) => [j + 1, data.nodes[t.node][0], n(t.g), n(t.h), n(t.f)]),
      "Simpul valid keluar dari antrean pada run terakhir; jejak bukan daftar rute akhir. Pada hybrid, jejak ini hanya tahap A* maju.",
    ),
  );
  const fastest = order.reduce((a, b) => (a.meanMs <= b.meanMs ? a : b));
  const summary = table(
    "Ringkasan perbandingan",
    ["Ukuran", ...names],
    [
      byMethod("Komputasi rata-rata", (r) => ms(r.meanMs)),
      byMethod("Waktu perjalanan", (r) => `${n(r.seconds / 60)} menit`),
      byMethod("Jarak rute", (r) => `${n(r.distance / 1000)} km`),
      byMethod("Simpul diperiksa", (r) => n(r.explored)),
    ],
  );
  return {
    counts,
    shelterRows,
    routeViolations,
    fastest: fastest.name,
    context: `${input.shelterName} | ${mode === "safe" ? "Mode aman" : "Mode darurat"} | ${mission === "critical" ? "Pasien kritis" : mission === "food" ? "Bantuan makanan" : "Pengungsi"}${mission === "food" ? "" : ` | ${size} orang`}`,
    origin: `${data.nodes[source][0]} (${data.nodes[source][1]}, ${data.nodes[source][2]})`,
    target: `${data.nodes[target][0]} (${data.nodes[target][1]}, ${data.nodes[target][2]})`,
    conclusion: `${fastest.name} memiliki rata-rata komputasi terendah pada pengukuran ini. Hasil biaya perjalanan ketiga metode diverifikasi sama.`,
    summary,
    times,
    samples,
    phases,
    complexity,
    operations,
    partition,
    constraints,
    sheltersTable,
    audit,
    components,
    edgeTable,
    traces,
  };
}

function erAnalysisTable(block) {
  return `<div class="table-wrap"><table><thead><tr>${block.headers.map((h) => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${escape(String(cell))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${block.note ? `<p class="er-analysis-note">${escape(block.note)}</p>` : ""}`;
}
function erAnalysisSnapshot() {
  if (!comparison || !comparisonDetails || preview?.kind !== "single") return null;
  const d = comparisonDetails;
  return erCreateAnalysisModel({
    data: DATA,
    changes: d.changes,
    results: comparison,
    route: d.route,
    source: d.source,
    target: d.target,
    mode: d.mode,
    shelters: state.shelters,
    mission: preview.mission,
    size: preview.size,
    selectedTarget: erGet("target").value,
    shelterName: d.shelter,
  });
}

function erInstallAnalysis() {
  const heading = erGet("er-analysis-title");
  heading.textContent = "Analisis perbandingan";
  const card = document.querySelector(".comparison-card");
  const exportButton = document.createElement("button");
  exportButton.id = "er-export-analysis";
  exportButton.className = "btn";
  exportButton.textContent = "Ekspor PDF";
  card.querySelector(".comparison-heading").append(exportButton);
  // Keep capacity and road lists available without overwhelming the comparison.
  const panel = document.querySelector("#er-analysis-content .right-panel");
  if (panel) {
    const details = document.createElement("details");
    details.className = "er-analysis-more";
    const title = document.createElement("summary");
    title.textContent = "Kapasitas shelter & kondisi jalan";
    details.append(title, panel);
    erGet("er-analysis-content").append(details);
  }
  const legacyBenchmark = renderBenchmark;
  renderBenchmark = function () {
    const model = erAnalysisSnapshot();
    if (!model) {
      erGet("benchmark").innerHTML =
        '<div class="er-analysis-empty"><h3>Bandingkan pada rute yang sama</h3><p>Tekan Hitung perbandingan untuk mengukur A*, Dijkstra, dan hybrid. Constraint, kompleksitas, dan waktu akan dihitung dari skenario aktif.</p></div>';
      return;
    }
    const fold = (title, body) =>
      `<details class="er-analysis-fold"><summary>${title}</summary><div>${body}</div></details>`;
    // Reuse the existing full g/h/f route calculation, rendered only on demand.
    erGet("benchmark").innerHTML =
      `<p class="er-analysis-context">${escape(model.context)}</p><div class="er-analysis-metrics"><div><span>Komputasi terendah</span><strong>${escape(model.fastest)}</strong></div><div><span>Ruas lolos constraint</span><strong>${erAnalysisNumber(model.counts.allowed)}</strong></div><div><span>Pelanggaran rute</span><strong>${model.routeViolations}</strong></div></div>${erAnalysisTable(model.summary)}<p class="er-analysis-conclusion">${escape(model.conclusion)}</p>` +
      fold(
        "1. Waktu komputasi",
        erAnalysisTable(model.times) +
          `<h4>${model.samples.title}</h4>` +
          erAnalysisTable(model.samples) +
          model.phases.map((b) => `<h4>${escape(b.title)}</h4>${erAnalysisTable(b)}`).join(""),
      ) +
      fold(
        "2. Kompleksitas & operasi",
        erAnalysisTable(model.complexity) +
          `<h4>${model.operations.title}</h4>` +
          erAnalysisTable(model.operations),
      ) +
      fold(
        "3. Constraint jalan & shelter",
        erAnalysisTable(model.partition) +
          erAnalysisTable(model.constraints) +
          erAnalysisTable(model.sheltersTable) +
          erAnalysisTable(model.audit),
      ) +
      fold(
        "4. Rumus & audit rute",
        erAnalysisTable(model.components) +
          `<button type="button" class="btn" id="er-load-route-audit">Tampilkan perhitungan g, h, f tiap ruas</button><div id="er-route-audit"></div>`,
      );
    erGet("er-load-route-audit").onclick = () => {
      const box = erGet("benchmark"),
        content = box.innerHTML;
      legacyBenchmark();
      const audits = [...box.querySelectorAll(":scope > details")]
        .slice(3)
        .map((el) => el.outerHTML)
        .join("");
      box.innerHTML = content;
      erGet("er-route-audit").innerHTML = audits;
      erGet("er-load-route-audit").remove();
      // The audit trigger rebuilds markup; keep the currently requested fold open.
      [...box.querySelectorAll(":scope > details")].at(-1).open = true;
    };
  };
  const originalBusy = setBusy;
  setBusy = function (value) {
    originalBusy(value);
    exportButton.disabled = value;
    erGet("er-share").disabled = value;
  };
  erGet("er-share").textContent = "Ekspor PDF";
  erGet("er-share").onclick = erExportAnalysisPdf;
  erGet("export").onclick = erExportAnalysisPdf;
  exportButton.onclick = erExportAnalysisPdf;
  renderBenchmark();
}

function erAnalysisReportBlocks(model) {
  return [
    {
      title: "Laporan analisis EvacRoute",
      text: `Dibuat ${new Date().toLocaleString("id-ID")}. ${model.context}`,
    },
    {
      text: `Titik awal OSM: ${model.origin}. Tujuan OSM: ${model.target}. Data: OpenStreetMap; kapasitas, risiko, dan kecepatan adalah parameter simulasi.`,
    },
    model.summary,
    { text: model.conclusion },
    model.times,
    model.samples,
    ...model.phases,
    model.complexity,
    model.operations,
    model.partition,
    model.constraints,
    model.sheltersTable,
    model.audit,
    model.components,
    model.edgeTable,
    ...model.traces,
    {
      title: "Metode dan batas interpretasi",
      text: "A*, Dijkstra dan hybrid memakai titik awal, tujuan, biaya waktu, akses serta batas risiko yang sama. Semua metode diinstrumentasi. Benchmark dijalankan berurutan, bukan bersamaan; tidak mengisolasi JIT, garbage collection, suhu perangkat atau proses browser. Pemanasan tidak dimasukkan ke statistik. Angka waktu bukan jaminan kinerja pada perangkat lain. Risiko menyaring ruas, tidak mengubah biaya kecuali kecepatan disunting. Tidak memakai prediksi banjir atau lalu lintas langsung. DP alokasi kelompok tidak dipakai dalam benchmark ini. Dataset OpenStreetMap: https://www.openstreetmap.org/copyright",
    },
  ];
}

// Small offline PDF writer: searchable text, repeated table headers and A4 pagination.
// The PDF standard fonts cover the report's Indonesian text; symbols are transliterated.
function erBuildAnalysisPdf(blocks) {
  const ascii = (value) =>
    String(value)
      .replace(/→/g, " -> ")
      .replace(/÷/g, "/")
      .replace(/×/g, "x")
      .replace(/≤/g, "<=")
      .replace(/[–—−]/g, "-")
      .replace(/·/g, " | ")
      .normalize("NFKD")
      .replace(/[^\x20-\x7e\n]/g, "");
  const literal = (value) => ascii(value).replace(/([\\()])/g, "\\$1");
  const pages = [];
  let commands = [],
    y = 790;
  const width = 499,
    left = 48,
    bottom = 56;
  const text = (value, x, baseline, size = 10, bold = false) =>
    commands.push(
      `BT /${bold ? "F2" : "F1"} ${size} Tf 0.075 0.094 0.129 rg 1 0 0 1 ${x.toFixed(2)} ${baseline.toFixed(2)} Tm (${literal(value)}) Tj ET`,
    );
  // Conservative proportional-font widths avoid clipped words even in narrow cells.
  const measure = (value, size) =>
    [...value].reduce(
      (sum, ch) =>
        sum +
        ("MW@%".includes(ch)
          ? 0.9
          : "il.,:;!|' ".includes(ch)
            ? 0.28
            : /[A-Z0-9]/.test(ch)
              ? 0.67
              : 0.57) *
          size,
      0,
    );
  function wrap(value, available, size) {
    const lines = [];
    for (const paragraph of ascii(value).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (measure(word, size) > available) {
          if (line) {
            lines.push(line);
            line = "";
          }
          let chunk = "";
          for (const ch of word) {
            if (measure(chunk + ch, size) > available) {
              lines.push(chunk);
              chunk = "";
            }
            chunk += ch;
          }
          line = chunk;
        } else if (line && measure(line + " " + word, size) > available) {
          lines.push(line);
          line = word;
        } else line += (line ? " " : "") + word;
      }
      lines.push(line);
    }
    return lines;
  }
  function finish() {
    text("EvacRoute | Analisis simulasi", left, 28, 9);
    text(`Halaman ${pages.length + 1}`, 475, 28, 9);
    pages.push(commands.join("\n"));
    commands = [];
    y = 790;
  }
  function ensure(height) {
    if (y - height < bottom) finish();
  }
  function paragraph(value, size = 10, bold = false) {
    for (const line of wrap(value, width, size)) {
      ensure(size + 5);
      text(line, left, y, size, bold);
      y -= size + 5;
    }
    y -= 7;
  }
  for (const block of blocks) {
    if (block.title) {
      let minimum = 74;
      if (block.headers && block.rows.length) {
        const weights = block.widths || block.headers.map((_, i) => (i === 0 ? 1.65 : 1));
        const sum = weights.reduce((a, b) => a + b, 0);
        const rowHeight = (cells) =>
          Math.max(
            ...cells.map((cell, i) => wrap(cell, (width * weights[i]) / sum - 12, 9).length),
          ) *
            12 +
          14;
        minimum =
          wrap(block.title, width, 14).length * 19 +
          7 +
          rowHeight(block.headers) +
          rowHeight(block.rows[0]);
      }
      ensure(minimum);
      paragraph(block.title, 14, true);
    }
    if (block.text) paragraph(block.text);
    if (block.headers) {
      const weights = block.widths || block.headers.map((_, i) => (i === 0 ? 1.65 : 1));
      const sum = weights.reduce((a, b) => a + b, 0),
        widths = weights.map((w) => (width * w) / sum);
      function row(cells, header = false) {
        const lines = cells.map((cell, i) => wrap(cell, widths[i] - 12, header ? 9 : 9));
        const height = Math.max(...lines.map((l) => l.length)) * 12 + 14;
        if (y - height < bottom) {
          finish();
          if (!header) row(block.headers, true);
        }
        let x = left;
        commands.push(
          `${header ? "0.92 0.94 0.97" : "0.985 0.985 0.985"} rg ${left} ${(y - height + 3).toFixed(2)} ${width} ${height} re f`,
        );
        lines.forEach((items, i) => {
          items.forEach((line, j) => text(line, x + 6, y - 10 - j * 12, 9, header));
          x += widths[i];
        });
        y -= height;
      }
      row(block.headers, true);
      block.rows.forEach((r) => row(r));
      y -= 10;
    }
    if (block.note) paragraph(block.note, 9);
    y -= 7;
  }
  if (commands.length) finish();
  const objects = [
    null,
    "<< /Type /Catalog /Pages 2 0 R >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  const pageIds = [];
  for (const stream of pages) {
    const pageId = objects.length,
      contentId = pageId + 1;
    pageIds.push(pageId);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects[2] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  let pdf = "%PDF-1.4\n",
    offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf +=
    `xref\n0 ${objects.length}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
      .join("");
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

async function erExportAnalysisPdf() {
  if (busy) return;
  try {
    if (!comparison) await compare();
    const model = erAnalysisSnapshot();
    if (!model) throw Error("Tentukan rute yang dapat dilalui sebelum mengekspor analisis.");
    const bytes = erBuildAnalysisPdf(erAnalysisReportBlocks(model));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `EvacRoute_Analisis_${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    notice("PDF analisis berhasil dibuat.");
  } catch (error) {
    notice(error.message, true);
  }
}
