# DSH Better DeepSeek Bridge

**Plugin DeepSeek Harness (DSH) untuk menghubungkan ekstensi browser [Better DeepSeek](https://github.com/EdgeTypE/better-deepseek) dengan sesi agent DSH.**

Repo ini merupakan port yang merekonsiliasi [EdgeTypE/dsh-better-deepseek](https://github.com/EdgeTypE/dsh-better-deepseek) untuk target versi **`0.2.1-rc.2`**. Bridge lokal ini menyediakan endpoint HTTP dan aliran event SSE agar ekstensi browser dapat membuat sesi agent, mengirim prompt, menerima progres, mengambil jawaban terbaru, serta membatalkan tugas.

> **Status versi:** `0.2.1-rc.2` adalah target rilis kandidat yang diminta. Commit di GitHub tidak otomatis berarti paket dengan versi ini sudah diterbitkan ke npm. Instalasi melalui registry hanya akan berhasil setelah versi tersebut benar-benar dipublikasikan.

## Fitur utama

- Menghubungkan ekstensi Better DeepSeek ke DSH Web profile.
- Membuat sesi agent DSH dengan direktori kerja tertentu.
- Mengirim prompt ke sesi yang sudah dibuat.
- Mengirim event jawaban assistant dan aktivitas tool melalui Server-Sent Events (SSE).
- Mengambil status sesi dan teks assistant terbaru.
- Meminta pembatalan tugas yang sedang berjalan.
- Mendukung preflight CORS untuk permintaan dari ekstensi browser.

## Panduan pemula: memasang di DSH

### 1. Siapkan kebutuhan

Pastikan Anda sudah memiliki:

- **Node.js 20 atau lebih baru**.
- DSH CLI yang dapat dijalankan dari terminal.
- DSH Web profile yang sudah diinisialisasi.
- Ekstensi [Better DeepSeek](https://github.com/EdgeTypE/better-deepseek) jika ingin menggunakan integrasi browser.

Untuk memulai DSH Web profile, jalankan:

```bash
npx @deepseek-ai/dsh web
```

Biarkan server berjalan, lalu buka terminal lain untuk perintah berikutnya.

### 2. Instal dari registry DSH/npm

Setelah versi `0.2.1-rc.2` tersedia di registry, jalankan:

```bash
dsh plugin --profile web add dsh-better-deepseek@0.2.1-rc.2
```

Jika perintah `dsh` tidak terpasang secara global, gunakan:

```bash
npx @deepseek-ai/dsh plugin --profile web add dsh-better-deepseek@0.2.1-rc.2
```

Setelah instalasi, restart proses DSH Web agar plugin dimuat. Cara restart bergantung pada cara Anda menjalankan DSH; bila memakai terminal biasa, hentikan proses dengan `Ctrl+C`, kemudian jalankan kembali:

```bash
npx @deepseek-ai/dsh web
```

**Catatan penting:** perintah registry di atas belum bisa digunakan sebelum paket versi tersebut diterbitkan. Repo GitHub ini sendiri bukan publikasi npm.

### 3. Ambil source untuk pengembangan

Untuk melihat atau mengembangkan source code:

```bash
git clone https://github.com/mulqizamzam/dsh-better-deepseek.git
cd dsh-better-deepseek
```

Paket ini menggunakan dependensi internal/workspace DSH, seperti Cordis, DSH Agent, DSH Web Server, dan Schemastery. Jadi, menjalankan `npm install` langsung di repo ini belum cukup untuk menjalankan plugin sebagai aplikasi mandiri. Pengujian runtime perlu dilakukan di checkout/workspace DSH yang menyediakan versi dependensi yang kompatibel.

Jangan memasang source ke instalasi yang sedang dipakai tanpa backup dan tanpa memeriksa konfigurasi profile terlebih dahulu.

## 4. Pastikan bridge aktif

Setelah plugin berhasil dimuat dan DSH Web server berjalan, buka URL berikut di browser:

```text
http://127.0.0.1:PORT/api/better-deepseek/ping
```

Ganti `PORT` dengan port yang dikonfigurasi untuk DSH Web profile Anda. Respons yang sehat adalah JSON yang memuat `"active": true`, versi bridge, dan daftar kapabilitas.

Jika endpoint tidak dapat dibuka, pastikan DSH Web aktif, plugin terpasang di profile `web`, dan nomor port sudah benar.

## Endpoint HTTP

Semua endpoint berada di bawah prefix `/api/better-deepseek`.

| Endpoint | Metode | Fungsi |
|---|---|---|
| `/ping` | GET | Health check dan handshake kapabilitas |
| `/events` | GET | Stream event SSE untuk jawaban assistant dan pemanggilan tool |
| `/session.create` | POST | Membuat sesi agent dengan direktori kerja |
| `/session.prompt` | POST | Mengirim prompt ke sesi agent |
| `/session.result` | GET | Mengambil status sesi dan teks assistant terbaru |
| `/session.cancel` | POST | Meminta pembatalan tugas sesi |

Endpoint POST menerima JSON sesuai protokol bridge yang digunakan oleh ekstensi Better DeepSeek. Untuk membuat klien kustom, periksa kode integrasi ekstensi dan implementasi plugin terlebih dahulu.

## Konfigurasi

File `cordis.patch.yml` mengaktifkan layanan dengan konfigurasi berikut:

| Opsi | Default | Keterangan |
|---|---|---|
| `enableCors` | `true` | Menambahkan header CORS agar permintaan ekstensi browser dapat diterima |

## Keamanan jaringan

Secara default, bridge mengizinkan origin lintas-domain dengan `Access-Control-Allow-Origin: *` agar kompatibel dengan ekstensi browser. Ini memudahkan integrasi lokal, tetapi **bukan mekanisme autentikasi**.

- Jalankan DSH di loopback/localhost kecuali Anda benar-benar membutuhkan akses jaringan lain.
- Jangan mengekspos DSH Web server ke internet atau jaringan yang tidak tepercaya.
- Jangan mengatasi masalah koneksi dengan membuka port ke publik.
- Tinjau konfigurasi CORS, browser extension, proxy, dan firewall sebelum mengaktifkan akses jarak jauh.

Bridge ini tidak menambahkan lapisan autentikasi tersendiri pada endpoint yang didokumentasikan.

## Pemecahan masalah

**Perintah instalasi tidak menemukan paket atau versi.**  
Pastikan paket `dsh-better-deepseek@0.2.1-rc.2` telah tersedia di registry. Jika belum diterbitkan, instalasi registry memang belum bisa dilakukan.

**Endpoint `/ping` tidak merespons.**  
Periksa apakah DSH Web sedang berjalan, plugin masuk ke profile `web`, dan URL memakai port yang benar.

**Ekstensi browser tidak bisa tersambung.**  
Pastikan ekstensi aktif, alamat host/port cocok dengan server DSH, dan header CORS tidak diubah oleh proxy. Jangan membuka server DSH ke jaringan publik hanya untuk melewati masalah konektivitas.

**Prompt atau pembatalan menghasilkan “Session not found”.**  
Keduanya memerlukan `sessionId` yang dikembalikan oleh endpoint `session.create`. Buat sesi baru dan gunakan ID yang benar dari respons tersebut.

## Pengembangan dan validasi

Source mencakup layanan TypeScript, entry-point runtime JavaScript, konfigurasi Cordis, companion invariant, dan tes untuk handshake, CORS preflight, serta endpoint SSE. Sebelum rilis:

1. Pastikan source TypeScript dan entry-point runtime konsisten.
2. Jalankan tes di lingkungan DSH yang cocok dengan dependensi workspace.
3. Uji integrasi dengan ekstensi browser pada profile lokal.
4. Pastikan versi package, versi handshake, dan changelog selaras.
5. Periksa konfigurasi jaringan dan risiko CORS sebelum deployment.

Tes yang disimpan di repository belum berarti telah dijalankan pada runtime DSH untuk commit ini.

## Proyek terkait dan atribusi

- **Port:** [mulqizamzam/dsh-better-deepseek](https://github.com/mulqizamzam/dsh-better-deepseek)
- **Source upstream:** [EdgeTypE/dsh-better-deepseek](https://github.com/EdgeTypE/dsh-better-deepseek)
- **Ekstensi browser:** [EdgeTypE/better-deepseek](https://github.com/EdgeTypE/better-deepseek)

Port ini mempertahankan alur integrasi bridge upstream dengan dokumentasi instalasi dan batasan rilis yang lebih eksplisit. Source upstream menyatakan lisensi MIT; pertahankan pemberitahuan lisensi dan atribusi yang berlaku saat redistribusi.

## Lisensi

Lihat file [LICENSE](./LICENSE).
