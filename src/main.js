const { invoke } = window.__TAURI__.core;

// ========== STATE ==========
let currentCsvData = [];
let sekolahData = null;

// ========== INIT ==========
document.addEventListener("DOMContentLoaded", async () => {
  // Set default tanggal hari ini
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("tanggal").value = today;
  document.getElementById("tahun_anggaran").value = new Date()
    .getFullYear()
    .toString();

  // Load data sekolah
  await loadSekolah();
});

// ========== NAVIGATION ==========
window.showPage = function (pageName) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));

  document.getElementById(`page-${pageName}`).classList.add("active");
  document
    .querySelector(`.nav-btn[data-page="${pageName}"]`)
    ?.classList.add("active");

  if (pageName === "riwayat") loadRiwayat();
  if (pageName === "sekolah") loadSekolahForm();
};

// ========== SEKOLAH ==========
async function loadSekolah() {
  try {
    sekolahData = await invoke("cmd_get_sekolah");
  } catch (e) {
    console.error("Gagal load sekolah:", e);
  }
}

async function loadSekolahForm() {
  await loadSekolah();
  if (sekolahData) {
    document.getElementById("s_id").value = sekolahData.id || "";
    document.getElementById("s_nama").value = sekolahData.nama_sekolah || "";
    document.getElementById("s_alamat").value = sekolahData.alamat || "";
    document.getElementById("s_kota").value = sekolahData.kota || "";
    document.getElementById("s_kepala").value = sekolahData.kepala_sekolah || "";
    document.getElementById("s_nip_kepala").value = sekolahData.nip_kepala || "";
    document.getElementById("s_bendahara").value = sekolahData.bendahara || "";
    document.getElementById("s_nip_bendahara").value =
      sekolahData.nip_bendahara || "";
  }
}

window.handleSimpanSekolah = async function (e) {
  e.preventDefault();
  try {
    const data = {
      id: parseInt(document.getElementById("s_id").value) || 1,
      nama_sekolah: document.getElementById("s_nama").value,
      alamat: document.getElementById("s_alamat").value,
      kota: document.getElementById("s_kota").value,
      kepala_sekolah: document.getElementById("s_kepala").value,
      nip_kepala: document.getElementById("s_nip_kepala").value,
      bendahara: document.getElementById("s_bendahara").value,
      nip_bendahara: document.getElementById("s_nip_bendahara").value,
    };
    await invoke("cmd_update_sekolah", { sekolah: data });
    sekolahData = data;
    showToast("Data sekolah berhasil disimpan", "success");
  } catch (e) {
    showToast("Gagal menyimpan: " + e, "error");
  }
  return false;
};

// ========== KWITANSI INPUT ==========
window.handleJumlahInput = async function (el) {
  // Remove non-digit chars for parsing
  let raw = el.value.replace(/[^\d]/g, "");
  if (raw === "") {
    document.getElementById("terbilang_preview").value = "";
    return;
  }

  // Format display with dots
  let formatted = parseInt(raw).toLocaleString("id-ID");
  el.value = formatted;

  // Get terbilang from Rust
  try {
    const jumlah = parseInt(raw);
    const result = await invoke("cmd_terbilang", { jumlah: jumlah });
    document.getElementById("terbilang_preview").value = result;
  } catch (e) {
    console.error(e);
  }
};

window.handleSimpanKwitansi = async function (e) {
  e.preventDefault();

  // Auto-fill dari data sekolah jika kosong
  const mengetahui =
    document.getElementById("mengetahui").value ||
    (sekolahData ? sekolahData.kepala_sekolah : "");
  const nipMengetahui =
    document.getElementById("nip_mengetahui").value ||
    (sekolahData ? sekolahData.nip_kepala : "");
  const bendahara =
    document.getElementById("bendahara").value ||
    (sekolahData ? sekolahData.bendahara : "");
  const nipBendahara =
    document.getElementById("nip_bendahara").value ||
    (sekolahData ? sekolahData.nip_bendahara : "");

  const jumlahRaw = document
    .getElementById("jumlah")
    .value.replace(/[^\d]/g, "");

  const kwitansi = {
    id: null,
    nomor_kwitansi: document.getElementById("nomor_kwitansi").value,
    tanggal: document.getElementById("tanggal").value,
    sudah_terima_dari: document.getElementById("sudah_terima_dari").value,
    jumlah: parseFloat(jumlahRaw) || 0,
    terbilang: "",
    untuk_pembayaran: document.getElementById("untuk_pembayaran").value,
    kode_rekening: document.getElementById("kode_rekening").value,
    tahun_anggaran: document.getElementById("tahun_anggaran").value,
    mengetahui: mengetahui,
    nip_mengetahui: nipMengetahui,
    bendahara: bendahara,
    nip_bendahara: nipBendahara,
    penerima: document.getElementById("penerima").value,
    created_at: null,
  };

  try {
    const id = await invoke("cmd_simpan_kwitansi", { kwitansi: kwitansi });
    showToast("Kwitansi berhasil disimpan", "success");

    // Load and show preview
    const saved = await invoke("cmd_get_kwitansi", { id: id });
    showPrintPreview(saved);
  } catch (e) {
    showToast("Gagal menyimpan: " + e, "error");
  }

  return false;
};

window.resetForm = function () {
  document.getElementById("form-kwitansi").reset();
  document.getElementById("terbilang_preview").value = "";
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("tanggal").value = today;
  document.getElementById("tahun_anggaran").value = new Date()
    .getFullYear()
    .toString();
};

// ========== RIWAYAT ==========
async function loadRiwayat() {
  try {
    const data = await invoke("cmd_get_all_kwitansi");
    renderTable(data);
  } catch (e) {
    showToast("Gagal memuat data: " + e, "error");
  }
}

function renderTable(data) {
  const tbody = document.getElementById("tbody-kwitansi");
  if (data.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="empty">Belum ada data kwitansi</td></tr>';
    return;
  }

  tbody.innerHTML = data
    .map(
      (k, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(k.nomor_kwitansi)}</td>
      <td>${formatTanggal(k.tanggal)}</td>
      <td>${esc(k.sudah_terima_dari)}</td>
      <td class="rupiah">Rp ${formatRupiah(k.jumlah)}</td>
      <td>${esc(k.untuk_pembayaran.substring(0, 50))}${k.untuk_pembayaran.length > 50 ? "..." : ""}</td>
      <td>
        <div class="actions">
          <button class="btn btn-sm btn-primary" onclick="previewKwitansi(${k.id})">Cetak</button>
          <button class="btn btn-sm btn-danger" onclick="hapusKwitansi(${k.id})">Hapus</button>
        </div>
      </td>
    </tr>
  `
    )
    .join("");
}

window.handleSearch = async function (query) {
  try {
    if (query.trim() === "") {
      await loadRiwayat();
    } else {
      const data = await invoke("cmd_search_kwitansi", { query: query });
      renderTable(data);
    }
  } catch (e) {
    console.error(e);
  }
};

window.hapusKwitansi = async function (id) {
  if (!confirm("Yakin ingin menghapus kwitansi ini?")) return;
  try {
    await invoke("cmd_delete_kwitansi", { id: id });
    showToast("Kwitansi dihapus", "success");
    await loadRiwayat();
  } catch (e) {
    showToast("Gagal menghapus: " + e, "error");
  }
};

window.previewKwitansi = async function (id) {
  try {
    const k = await invoke("cmd_get_kwitansi", { id: id });
    showPrintPreview(k);
  } catch (e) {
    showToast("Gagal memuat kwitansi: " + e, "error");
  }
};

// ========== CSV IMPORT ==========
window.handleFileUpload = async function (event) {
  const file = event.target.files[0];
  if (!file) return;

  const text = await file.text();

  try {
    currentCsvData = await invoke("cmd_parse_csv", { content: text });
    document.getElementById("csv-count").textContent = currentCsvData.length;

    // Fill import settings from sekolah data
    if (sekolahData) {
      document.getElementById("import_mengetahui").value =
        sekolahData.kepala_sekolah || "";
      document.getElementById("import_nip_mengetahui").value =
        sekolahData.nip_kepala || "";
      document.getElementById("import_bendahara").value =
        sekolahData.bendahara || "";
      document.getElementById("import_nip_bendahara").value =
        sekolahData.nip_bendahara || "";
    }

    // Render preview
    const csvTbody = document.getElementById("csv-tbody");
    csvTbody.innerHTML = currentCsvData
      .map(
        (r) => `
      <tr>
        <td>${esc(r.nomor_kwitansi)}</td>
        <td>${esc(r.tanggal)}</td>
        <td>${esc(r.sudah_terima_dari)}</td>
        <td class="rupiah">Rp ${formatRupiah(r.jumlah)}</td>
        <td>${esc(r.untuk_pembayaran)}</td>
        <td>${esc(r.kode_rekening)}</td>
        <td>${esc(r.penerima)}</td>
      </tr>
    `
      )
      .join("");

    document.getElementById("import-settings").classList.remove("hidden");
    document.getElementById("csv-preview").classList.remove("hidden");
    showToast(`${currentCsvData.length} baris data siap diimport`, "success");
  } catch (e) {
    showToast("Gagal parsing CSV: " + e, "error");
  }
};

window.handleImportCsv = async function () {
  if (currentCsvData.length === 0) {
    showToast("Tidak ada data untuk diimport", "warning");
    return;
  }

  try {
    const count = await invoke("cmd_import_csv", {
      rows: currentCsvData,
      tahunAnggaran: document.getElementById("import_tahun").value,
      mengetahui: document.getElementById("import_mengetahui").value,
      nipMengetahui: document.getElementById("import_nip_mengetahui").value,
      bendahara: document.getElementById("import_bendahara").value,
      nipBendahara: document.getElementById("import_nip_bendahara").value,
    });
    showToast(`${count} kwitansi berhasil diimport`, "success");
    resetImport();
    showPage("riwayat");
  } catch (e) {
    showToast("Gagal import: " + e, "error");
  }
};

window.resetImport = function () {
  currentCsvData = [];
  document.getElementById("csv-file").value = "";
  document.getElementById("import-settings").classList.add("hidden");
  document.getElementById("csv-preview").classList.add("hidden");
};

window.downloadTemplateCsv = function () {
  const header =
    "nomor_kwitansi,tanggal,sudah_terima_dari,jumlah,untuk_pembayaran,kode_rekening,penerima";
  const sample =
    '001/KWT/2026,2026-01-15,Bendahara BOS,1500000,Pembelian ATK untuk kegiatan belajar mengajar,5.1.02.01.01.0001,Toko Makmur Jaya';
  const csv = header + "\n" + sample + "\n";
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "template_kwitansi.csv";
  a.click();
  URL.revokeObjectURL(url);
};

// ========== PRINT PREVIEW & CETAK ==========
function showPrintPreview(k) {
  const container = document.getElementById("print-container");
  container.innerHTML = renderKwitansiTemplate(k);
  showPage("print");
}

function renderKwitansiTemplate(k) {
  const tgl = formatTanggalPanjang(k.tanggal);

  return `
    <div class="kwitansi-page">
      <div class="kwitansi-header">
        <div class="merk">Silver Horse</div>
        <h2>KWITANSI</h2>
        <div class="nomor">No: ${esc(k.nomor_kwitansi)}</div>
      </div>

      <div class="kwitansi-meta">
        <span>Tahun Anggaran: ${esc(k.tahun_anggaran)}</span>
        <span>Kode Rekening: ${esc(k.kode_rekening)}</span>
      </div>

      <div class="kwitansi-body">
        <div class="kwitansi-row">
          <span class="kwitansi-label">Sudah terima dari</span>
          <span class="kwitansi-sep">:</span>
          <span class="kwitansi-value">${esc(k.sudah_terima_dari)}</span>
        </div>

        <div class="kwitansi-row">
          <span class="kwitansi-label">Uang sejumlah</span>
          <span class="kwitansi-sep">:</span>
          <span class="kwitansi-value terbilang">${esc(capitalize(k.terbilang))}</span>
        </div>

        <div class="kwitansi-row">
          <span class="kwitansi-label">Untuk pembayaran</span>
          <span class="kwitansi-sep">:</span>
          <span class="kwitansi-value">${esc(k.untuk_pembayaran)}</span>
        </div>

        <div style="text-align: right; margin-top: 5mm;">
          <div class="kwitansi-jumlah-box">Rp ${formatRupiah(k.jumlah)}</div>
        </div>
      </div>

      <div class="kwitansi-footer">
        <div class="kwitansi-ttd">
          <div class="label">Mengetahui,</div>
          <div class="nama">${esc(k.mengetahui)}</div>
          <div class="nip">NIP. ${esc(k.nip_mengetahui)}</div>
        </div>

        <div class="kwitansi-ttd" style="text-align: center;">
          <div class="label">${esc(tgl)}</div>
          <div class="label">Yang Menerima,</div>
          <div class="nama">${esc(k.penerima)}</div>
        </div>

        <div class="kwitansi-ttd">
          <div class="label">Bendahara,</div>
          <div class="nama">${esc(k.bendahara)}</div>
          <div class="nip">NIP. ${esc(k.nip_bendahara)}</div>
        </div>
      </div>

      <div class="kwitansi-stamp">Materai</div>
    </div>
  `;
}

window.cetakKwitansi = function () {
  window.print();
};

// ========== UTILITIES ==========
function formatRupiah(num) {
  return Math.round(num)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatTanggal(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTanggalPanjang(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function esc(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add("hidden"), 3000);
}
