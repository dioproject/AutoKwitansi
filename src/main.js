import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { isBpu, loadPosSettings as loadPosSettingsMod, getPosSettings, cetakNotaPos, cetakPosThermal, cetakPosBrowser } from "./pos.js";
import { needsDocuments, loadDocStatus, allDocsComplete } from "./bpu-docs.js";
import "./bku-period.js";

// ========== HELPER: LABEL NOMOR CETAK ==========
function labelNomorCetak(nomor) {
  const upper = (nomor || "").toUpperCase();
  if (upper.includes("BNU")) return "BNU";
  if (upper.includes("BPU")) return "BPU";
  return nomor || "";
}

function isBnu(nomor) {
  return (nomor || "").trim().toUpperCase().includes("BNU");
}

// ========== STATE ==========
let currentCsvData = [];
let currentBkuData = null;
let sekolahData = null;
let currentPrintSettings = null;
let currentRiwayatData = [];
let selectedKwitansiIds = new Set();
let lastPreviewData = null;
let previewAutoRefreshTimer = null;

window._sekolahData = null;
window._showPage = showPage;
window._showToast = showToast;
window._closeModal = function (id) {
  const m = document.getElementById(id);
  if (m) m.classList.add("hidden");
};

// Default field positions (mm) for values_only mode
const DEFAULT_FIELD_POSITIONS = {
  nomor: { x: 110, y: 18 },
  tahun_anggaran: { x: 15, y: 28 },
  kode_rekening: { x: 100, y: 28 },
  sudah_terima_dari: { x: 60, y: 40 },
  uang_sejumlah: { x: 60, y: 52 },
  untuk_pembayaran: { x: 60, y: 64 },
  jumlah_rp: { x: 120, y: 80 },
  tanggal: { x: 100, y: 120 },
  mengetahui: { x: 15, y: 120 },
  penerima: { x: 100, y: 120 },
  bendahara: { x: 155, y: 120 },
};

// ========== INIT ==========
// Wire POS modal buttons
window._posPrintThermal = () => cetakPosThermal();
window._posPrintBrowser = () => cetakPosBrowser();

document.addEventListener("DOMContentLoaded", async () => {
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("tanggal").value = today;
  document.getElementById("tahun_anggaran").value = new Date().getFullYear().toString();

  await loadSekolah();
  await loadPrintSettings();
  await loadPosSettingsMod();
});

// ========== NAVIGATION ==========
function showPage(pageName) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));

  document.getElementById(`page-${pageName}`)?.classList.add("active");
  document.querySelector(`.nav-btn[data-page="${pageName}"]`)?.classList.add("active");

  if (pageName === "riwayat") loadRiwayat();
  if (pageName === "sekolah") loadSekolahForm();
  if (pageName === "print-settings") loadPrintSettingsForm();
  if (pageName === "pos-settings") loadPosSetupPage();
}
window.showPage = showPage;

// ========== SEKOLAH ==========
async function loadSekolah() {
  try {
    sekolahData = await invoke("cmd_get_sekolah");
    window._sekolahData = sekolahData;
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
    document.getElementById("s_nip_bendahara").value = sekolahData.nip_bendahara || "";
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

// ========== PPh 21 ==========
function updatePph21Detail() {
  const checked = document.getElementById("cb_kena_pph21")?.checked;
  const detail = document.getElementById("pph21-detail");
  if (detail) detail.classList.toggle("hidden", !checked);

  if (!checked) return;

  const jumlahRaw = (document.getElementById("jumlah")?.value || "0").replace(/[^\d]/g, "");
  const bruto = parseFloat(jumlahRaw) || 0;
  const pph = Math.round(bruto * 0.06);
  const netto = bruto - pph;

  document.getElementById("pph21_bruto").textContent = `Rp ${formatRupiah(bruto)}`;
  document.getElementById("pph21_pph").textContent = `- Rp ${formatRupiah(pph)}`;
  document.getElementById("pph21_netto").textContent = `Rp ${formatRupiah(netto)}`;
}

function autoDetectPPh21() {
  const nomor = document.getElementById("nomor_kwitansi")?.value || "";
  const kode = document.getElementById("kode_rekening")?.value || "";
  const uraian = (document.getElementById("untuk_pembayaran")?.value || "").toLowerCase();

  const shouldCheck = isBnu(nomor) || kode.includes("07.12.04") || uraian.includes("honor") || uraian.includes("honorarium") || uraian.includes("instruktur");

  const cb = document.getElementById("cb_kena_pph21");
  if (cb && !cb.checked) {
    cb.checked = shouldCheck;
  }
  updatePph21Detail();
}

window.handlePPh21Toggle = function () {
  updatePph21Detail();
};

// ========== KWITANSI INPUT ==========
window.handleJumlahInput = async function (el) {
  let raw = el.value.replace(/[^\d]/g, "");
  if (raw === "") {
    document.getElementById("terbilang_preview").value = "";
    return;
  }
  let formatted = parseInt(raw).toLocaleString("id-ID");
  el.value = formatted;

  const kenaPph21 = document.getElementById("cb_kena_pph21")?.checked;
  const jumlah = kenaPph21 ? Math.round(parseInt(raw) * 0.94) : parseInt(raw);

  try {
    const result = await invoke("cmd_terbilang", { jumlah: jumlah });
    document.getElementById("terbilang_preview").value = result;
  } catch (e) {
    console.error(e);
  }
  updateBpuDocsVisibility();
  updatePph21Detail();
};

window.handleSimpanKwitansi = async function (e) {
  e.preventDefault();

  const mengetahui = document.getElementById("mengetahui").value || (sekolahData ? sekolahData.kepala_sekolah : "");
  const nipMengetahui = document.getElementById("nip_mengetahui").value || (sekolahData ? sekolahData.nip_kepala : "");
  const bendahara = document.getElementById("bendahara").value || (sekolahData ? sekolahData.bendahara : "");
  const nipBendahara = document.getElementById("nip_bendahara").value || (sekolahData ? sekolahData.nip_bendahara : "");
  const jumlahRaw = document.getElementById("jumlah").value.replace(/[^\d]/g, "");
  const kenaPph21 = document.getElementById("cb_kena_pph21")?.checked || false;

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
    bulan: "",
    mengetahui: mengetahui,
    nip_mengetahui: nipMengetahui,
    bendahara: bendahara,
    nip_bendahara: nipBendahara,
    penerima: document.getElementById("penerima").value,
    nama_toko: document.getElementById("doc_nama_toko")?.value || "",
    alamat_toko: document.getElementById("doc_alamat_toko")?.value || "",
    pimpinan_toko: document.getElementById("doc_pimpinan_toko")?.value || "",
    created_at: null,
    kena_pph21: kenaPph21,
  };

  try {
    const id = await invoke("cmd_simpan_kwitansi", { kwitansi: kwitansi });

    if (isBpu(kwitansi.nomor_kwitansi)) {
      try {
        await invoke("cmd_set_doc_lengkap", {
          kwitansiId: id,
          dokBast: document.getElementById("doc_cb_bast")?.checked || false,
          dokSuratPesanan: document.getElementById("doc_cb_surat_pesanan")?.checked || false,
          dokInvoice: document.getElementById("doc_cb_invoice")?.checked || false,
          dokBap: document.getElementById("doc_cb_bap")?.checked || false,
        });
      } catch (_) {}
    }

    showToast("Kwitansi berhasil disimpan", "success");
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
  document.getElementById("tahun_anggaran").value = new Date().getFullYear().toString();
  document.getElementById("pph21-detail")?.classList.add("hidden");
  updateBpuDocsVisibility();
};

// ========== BPU DOCS VISIBILITY ==========
function updateBpuDocsVisibility() {
  const nomor = document.getElementById("nomor_kwitansi")?.value || "";
  const jumlahRaw = (document.getElementById("jumlah")?.value || "0").replace(/[^\d]/g, "");
  const jumlah = parseFloat(jumlahRaw) || 0;
  const show = isBpu(nomor) && jumlah > 1000000;
  const el = document.getElementById("bpu-docs-section");
  if (el) el.classList.toggle("hidden", !show);
  if (show) updateBpuDocBadge();
}

function updateBpuDocBadge() {
  const items = ["bast", "surat_pesanan", "invoice", "bap"];
  const done = items.filter(i => document.getElementById(`doc_cb_${i}`)?.checked).length;
  const badge = document.getElementById("doc-status-badge");
  if (badge) {
    badge.textContent = `${done}/4 dokumen`;
    badge.className = done === 4 ? "badge badge-ok" : "badge badge-warn";
  }
}

// Auto-detect PPh 21 on input changes
document.addEventListener("DOMContentLoaded", () => {
  const nomorInput = document.getElementById("nomor_kwitansi");
  const kodeInput = document.getElementById("kode_rekening");
  const uraianInput = document.getElementById("untuk_pembayaran");
  if (nomorInput) nomorInput.addEventListener("input", autoDetectPPh21);
  if (kodeInput) kodeInput.addEventListener("input", autoDetectPPh21);
  if (uraianInput) uraianInput.addEventListener("input", autoDetectPPh21);
});

// ========== RIWAYAT ==========
async function loadRiwayat() {
  try {
    const data = await invoke("cmd_get_all_kwitansi");
    currentRiwayatData = data;
    selectedKwitansiIds.clear();
    const selectAll = document.getElementById("riwayat-select-all");
    if (selectAll) selectAll.checked = false;
    updateBatchButton();
    renderGrouped(data);
  } catch (e) {
    showToast("Gagal memuat data: " + e, "error");
  }
}

function groupByBku(data) {
  const groups = {};
  for (const k of data) {
    const bulan = k.bulan || "";
    const tahun = k.tahun_anggaran || "";
    const key = bulan ? `BKU ${bulan} ${tahun}`.trim() : "Tanpa BKU";
    if (!groups[key]) groups[key] = [];
    groups[key].push(k);
  }
  return groups;
}

function renderGrouped(data) {
  const container = document.getElementById("riwayat-container");
  if (data.length === 0) {
    container.innerHTML = '<div class="table-container"><table><tbody><tr><td class="empty">Belum ada data kwitansi</td></tr></tbody></table></div>';
    return;
  }

  const groups = groupByBku(data);
  let html = "";
  let firstOpen = true;

  for (const [groupName, items] of Object.entries(groups)) {
    const openClass = firstOpen ? " open" : "";
    html += `
      <div class="accordion-group">
        <div class="accordion-header${openClass}" onclick="toggleAccordion(this)">
          <span class="chevron">&#9654;</span>
          ${esc(groupName)}
          <span class="count">${items.length} kwitansi</span>
        </div>
        <div class="accordion-body${openClass}">
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th><input type="checkbox" class="riwayat-select-all-group" onchange="toggleSelectAllGroup(this)" /></th>
                  <th>No</th>
                  <th>Nomor Kwitansi</th>
                  <th>Tanggal</th>
                  <th>Diterima Dari</th>
                  <th>Jumlah</th>
                  <th>Untuk Pembayaran</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((k, i) => {
                  const bpu = isBpu(k.nomor_kwitansi);
                  const bnu = isBnu(k.nomor_kwitansi);
                  const posBtn = bpu ? `<button class="btn btn-sm btn-pos" onclick="handleCetakPosRiwayat(${k.id})">POS</button>` : "";
                  let badge = "";
                  if (bnu) badge = '<span class="badge badge-bnu">BNU</span>';
                  else if (bpu) badge = '<span class="badge badge-bpu">BPU</span>';
                  const pphBadge = k.kena_pph21 ? '<span class="badge badge-warn">PPh21</span>' : "";
                  return `
                  <tr>
                    <td><input type="checkbox" class="riwayat-check" data-id="${k.id}" onchange="handleRiwayatCheck()" ${selectedKwitansiIds.has(k.id) ? 'checked' : ''} /></td>
                    <td>${i + 1}</td>
                    <td>${esc(k.nomor_kwitansi)} ${badge} ${pphBadge}</td>
                    <td>${formatTanggal(k.tanggal)}</td>
                    <td>${esc(k.sudah_terima_dari)}</td>
                    <td class="rupiah">Rp ${formatRupiah(k.jumlah)}</td>
                    <td>${esc(k.untuk_pembayaran.substring(0, 50))}${k.untuk_pembayaran.length > 50 ? "..." : ""}</td>
                    <td>
                      <div class="actions">
                        <button class="btn btn-sm btn-primary" onclick="previewKwitansi(${k.id})">Cetak</button>
                        ${posBtn}
                        <button class="btn btn-sm btn-danger" onclick="hapusKwitansi(${k.id})">Hapus</button>
                      </div>
                    </td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    firstOpen = false;
  }

  container.innerHTML = html;
}

window.toggleAccordion = function (header) {
  header.classList.toggle("open");
  const body = header.nextElementSibling;
  body.classList.toggle("open");
};

window.toggleSelectAllGroup = function (el) {
  const tbody = el.closest("table").querySelector("tbody");
  tbody.querySelectorAll(".riwayat-check").forEach((cb) => {
    cb.checked = el.checked;
    const id = parseInt(cb.dataset.id);
    if (el.checked) selectedKwitansiIds.add(id);
    else selectedKwitansiIds.delete(id);
  });
  updateBatchButton();
};

// Legacy flat render for search mode
function renderTable(data) {
  const container = document.getElementById("riwayat-container");
  if (data.length === 0) {
    container.innerHTML = '<div class="table-container"><table><tbody><tr><td class="empty">Belum ada data kwitansi</td></tr></tbody></table></div>';
    return;
  }

  container.innerHTML = `
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th><input type="checkbox" id="riwayat-select-all" onchange="toggleSelectAllRiwayat(this)" /></th>
            <th>No</th>
            <th>Nomor Kwitansi</th>
            <th>Tanggal</th>
            <th>Diterima Dari</th>
            <th>Jumlah</th>
            <th>Untuk Pembayaran</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((k, i) => {
            const bpu = isBpu(k.nomor_kwitansi);
            const bnu = isBnu(k.nomor_kwitansi);
            const posBtn = bpu ? `<button class="btn btn-sm btn-pos" onclick="handleCetakPosRiwayat(${k.id})">POS</button>` : "";
            let badge = "";
            if (bnu) badge = '<span class="badge badge-bnu">BNU</span>';
            else if (bpu) badge = '<span class="badge badge-bpu">BPU</span>';
            const pphBadge = k.kena_pph21 ? '<span class="badge badge-warn">PPh21</span>' : "";
            return `
            <tr>
              <td><input type="checkbox" class="riwayat-check" data-id="${k.id}" onchange="handleRiwayatCheck()" ${selectedKwitansiIds.has(k.id) ? 'checked' : ''} /></td>
              <td>${i + 1}</td>
              <td>${esc(k.nomor_kwitansi)} ${badge} ${pphBadge}</td>
              <td>${formatTanggal(k.tanggal)}</td>
              <td>${esc(k.sudah_terima_dari)}</td>
              <td class="rupiah">Rp ${formatRupiah(k.jumlah)}</td>
              <td>${esc(k.untuk_pembayaran.substring(0, 50))}${k.untuk_pembayaran.length > 50 ? "..." : ""}</td>
              <td>
                <div class="actions">
                  <button class="btn btn-sm btn-primary" onclick="previewKwitansi(${k.id})">Cetak</button>
                  ${posBtn}
                  <button class="btn btn-sm btn-danger" onclick="hapusKwitansi(${k.id})">Hapus</button>
                </div>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}

window.handleSearch = async function (query) {
  try {
    if (query.trim() === "") {
      await loadRiwayat();
    } else {
      const data = await invoke("cmd_search_kwitansi", { query: query });
      currentRiwayatData = data;
      renderTable(data); // flat for search
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
    showPrintPreview([k]);
  } catch (e) {
    showToast("Gagal memuat kwitansi: " + e, "error");
  }
};

// ========== RIWAYAT BATCH SELECT ==========
window.toggleSelectAllRiwayat = function (el) {
  document.querySelectorAll(".riwayat-check").forEach((cb) => {
    cb.checked = el.checked;
    const id = parseInt(cb.dataset.id);
    if (el.checked) selectedKwitansiIds.add(id);
    else selectedKwitansiIds.delete(id);
  });
  updateBatchButton();
};

window.handleRiwayatCheck = function () {
  selectedKwitansiIds.clear();
  document.querySelectorAll(".riwayat-check").forEach((cb) => {
    if (cb.checked) selectedKwitansiIds.add(parseInt(cb.dataset.id));
  });
  updateBatchButton();
};

function updateBatchButton() {
  const btn = document.getElementById("btn-cetak-batch");
  if (selectedKwitansiIds.size > 1) {
    btn.style.display = "inline-flex";
    btn.textContent = `Cetak yang Dipilih (${selectedKwitansiIds.size})`;
  } else {
    btn.style.display = "none";
  }
}

window.handleCetakBatch = async function () {
  if (selectedKwitansiIds.size === 0) {
    showToast("Pilih minimal satu kwitansi", "warning");
    return;
  }

  try {
    const allData = await invoke("cmd_get_all_kwitansi");
    const selected = allData.filter((k) => selectedKwitansiIds.has(k.id));
    showBatchPrintPreview(selected);
  } catch (e) {
    showToast("Gagal memuat data: " + e, "error");
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

    if (sekolahData) {
      document.getElementById("import_mengetahui").value = sekolahData.kepala_sekolah || "";
      document.getElementById("import_nip_mengetahui").value = sekolahData.nip_kepala || "";
      document.getElementById("import_bendahara").value = sekolahData.bendahara || "";
      document.getElementById("import_nip_bendahara").value = sekolahData.nip_bendahara || "";
    }

    const csvTbody = document.getElementById("csv-tbody");
    csvTbody.innerHTML = currentCsvData.map((r) => `
      <tr>
        <td>${esc(r.nomor_kwitansi)}</td>
        <td>${esc(r.tanggal)}</td>
        <td>${esc(r.sudah_terima_dari)}</td>
        <td class="rupiah">Rp ${formatRupiah(r.jumlah)}</td>
        <td>${esc(r.untuk_pembayaran)}</td>
        <td>${esc(r.kode_rekening)}</td>
        <td>${esc(r.penerima)}</td>
      </tr>
    `).join("");

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
  const header = "nomor_kwitansi,tanggal,sudah_terima_dari,jumlah,untuk_pembayaran,kode_rekening,penerima";
  const sample = '001/KWT/2026,2026-01-15,Bendahara BOS,1500000,Pembelian ATK untuk kegiatan belajar mengajar,5.1.02.01.01.0001,Toko Makmur Jaya';
  const csv = header + "\n" + sample + "\n";
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "template_kwitansi.csv";
  a.click();
  URL.revokeObjectURL(url);
};

// ========== IMPORT TAB SWITCH ==========
window.switchImportTab = function (tab) {
  document.querySelectorAll(".import-tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".import-tab-content").forEach((c) => c.classList.remove("active"));
  document.querySelector(`.import-tab[data-tab="${tab}"]`).classList.add("active");
  document.getElementById(`tab-${tab}`).classList.add("active");
};

// ========== PDF BKU IMPORT ==========
window.openPdfDialog = async function () {
  try {
    const filePath = await open({
      multiple: false,
      filters: [{ name: "PDF BKU", extensions: ["pdf"] }],
    });
    if (!filePath) return;
    await processPdfFile(filePath);
  } catch (e) {
    showToast("Gagal membuka dialog: " + e, "error");
  }
};

async function processPdfFile(filePath) {
  document.getElementById("pdf-loading").classList.remove("hidden");
  document.getElementById("pdf-preview").classList.add("hidden");
  document.getElementById("pdf-import-settings").classList.add("hidden");

  try {
    const result = await invoke("cmd_parse_bku_pdf", { filePath: filePath });
    currentBkuData = result;

    const bulanPdf = result.bulan || deriveBulanFromDate(result.transactions);
    document.getElementById("pdf_bulan").value = bulanPdf;
    document.getElementById("pdf_tahun").value = result.tahun || new Date().getFullYear().toString();
    document.getElementById("pdf_mengetahui").value = result.kepala_sekolah || (sekolahData ? sekolahData.kepala_sekolah : "");
    document.getElementById("pdf_nip_mengetahui").value = result.nip_kepala || (sekolahData ? sekolahData.nip_kepala : "");
    document.getElementById("pdf_bendahara").value = result.bendahara || (sekolahData ? sekolahData.bendahara : "");
    document.getElementById("pdf_nip_bendahara").value = result.nip_bendahara || (sekolahData ? sekolahData.nip_bendahara : "");

    document.getElementById("pdf-count").textContent = result.transactions.length;
    const tbody = document.getElementById("pdf-tbody");
    tbody.innerHTML = result.transactions.map((tx, i) => `
      <tr>
        <td><input type="checkbox" class="pdf-row-check" data-index="${i}" checked /></td>
        <td>${esc(tx.no_bukti)}</td>
        <td>${esc(tx.tanggal)}</td>
        <td>${esc(tx.kode_rekening)}</td>
        <td title="${esc(tx.uraian)}">${esc(tx.uraian.length > 60 ? tx.uraian.substring(0, 60) + "..." : tx.uraian)}</td>
        <td class="rupiah">Rp ${formatRupiah(tx.pengeluaran)}</td>
        <td><input type="text" class="pdf-penerima-input" data-index="${i}" value="${esc(tx.penerima)}" placeholder="Isi penerima..." /></td>
      </tr>
    `).join("");

    document.getElementById("pdf-import-settings").classList.remove("hidden");
    document.getElementById("pdf-preview").classList.remove("hidden");
    showToast(`${result.transactions.length} transaksi ditemukan dari BKU ${result.bulan} ${result.tahun}`, "success");
  } catch (e) {
    showToast("Gagal memproses PDF: " + e, "error");
  } finally {
    document.getElementById("pdf-loading").classList.add("hidden");
  }
}

window.toggleSelectAllPdf = function (el) {
  document.querySelectorAll(".pdf-row-check").forEach((cb) => {
    cb.checked = el.checked;
  });
};

window.handleImportBku = async function () {
  if (!currentBkuData || currentBkuData.transactions.length === 0) {
    showToast("Tidak ada data untuk diimport", "warning");
    return;
  }

  const checkboxes = document.querySelectorAll(".pdf-row-check");
  const penerimaInputs = document.querySelectorAll(".pdf-penerima-input");
  const selectedTransactions = [];

  checkboxes.forEach((cb) => {
    if (cb.checked) {
      const idx = parseInt(cb.dataset.index);
      const tx = { ...currentBkuData.transactions[idx] };
      const input = penerimaInputs[idx];
      if (input) tx.penerima = input.value;
      selectedTransactions.push(tx);
    }
  });

  if (selectedTransactions.length === 0) {
    showToast("Pilih minimal satu transaksi untuk diimport", "warning");
    return;
  }

  try {
    const count = await invoke("cmd_import_bku", {
      transactions: selectedTransactions,
      bulan: document.getElementById("pdf_bulan").value,
      tahunAnggaran: document.getElementById("pdf_tahun").value,
      sudahTerimaDari: defaultSudahTerimaDari(),
      mengetahui: document.getElementById("pdf_mengetahui").value,
      nipMengetahui: document.getElementById("pdf_nip_mengetahui").value,
      bendahara: document.getElementById("pdf_bendahara").value,
      nipBendahara: document.getElementById("pdf_nip_bendahara").value,
    });
    showToast(`${count} kwitansi berhasil diimport dari BKU`, "success");
    resetPdfImport();
    showPage("riwayat");
  } catch (e) {
    showToast("Gagal import: " + e, "error");
  }
};

window.resetPdfImport = function () {
  currentBkuData = null;
  document.getElementById("pdf-loading").classList.add("hidden");
  document.getElementById("pdf-import-settings").classList.add("hidden");
  document.getElementById("pdf-preview").classList.add("hidden");
};

// ========== PRINT SETTINGS ==========
async function loadPrintSettings() {
  try {
    currentPrintSettings = await invoke("cmd_get_print_settings");
    if (currentPrintSettings.field_positions === "{}" || !currentPrintSettings.field_positions) {
      currentPrintSettings.field_positions = JSON.stringify(DEFAULT_FIELD_POSITIONS);
    }
  } catch (e) {
    console.error("Gagal load print settings:", e);
    currentPrintSettings = {
      id: null,
      mode: "values_only",
      paper_width: 176,
      paper_height: 190,
      margin_top: 10,
      margin_bottom: 10,
      margin_left: 10,
      margin_right: 10,
      font_size: 9,
      sig_gap: 15,
      field_positions: JSON.stringify(DEFAULT_FIELD_POSITIONS),
    };
  }
}

async function loadPrintSettingsForm() {
  await loadPrintSettings();
  const s = currentPrintSettings;
  document.getElementById("ps_mode").value = s.mode;
  document.getElementById("ps_paper_width").value = s.paper_width;
  document.getElementById("ps_paper_height").value = s.paper_height;
  document.getElementById("ps_margin_top").value = s.margin_top;
  document.getElementById("ps_margin_bottom").value = s.margin_bottom;
  document.getElementById("ps_margin_left").value = s.margin_left;
  document.getElementById("ps_margin_right").value = s.margin_right;
  document.getElementById("ps_font_size").value = s.font_size;
  document.getElementById("ps_sig_gap").value = s.sig_gap || 15;
  renderPaperPreview();
}

window.handleModeChange = function (mode) {
  currentPrintSettings.mode = mode;
  renderPaperPreview();
};

window.handleSimpanPrintSettings = async function () {
  currentPrintSettings.mode = document.getElementById("ps_mode").value;
  currentPrintSettings.paper_width = parseFloat(document.getElementById("ps_paper_width").value);
  currentPrintSettings.paper_height = parseFloat(document.getElementById("ps_paper_height").value);
  currentPrintSettings.margin_top = parseFloat(document.getElementById("ps_margin_top").value);
  currentPrintSettings.margin_bottom = parseFloat(document.getElementById("ps_margin_bottom").value);
  currentPrintSettings.margin_left = parseFloat(document.getElementById("ps_margin_left").value);
  currentPrintSettings.margin_right = parseFloat(document.getElementById("ps_margin_right").value);
  currentPrintSettings.font_size = parseFloat(document.getElementById("ps_font_size").value);
  currentPrintSettings.sig_gap = parseFloat(document.getElementById("ps_sig_gap").value) || 15;

  try {
    await invoke("cmd_save_print_settings", { settings: currentPrintSettings });
    showToast("Pengaturan cetak berhasil disimpan", "success");
  } catch (e) {
    showToast("Gagal menyimpan pengaturan: " + e, "error");
  }
};

window.handleResetPrintSettings = function () {
  document.getElementById("ps_paper_width").value = 176;
  document.getElementById("ps_paper_height").value = 190;
  document.getElementById("ps_margin_top").value = 10;
  document.getElementById("ps_margin_bottom").value = 10;
  document.getElementById("ps_margin_left").value = 10;
  document.getElementById("ps_margin_right").value = 10;
  document.getElementById("ps_font_size").value = 9;
  document.getElementById("ps_sig_gap").value = 15;
  currentPrintSettings.field_positions = JSON.stringify(DEFAULT_FIELD_POSITIONS);
  renderPaperPreview();
};

// ========== VISUAL EDITOR (DRAG & DROP) ==========
let dragState = null;

function renderPaperPreview() {
  const container = document.getElementById("paper-preview-container");
  if (!container) return;

  const s = currentPrintSettings;
  const positions = JSON.parse(s.field_positions || "{}");
  const mode = s.mode;

  const previewWidth = 400;
  const scale = previewWidth / s.paper_width;
  const previewHeight = s.paper_height * scale;
  const marginLeft = s.margin_left * scale;
  const marginTop = s.margin_top * scale;
  const marginRight = s.margin_right * scale;
  const marginBottom = s.margin_bottom * scale;

  let fieldsHtml = "";

  if (mode === "values_only") {
    const fieldDefs = [
      { key: "nomor", label: "No Kwitansi", color: "#1a56db" },
      { key: "tahun_anggaran", label: "Tahun Anggaran", color: "#059669" },
      { key: "kode_rekening", label: "Kode Rekening", color: "#059669" },
      { key: "sudah_terima_dari", label: "Sudah Terima Dari", color: "#d97706" },
      { key: "uang_sejumlah", label: "Uang Sejumlah", color: "#d97706" },
      { key: "untuk_pembayaran", label: "Untuk Pembayaran", color: "#d97706" },
      { key: "jumlah_rp", label: "Jumlah Rp", color: "#dc2626" },
      { key: "tanggal", label: "Tanggal", color: "#8b5cf6" },
      { key: "mengetahui", label: "Mengetahui (Nama + NIP)", color: "#6366f1" },
      { key: "penerima", label: "Yang Menerima (Nama)", color: "#ec4899" },
      { key: "bendahara", label: "Bendahara (Nama + NIP)", color: "#14b8a6" },
    ];

    fieldsHtml = fieldDefs.map((f) => {
      const pos = positions[f.key] || { x: 10, y: 10 };
      return `<div class="field-dragger" data-key="${f.key}"
        style="left:${pos.x * scale}px; top:${pos.y * scale}px; border-color:${f.color}; color:${f.color};"
        title="${f.label}">${f.label}</div>`;
    }).join("");
  } else {
    fieldsHtml = `
      <div class="field-static" style="top:8px; left:50%; transform:translateX(-50%); font-weight:bold; font-size:13px;">KWITANSI</div>
      <div class="field-static" style="top:30px; right:10px; font-size:10px;">No: ...</div>
      <div class="field-static" style="top:50px; left:10px; font-size:10px;">Sudah terima dari: ............</div>
      <div class="field-static" style="top:70px; left:10px; font-size:10px;">Uang sejumlah: ............</div>
      <div class="field-static" style="top:90px; left:10px; font-size:10px;">Untuk pembayaran: ............</div>
      <div class="field-static" style="top:110px; right:10px; font-size:10px; font-weight:bold;">Rp .......</div>
      <div class="field-static" style="bottom:80px; left:10px; font-size:10px;">Mengetahui,</div>
      <div class="field-static" style="bottom:80px; right:10px; font-size:10px;">Bendahara,</div>
      <div class="field-static" style="bottom:60px; left:50%; transform:translateX(-50%); font-size:10px;">Yang Menerima,</div>
    `;
  }

  container.innerHTML = `
    <div class="paper-preview" style="width:${previewWidth}px; height:${previewHeight}px; position:relative; background:#fff; border:2px solid #ccc; overflow:hidden; border-radius:4px;">
      <div class="paper-margin" style="position:absolute; left:${marginLeft}px; top:${marginTop}px; right:${marginRight}px; bottom:${marginBottom}px; border:1px dashed #aaa; pointer-events:none;"></div>
      ${fieldsHtml}
    </div>
  `;

  if (mode === "values_only") {
    initDraggers(container);
  }
}

function initDraggers(container) {
  const scale = 400 / currentPrintSettings.paper_width;

  container.querySelectorAll(".field-dragger").forEach((el) => {
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const key = el.dataset.key;
      const positions = JSON.parse(currentPrintSettings.field_positions || "{}");
      const startPos = positions[key] || { x: 0, y: 0 };
      const startMouseX = e.clientX;
      const startMouseY = e.clientY;

      dragState = { el, key, startPos, startMouseX, startMouseY, scale };

      const onMove = (e) => {
        if (!dragState) return;
        const dx = (e.clientX - dragState.startMouseX) / dragState.scale;
        const dy = (e.clientY - dragState.startMouseY) / dragState.scale;
        let newX = Math.round(dragState.startPos.x + dx);
        let newY = Math.round(dragState.startPos.y + dy);
        newX = Math.max(0, Math.min(currentPrintSettings.paper_width - 15, newX));
        newY = Math.max(0, Math.min(currentPrintSettings.paper_height - 10, newY));

        dragState.el.style.left = `${newX * dragState.scale}px`;
        dragState.el.style.top = `${newY * dragState.scale}px`;

        const pos = JSON.parse(currentPrintSettings.field_positions || "{}");
        pos[dragState.key] = { x: newX, y: newY };
        currentPrintSettings.field_positions = JSON.stringify(pos);
      };

      const onUp = () => {
        dragState = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

// ========== PRINT PREVIEW & CETAK ==========
function showPrintPreview(kwitansiList) {
  lastPreviewData = { type: "single", data: kwitansiList };
  const container = document.getElementById("print-container");
  container.innerHTML = kwitansiList.map((k) => renderKwitansiTemplate(k)).join("");

  const bpu = kwitansiList.length === 1 && isBpu(kwitansiList[0].nomor_kwitansi);
  const posBtn = document.getElementById("btn-cetak-pos-preview");
  if (posBtn) posBtn.style.display = bpu ? "inline-block" : "none";
  const docBtnGroup = document.getElementById("doc-btn-group");
  if (docBtnGroup) docBtnGroup.classList.toggle("hidden", !bpu);
  if (bpu && kwitansiList[0].id) window.setKwitansiForDocs(kwitansiList[0]);

  showPage("print");
}

function showBatchPrintPreview(kwitansiList) {
  lastPreviewData = { type: "batch", data: kwitansiList };
  const container = document.getElementById("batch-print-container");
  document.getElementById("batch-count").textContent = kwitansiList.length;
  container.innerHTML = kwitansiList.map((k) => renderKwitansiTemplate(k)).join("");

  const hasBpu = kwitansiList.some(k => isBpu(k.nomor_kwitansi));
  const posBtn = document.getElementById("btn-cetak-pos-batch");
  if (posBtn) posBtn.style.display = hasBpu ? "inline-block" : "none";

  showPage("batch-print");
}

function renderKwitansiTemplate(k) {
  if (currentPrintSettings && currentPrintSettings.mode === "values_only") {
    return renderValuesOnlyTemplate(k);
  }
  return renderFullTemplate(k);
}

function renderValuesOnlyTemplate(k) {
  const s = currentPrintSettings;
  const positions = JSON.parse(s.field_positions || "{}");
  const fontSize = s.font_size || 9;
  const gap = s.sig_gap || 15;

  function pos(key) {
    const p = positions[key] || { x: 0, y: 0 };
    return `left:${p.x}mm; top:${p.y}mm;`;
  }

  const mengetahuiBlock = `<div class="kv multi-line" style="${pos('mengetahui')}">Mengetahui,<div class="sig-space" style="height:${gap}mm"></div>${esc(k.mengetahui)}<br>NIP. ${esc(k.nip_mengetahui)}</div>`;
  const penerimaBlock = `<div class="kv multi-line" style="${pos('penerima')}">${esc(formatTanggalPanjang(k.tanggal))}<br>Yang Menerima,<div class="sig-space" style="height:${gap}mm"></div>${esc(k.penerima)}</div>`;
  const bendaharaBlock = `<div class="kv multi-line" style="${pos('bendahara')}">Bendahara,<div class="sig-space" style="height:${gap}mm"></div>${esc(k.bendahara)}<br>NIP. ${esc(k.nip_bendahara)}</div>`;

  return `
    <div class="kwitansi-page values-only" style="width:${s.paper_width}mm; min-height:${s.paper_height}mm; padding:${s.margin_top}mm ${s.margin_right}mm ${s.margin_bottom}mm ${s.margin_left}mm; font-size:${fontSize}pt;">
      <div class="kv" style="${pos('nomor')}">No: ${esc(k.nomor_kwitansi)}</div>
      <div class="kv" style="${pos('tahun_anggaran')}">Tahun Anggaran: ${esc(k.tahun_anggaran)}</div>
      <div class="kv" style="${pos('kode_rekening')}">Kode Rekening: ${esc(k.kode_rekening)}</div>
      <div class="kv" style="${pos('sudah_terima_dari')}">${esc(k.sudah_terima_dari)}</div>
      <div class="kv" style="${pos('uang_sejumlah')}">${esc(capitalize(k.terbilang))}</div>
      <div class="kv" style="${pos('untuk_pembayaran')}">${esc(k.untuk_pembayaran)}</div>
      <div class="kv jumlah" style="${pos('jumlah_rp')}">Rp ${formatRupiah(k.jumlah)}</div>
      ${mengetahuiBlock}
      ${penerimaBlock}
      ${bendaharaBlock}
    </div>
  `;
}

function renderFullTemplate(k) {
  const tgl = formatTanggalPanjang(k.tanggal);
  const s = currentPrintSettings;
  const pw = s ? s.paper_width : 210;
  const ph = s ? s.paper_height : 148;
  const mt = s ? s.margin_top : 12;
  const ml = s ? s.margin_left : 15;
  const mr = s ? s.margin_right : 15;
  const mb = s ? s.margin_bottom : 12;
  const fs = s ? s.font_size : 12;
  const gap = s ? (s.sig_gap || 15) : 15;

  // PPh 21 block (honorarium only)
  let pphBlock = "";
  if (k.kena_pph21) {
    const bruto = k.jumlah;
    const pph = Math.round(bruto * 0.06);
    const netto = bruto - pph;
    pphBlock = `
      <div style="margin-top:3mm; font-size:10pt; color:#333;">
        <div>Bruto    : <b>Rp ${formatRupiah(bruto)}</b></div>
        <div>PPh 21 6%: <b style="color:var(--danger);">- Rp ${formatRupiah(pph)}</b></div>
        <div style="margin-top:1mm;"><b>Netto    : Rp ${formatRupiah(netto)}</b></div>
      </div>
    `;
  }

  return `
    <div class="kwitansi-page" style="width:${pw}mm; min-height:${ph}mm; padding:${mt}mm ${mr}mm ${mb}mm ${ml}mm; font-size:${fs}pt;">
      <div class="kwitansi-header">
        <h2>KWITANSI</h2>
        <div class="nomor">No: ${esc(labelNomorCetak(k.nomor_kwitansi))}</div>
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
        ${pphBlock}
      </div>

      <div class="kwitansi-footer">
        <div class="kwitansi-ttd">
          <div class="label" style="margin-bottom:${gap}mm">Mengetahui,</div>
          <div class="nama">${esc(k.mengetahui)}</div>
          <div class="nip">NIP. ${esc(k.nip_mengetahui)}</div>
        </div>
        <div class="kwitansi-ttd" style="text-align: center;">
          <div class="label" style="margin-bottom:${gap}mm">Bendahara,</div>
          <div class="nama">${esc(k.bendahara)}</div>
          <div class="nip">NIP. ${esc(k.nip_bendahara)}</div>
        </div>
        <div class="kwitansi-ttd">
          <div class="label">${esc(tgl)}</div>
          <div class="label" style="margin-bottom:${gap}mm">Yang Menerima,</div>
          <div class="nama">${esc(k.penerima)}</div>
        </div>
      </div>
    </div>
  `;
}

window.cetakKwitansi = function () {
  if (currentPrintSettings) {
    const s = currentPrintSettings;
    let styleEl = document.getElementById("dynamic-print-style");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "dynamic-print-style";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      @media print {
        @page {
          size: ${s.paper_width}mm ${s.paper_height}mm;
          margin: 0;
        }
      }
    `;
  }
  window.print();
};

// ========== AUTO-REFRESH PRINT SETTINGS ==========
window.handleLivePreview = function () {
  if (previewAutoRefreshTimer) clearTimeout(previewAutoRefreshTimer);
  previewAutoRefreshTimer = setTimeout(() => {
    if (currentPrintSettings) {
      currentPrintSettings.mode = document.getElementById("ps_mode")?.value || currentPrintSettings.mode;
      currentPrintSettings.paper_width = parseFloat(document.getElementById("ps_paper_width")?.value) || currentPrintSettings.paper_width;
      currentPrintSettings.paper_height = parseFloat(document.getElementById("ps_paper_height")?.value) || currentPrintSettings.paper_height;
      currentPrintSettings.margin_top = parseFloat(document.getElementById("ps_margin_top")?.value) || currentPrintSettings.margin_top;
      currentPrintSettings.margin_bottom = parseFloat(document.getElementById("ps_margin_bottom")?.value) || currentPrintSettings.margin_bottom;
      currentPrintSettings.margin_left = parseFloat(document.getElementById("ps_margin_left")?.value) || currentPrintSettings.margin_left;
      currentPrintSettings.margin_right = parseFloat(document.getElementById("ps_margin_right")?.value) || currentPrintSettings.margin_right;
      currentPrintSettings.font_size = parseFloat(document.getElementById("ps_font_size")?.value) || currentPrintSettings.font_size;
      currentPrintSettings.sig_gap = parseFloat(document.getElementById("ps_sig_gap")?.value) || currentPrintSettings.sig_gap;
    }
    renderPaperPreview();
    refreshPrintPreview();
  }, 300);
};

window.refreshPrintPreview = function () {
  if (!lastPreviewData) return;
  const container = lastPreviewData.type === "single"
    ? document.getElementById("print-container")
    : document.getElementById("batch-print-container");
  if (!container) return;
  container.innerHTML = lastPreviewData.data.map((k) => renderKwitansiTemplate(k)).join("");
};

// ========== POS CETAK (DIRECT ESC/POS) ==========
window.handleCetakPosRiwayat = async function (id) {
  try {
    const k = await invoke("cmd_get_kwitansi", { id });
    const needsDoc = needsDocuments(k);

    if (needsDoc) {
      const docStatus = await loadDocStatus(k.id);
      if (!allDocsComplete(docStatus)) {
        const proceed = confirm("BPU > Rp1.000.000 belum lengkap dokumennya.\nTetap cetak nota POS?");
        if (!proceed) return;
      }
    }

    await cetakNotaPos(k);
  } catch (e) {
    showToast("Gagal load kwitansi: " + e, "error");
  }
};

window.handleCetakPosFromPreview = async function () {
  if (!lastPreviewData || !lastPreviewData.data || lastPreviewData.data.length === 0) return;
  const k = lastPreviewData.data[0];
  await cetakNotaPos(k);
};

window.handleCetakPosBatch = async function () {
  if (!lastPreviewData || !lastPreviewData.data) return;
  const posData = lastPreviewData.data.filter(k => isBpu(k.nomor_kwitansi));
  if (posData.length === 0) {
    showToast("Tidak ada kwitansi BPU di batch ini", "warning");
    return;
  }

  // Check doc status for all BPU kwitansi
  let incompleteDocs = [];
  for (const k of posData) {
    if (needsDocuments(k)) {
      const docStatus = await loadDocStatus(k.id);
      if (!allDocsComplete(docStatus)) {
        incompleteDocs.push(k.nomor_kwitansi);
      }
    }
  }
  if (incompleteDocs.length > 0) {
    const proceed = confirm(
      `${incompleteDocs.length} kwitansi BPU belum lengkap dokumennya:\n` +
      incompleteDocs.join(", ") +
      `\nTetap cetak nota POS?`
    );
    if (!proceed) return;
  }

  // Print each one via ESC/POS
  for (const k of posData) {
    try {
      await cetakNotaPos(k);
    } catch (e) {
      showToast(`Gagal cetak ${k.nomor_kwitansi}: ${e}`, "error");
    }
  }
};

// ========== POS SETTINGS MODAL ==========
document.addEventListener("DOMContentLoaded", async () => {
  const s = getPosSettings();
  if (s) {
    const pw = document.getElementById("pos_paper_width");
    const port = document.getElementById("pos_port");
    const baud = document.getElementById("pos_baud_rate");
    if (pw) pw.value = s.paper_width || 58;
    if (port) port.value = s.port || "";
    if (baud) baud.value = s.baud_rate || 9600;
  }
});

window.handleSimpanPosSettings = async function () {
  const s = getPosSettings() || {};
  const settings = {
    id: s.id || null,
    paper_width: parseInt(document.getElementById("pos_paper_width")?.value || "58"),
    port: document.getElementById("pos_port")?.value || "",
    baud_rate: parseInt(document.getElementById("pos_baud_rate")?.value || "9600"),
  };

  try {
    await invoke("cmd_save_pos_settings", { settings });
    // Reload in pos.js
    await loadPosSettingsMod();
    showToast("Pengaturan POS disimpan", "success");
    window._closeModal("modal-pos-settings");
  } catch (e) {
    showToast("Gagal simpan: " + e, "error");
  }
};

window.handlePosTestPrint = async function () {
  try {
    await invoke("cmd_pos_test_print");
    showToast("Test print berhasil dikirim", "success");
  } catch (e) {
    showToast("Gagal test print: " + e, "error");
  }
};

// ========== POS SETUP PAGE ==========

async function loadPosSetupPage() {
  try {
    const s = await invoke("cmd_get_pos_settings");
    document.getElementById("pos_setup_port").value = s.port || "";
    document.getElementById("pos_setup_baud_rate").value = s.baud_rate || 9600;
    document.getElementById("pos_setup_paper_width").value = s.paper_width || 58;
    document.getElementById("pos_setup_header").value = s.header_text || "";
    document.getElementById("pos_setup_footer").value = s.footer_text || "";
    renderPosPaperPreview();
    updatePosStrukPreview();
  } catch (e) {
    console.error("Gagal load pos settings:", e);
  }
}

window.renderPosPaperPreview = function () {
  const width = parseInt(document.getElementById("pos_setup_paper_width")?.value || "58");
  const container = document.getElementById("pos-paper-preview");
  const label = document.getElementById("pos-preview-label");
  if (container) container.style.width = `${width * 2.5}px`;
  if (label) label.textContent = `${width}mm`;
};

window.handleSimpanPosSetupSettings = async function () {
  const s = getPosSettings() || await loadPosSettingsMod() || {};
  const settings = {
    id: s.id || null,
    paper_width: parseInt(document.getElementById("pos_setup_paper_width")?.value || "58"),
    port: document.getElementById("pos_setup_port")?.value || "",
    baud_rate: parseInt(document.getElementById("pos_setup_baud_rate")?.value || "9600"),
    header_text: document.getElementById("pos_setup_header")?.value || "",
    footer_text: document.getElementById("pos_setup_footer")?.value || "",
  };

  try {
    await invoke("cmd_save_pos_settings", { settings });
    await loadPosSettingsMod();
    showToast("Pengaturan printer thermal disimpan", "success");
  } catch (e) {
    showToast("Gagal simpan: " + e, "error");
  }
};

window.handlePosSetupTestPrint = async function () {
  // Simpan dulu agar port/baud terupdate
  await handleSimpanPosSetupSettings();
  await window.handlePosTestPrint();
};

window.handleResetPosSetup = function () {
  document.getElementById("pos_setup_port").value = "";
  document.getElementById("pos_setup_baud_rate").value = "9600";
  document.getElementById("pos_setup_paper_width").value = "58";
  document.getElementById("pos_setup_header").value = "";
  document.getElementById("pos_setup_footer").value = "";
  renderPosPaperPreview();
  updatePosStrukPreview();
};

window.updatePosStrukPreview = function () {
  const header = document.getElementById("pos_setup_header")?.value || "";
  const footer = document.getElementById("pos_setup_footer")?.value || "";
  const headerEl = document.getElementById("pos-struk-header");
  const footerEl = document.getElementById("pos-struk-footer");
  if (headerEl) {
    if (header.trim()) {
      headerEl.innerHTML = header.replace(/\n/g, "<br>");
    } else {
      headerEl.innerHTML = "<b>NOTA PEMBAYARAN</b>";
    }
  }
  if (footerEl) {
    if (footer.trim()) {
      footerEl.innerHTML = footer.replace(/\n/g, "<br>");
    } else {
      footerEl.textContent = "Terima kasih";
    }
  }
};

// ========== UTILITIES ==========
function defaultSudahTerimaDari() {
  const nama = sekolahData?.nama_sekolah?.trim() || "";
  return nama ? `Bendahara BOS ${nama}` : "Bendahara BOS";
}
window._defaultSudahTerimaDari = defaultSudahTerimaDari;

function formatRupiah(num) {
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatTanggal(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTanggalPanjang(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

const NAMA_BULAN = ["JANUARI","FEBRUARI","MARET","APRIL","MEI","JUNI","JULI","AGUSTUS","SEPTEMBER","OKTOBER","NOVEMBER","DESEMBER"];

function deriveBulanFromDate(transactions) {
  if (!transactions || transactions.length === 0) return "";
  const tgl = transactions[0].tanggal || "";
  const parts = tgl.split("-");
  if (parts.length >= 2) {
    const monthIdx = parseInt(parts[1], 10) - 1;
    if (monthIdx >= 0 && monthIdx < 12) return NAMA_BULAN[monthIdx];
  }
  return "";
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
