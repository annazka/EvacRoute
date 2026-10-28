# EvacRoute

Interface prototipe evakuasi banjir berdasarkan desain Figma, dengan mesin pencarian hybrid Dijkstra terbalik dan A* dari prototipe sebelumnya.

## Buka langsung

Buka **EvacRoute_Optimized.html** (atau **EvacRoute_Standalone.html**) di browser. Semua aset, font, dan data peta telah disertakan dalam satu file. Server dan koneksi internet tidak diperlukan untuk simulasi.

## Edit sumber

- `EvacRoute.html`: markup, data jalan, algoritma, dan logika simulasi.
- `evacroute-performance.js`: cache peta, indeks spasial ruas, worker pencarian dan benchmark, serta daftar ruas per halaman.
- `evacroute-ui.js`: interface Figma, pilihan kebutuhan, tujuan, hasil, dan penghubung ke logika simulasi.
- `evacroute.css`: warna, tipografi, tata letak desktop dan ponsel.
- `assets/figma/`: aset SVG asli dari Figma.
- `assets/fonts/`: font Plus Jakarta Sans beserta lisensinya.

Format kode memakai Prettier, indentasi 2 spasi dan lebar baris 100 karakter.

Jalankan `node build.mjs` setelah mengedit sumber untuk memperbarui versi satu file. Jalankan `node verify.mjs` untuk memeriksa sintaks, kesetaraan biaya ketiga algoritma pada 12 skenario, kelayakan shelter, serta data dan aset versi satu file.

## Penggunaan

Pilih titik jemput pada peta, jenis kebutuhan, jumlah orang, tujuan shelter, dan batas risiko. Tekan **Cari rute evakuasi**. Tombol **Mulai evakuasi** mengonfirmasi simulasi dan memperbarui penghuni shelter satu kali. **Analisis algoritma** menampilkan perhitungan A*, Dijkstra, hybrid, kapasitas pengungsian, dan kondisi ruas. **Pengaturan** hanya memuat Jalan Terhalang (skenario acak) dan Pengaturan Shelter.

Kapasitas, fasilitas, risiko, dan kecepatan adalah data simulasi. Cadangan medis tetap dibatasi kapasitas. Petunjuk jalan merangkum urutan ruas, bukan instruksi navigasi kendaraan yang diverifikasi di lapangan. Akun relawan pada interface adalah label mode latihan; tidak ada autentikasi atau data pribadi yang dikirim.

## Referensi dan atribusi

- Desain: https://www.figma.com/design/BQS2P09rJeij6BeqmD51tY/Untitled?node-id=1-140
- Peta: © OpenStreetMap contributors, ODbL — https://www.openstreetmap.org/copyright
- Font: Plus Jakarta Sans, SIL Open Font License; lihat `assets/fonts/OFL.txt`.

Peta memakai enam lapisan jalan SVG asli dari desain. Risiko, penanda shelter, titik awal, dan rute digambar dari keadaan simulasi saat ini. Angka pada layar selalu mengikuti data aktual prototipe, bukan angka contoh dalam Figma.

Setelah rute ditemukan, peta otomatis menyesuaikan zoom dan posisi agar seluruh rute, titik jemput, dan tujuan terlihat tanpa tertutup sidebar atau legenda. Transisi menghormati pengaturan reduced motion. Pada ponsel, layar kembali ke area peta. Tombol fokus dapat mengembalikan tampilan rute setelah pan/zoom manual; membuka detail tidak mengubah kamera.

## Optimasi performa

Peta menggunakan raster cache yang dipakai ulang selama pan/zoom. Setelah kamera berhenti, detail digambar ulang secara tajam saat browser memiliki waktu luang. Marker tetap memakai elemen DOM yang sama dan berpindah menggunakan transform. Pencarian ruas memakai grid spasial, bukan memindai seluruh jaringan pada setiap gerakan pointer.

Pencarian rute, alternatif tujuan, dan benchmark A*/Dijkstra/hybrid berjalan di satu Web Worker memakai koordinat dan panjang ruas yang dikirim sebagai buffer numerik. Ketiga metode benchmark tetap menerima kondisi yang sama, satu pemanasan, dan sepuluh pengukuran. Bila browser tidak mendukung worker, aplikasi menggunakan mesin semula. Penghitungan yang kedaluwarsa dibatalkan dan tidak boleh mengganti hasil skenario baru.

Daftar jalan terhalang dibuka saat diperlukan dan menampilkan 100 baris per halaman. Mengubah penghuni shelter tidak membangun ulang gambar jaringan jalan.

Jalankan `node verify-performance.mjs` untuk memeriksa kesamaan ruas dan biaya hasil worker, benchmark 30 pengukuran, pembatalan/fallback worker, dan 64 pemeriksaan ruas terdekat. Hasil tersimpan di `verification-performance.json`. Pengukuran render lokal sebelum/sesudah tersedia di `performance-comparison.json`: waktu CPU menggambar, bukan jaminan FPS pada perangkat lain. Diagnostik lokal dapat diaktifkan dengan `?perf=1`; tidak ada telemetri yang dikirim keluar.
