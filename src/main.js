import { invoke } from "@tauri-apps/api/core";
import { isBpu, loadPosSettings as loadPosSettingsMod, getPosSettings, cetakNotaPos, cetakPosThermal, cetakPosBrowser } from "./pos.js";
import { cariUraianKegiatan, DAFTAR_KEGIATAN } from "./kode-referensi.js";
import { needsDocuments, loadDocStatus, allDocsComplete } from "./bpu-docs.js";
import "./bku-period.js";
import "./rekap.js";
import "./dashboard.js";
import "./backup.js";
import "./produk.js";
import "./kasir.js";

function isBnu(nomor) {
  return (nomor || "").trim().toUpperCase().includes("BNU");
}

// ========== STATE ==========
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
// NOTE: kode_rekening & tahun_anggaran tidak ada di sini — sudah menyatu
// dalam kalimat "Untuk Pembayaran". Tanggal menyatu dalam blok Penerima.
const DEFAULT_FIELD_POSITIONS = {
  nomor: { x: 110, y: 18 },
  sudah_terima_dari: { x: 60, y: 40 },
  uang_sejumlah: { x: 60, y: 52 },
  untuk_pembayaran: { x: 60, y: 64 },
  jumlah_rp: { x: 120, y: 80 },
  pajak: { x: 120, y: 95 },
  mengetahui: { x: 15, y: 120 },
  penerima: { x: 100, y: 120 },
  bendahara: { x: 155, y: 120 },
};

// ========== INIT ==========
// Wire POS modal buttons
window._posPrintThermal = () => cetakPosThermal();
window._posPrintBrowser = () => cetakPosBrowser();

document.addEventListener("DOMContentLoaded", async () => {
  await loadSekolah();
  await loadPrintSettings();
  await loadPosSettingsMod();
  populateKegiatanDatalist();
  await loadRiwayat();
});

// ========== NAVIGATION ==========
function showPage(pageName) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));

  document.getElementById(`page-${pageName}`)?.classList.add("active");
  document.querySelector(`.nav-btn[data-page="${pageName}"]`)?.classList.add("active");

  if (pageName === "riwayat") loadRiwayat();
  if (pageName === "sekolah") { loadSekolahForm(); if (window._loadBackups) window._loadBackups(); }
  if (pageName === "rekap" && window._loadRekap) window._loadRekap();
  if (pageName === "dashboard" && window._loadDashboard) window._loadDashboard();
  if (pageName === "produk" && window._loadProduk) window._loadProduk();
  if (pageName === "kasir" && window._loadKasir) window._loadKasir();
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
    window._sekolahData = data;
    showToast("Data sekolah berhasil disimpan", "success");
  } catch (e) {
    showToast("Gagal menyimpan: " + e, "error");
  }
  return false;
};

// ========== RIWAYAT ==========
async function loadRiwayat() {
  try {
    const data = await invoke("cmd_get_all_kwitansi");
    currentRiwayatData = data;
    selectedKwitansiIds.clear();
    // Reset filter & pencarian agar data baru (mis. hasil import) selalu terlihat.
    // Filter basi adalah penyebab riwayat "hilang" setelah update.
    riwayatPeriodeFilter = "";
    const filterSel = document.getElementById("riwayat-periode-filter");
    if (filterSel) filterSel.value = "";
    const searchInput = document.getElementById("search-input");
    if (searchInput) searchInput.value = "";
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

let riwayatPeriodeFilter = "";
let riwayatSortKey = "";
let riwayatSortDir = "asc";

function groupKeyOf(k) {
  const bulan = k.bulan || "";
  const tahun = k.tahun_anggaran || "";
  return bulan ? `BKU ${bulan} ${tahun}`.trim() : "Tanpa BKU";
}

window.handlePeriodeFilterChange = function (value) {
  riwayatPeriodeFilter = value || "";
  const query = document.getElementById("search-input")?.value || "";
  if (query.trim() !== "") {
    handleSearch(query);
  } else {
    renderGrouped(currentRiwayatData);
  }
};

function applyPeriodeFilter(data) {
  return riwayatPeriodeFilter
    ? data.filter(k => groupKeyOf(k) === riwayatPeriodeFilter)
    : data;
}

/** Klik header kolom → urut naik/turun */
window.handleRiwayatSort = function (key) {
  if (riwayatSortKey === key) {
    riwayatSortDir = riwayatSortDir === "asc" ? "desc" : "asc";
  } else {
    riwayatSortKey = key;
    riwayatSortDir = "asc";
  }
  const query = document.getElementById("search-input")?.value || "";
  if (query.trim() !== "") renderTable(applyPeriodeFilter(currentRiwayatData));
  else renderGrouped(currentRiwayatData);
};

function sortArrow(key) {
  if (riwayatSortKey !== key) return "";
  const arrow = riwayatSortDir === "asc" ? "▲" : "▼";
  return ` <span style="color:var(--primary);">${arrow}</span>`;
}

function tanggalSortVal(s) {
  const p = parseTanggalParts(s);
  if (p) return p.y * 10000 + p.m * 100 + p.d;
  return 0;
}

function sortRiwayatRows(rows) {
  if (!riwayatSortKey) return rows;
  const dir = riwayatSortDir === "asc" ? 1 : -1;
  const val = (k) => {
    switch (riwayatSortKey) {
      case "nomor": return (k.nomor_kwitansi || "").toLowerCase();
      case "tanggal": return tanggalSortVal(k.tanggal);
      case "diterima": return (k.sudah_terima_dari || "").toLowerCase();
      case "jumlah": return k.jumlah || 0;
      case "uraian": return (k.untuk_pembayaran || "").toLowerCase();
      default: return 0;
    }
  };
  return [...rows].sort((a, b) => {
    const va = val(a), vb = val(b);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

function renderGrouped(data) {
  const container = document.getElementById("riwayat-container");

  // Isi dropdown periode dari data yang ada (sekali per render)
  const sel = document.getElementById("riwayat-periode-filter");
  if (sel) {
    const keys = Object.keys(groupByBku(data));
    if (riwayatPeriodeFilter && !keys.includes(riwayatPeriodeFilter)) {
      riwayatPeriodeFilter = "";
    }
    sel.innerHTML = `<option value="">Semua periode (${data.length})</option>` +
      keys.map(k => `<option value="${esc(k)}"${k === riwayatPeriodeFilter ? " selected" : ""}>${esc(k)}</option>`).join("");
  }

  const filtered = applyPeriodeFilter(data);

  if (filtered.length === 0) {
    container.innerHTML = '<div class="table-container"><table><tbody><tr><td class="empty">Belum ada data kwitansi pada periode ini</td></tr></tbody></table></div>';
    return;
  }

  const groups = groupByBku(filtered);
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
                  <th onclick="handleRiwayatSort('nomor')" style="cursor:pointer;user-select:none;" title="Klik untuk urutkan">Nomor Kwitansi${sortArrow('nomor')}</th>
                  <th onclick="handleRiwayatSort('tanggal')" style="cursor:pointer;user-select:none;" title="Klik untuk urutkan">Tanggal${sortArrow('tanggal')}</th>
                  <th onclick="handleRiwayatSort('diterima')" style="cursor:pointer;user-select:none;" title="Klik untuk urutkan">Diterima Dari${sortArrow('diterima')}</th>
                  <th onclick="handleRiwayatSort('jumlah')" style="cursor:pointer;user-select:none;" title="Klik untuk urutkan">Jumlah${sortArrow('jumlah')}</th>
                  <th onclick="handleRiwayatSort('uraian')" style="cursor:pointer;user-select:none;" title="Klik untuk urutkan">Untuk Pembayaran${sortArrow('uraian')}</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${sortRiwayatRows(items).map((k, i) => {
                  const bpu = isBpu(k.nomor_kwitansi);
                  const bnu = isBnu(k.nomor_kwitansi);
                  const posBtn = bpu ? `<button class="btn btn-sm btn-pos" title="Cetak nota POS" onclick="handleCetakPosRiwayat(${k.id})">🧾</button>` : "";
                  let badge = "";
                  if (bnu) badge = '<span class="badge badge-bnu">BNU</span>';
                  else if (bpu) badge = '<span class="badge badge-bpu">BPU</span>';
                  const pphBadge = k.kena_pph21 ? '<span class="badge badge-warn">PPh21</span>' : (k.kena_pph21_5 ? '<span class="badge badge-warn">PPh21 5%</span>' : (k.kena_pph23 ? '<span class="badge badge-warn">PPh23</span>' : (k.kena_pph23_2 ? '<span class="badge badge-warn">PPh23 2%</span>' : "")));
const ppnBadge = (k.ppn_nominal || 0) > 0 ? ' <span class="badge badge-ok">PPN</span>' : "";
                  return `
                  <tr>
                    <td><input type="checkbox" class="riwayat-check" data-id="${k.id}" onchange="handleRiwayatCheck()" ${selectedKwitansiIds.has(k.id) ? 'checked' : ''} /></td>
                    <td>${i + 1}</td>
                    <td>${esc(k.nomor_kwitansi)} ${badge} ${pphBadge}${ppnBadge}</td>
                    <td>${formatTanggal(k.tanggal)}</td>
                    <td>${esc(k.sudah_terima_dari)}</td>
                    <td class="rupiah">Rp ${formatRupiah(k.jumlah)}</td>
                    <td title="${esc(composePaymentSentence(k))}"><div class="uraian-wrap">${esc(truncatePayment(composePaymentSentence(k)))}</div></td>
                    <td>
                      <div class="actions">
                        <button class="btn btn-sm btn-primary" title="Cetak kwitansi" onclick="previewKwitansi(${k.id})">🖨️</button>
                        <button class="btn btn-sm btn-secondary" title="Edit kwitansi" onclick="openEditModal(${k.id})">✏️</button>
                        ${posBtn}
                        <button class="btn btn-sm btn-danger" title="Hapus kwitansi" onclick="hapusKwitansi(${k.id})">🗑️</button>
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
            <th onclick="handleRiwayatSort('nomor')" style="cursor:pointer;user-select:none;" title="Klik untuk urutkan">Nomor Kwitansi${sortArrow('nomor')}</th>
            <th onclick="handleRiwayatSort('tanggal')" style="cursor:pointer;user-select:none;" title="Klik untuk urutkan">Tanggal${sortArrow('tanggal')}</th>
            <th onclick="handleRiwayatSort('diterima')" style="cursor:pointer;user-select:none;" title="Klik untuk urutkan">Diterima Dari${sortArrow('diterima')}</th>
            <th onclick="handleRiwayatSort('jumlah')" style="cursor:pointer;user-select:none;" title="Klik untuk urutkan">Jumlah${sortArrow('jumlah')}</th>
            <th onclick="handleRiwayatSort('uraian')" style="cursor:pointer;user-select:none;" title="Klik untuk urutkan">Untuk Pembayaran${sortArrow('uraian')}</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${sortRiwayatRows(data).map((k, i) => {
            const bpu = isBpu(k.nomor_kwitansi);
            const bnu = isBnu(k.nomor_kwitansi);
            const posBtn = bpu ? `<button class="btn btn-sm btn-pos" title="Cetak nota POS" onclick="handleCetakPosRiwayat(${k.id})">🧾</button>` : "";
            let badge = "";
            if (bnu) badge = '<span class="badge badge-bnu">BNU</span>';
            else if (bpu) badge = '<span class="badge badge-bpu">BPU</span>';
            const pphBadge = k.kena_pph21 ? '<span class="badge badge-warn">PPh21</span>' : (k.kena_pph21_5 ? '<span class="badge badge-warn">PPh21 5%</span>' : (k.kena_pph23 ? '<span class="badge badge-warn">PPh23</span>' : (k.kena_pph23_2 ? '<span class="badge badge-warn">PPh23 2%</span>' : "")));
const ppnBadge = (k.ppn_nominal || 0) > 0 ? ' <span class="badge badge-ok">PPN</span>' : "";
            return `
            <tr>
              <td><input type="checkbox" class="riwayat-check" data-id="${k.id}" onchange="handleRiwayatCheck()" ${selectedKwitansiIds.has(k.id) ? 'checked' : ''} /></td>
              <td>${i + 1}</td>
              <td>${esc(k.nomor_kwitansi)} ${badge} ${pphBadge}${ppnBadge}</td>
              <td>${formatTanggal(k.tanggal)}</td>
              <td>${esc(k.sudah_terima_dari)}</td>
              <td class="rupiah">Rp ${formatRupiah(k.jumlah)}</td>
              <td title="${esc(composePaymentSentence(k))}"><div class="uraian-wrap">${esc(truncatePayment(composePaymentSentence(k)))}</div></td>
              <td>
                <div class="actions">
                  <button class="btn btn-sm btn-primary" title="Cetak kwitansi" onclick="previewKwitansi(${k.id})">🖨️</button>
                        <button class="btn btn-sm btn-secondary" title="Edit kwitansi" onclick="openEditModal(${k.id})">✏️</button>
                  ${posBtn}
                  <button class="btn btn-sm btn-danger" title="Hapus kwitansi" onclick="hapusKwitansi(${k.id})">🗑️</button>
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
      renderTable(applyPeriodeFilter(data)); // flat for search
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

// ========== EDIT KWITANSI (MODAL) ==========
let _editingKwitansi = null;

window.openEditModal = async function (id) {
  try {
    const k = await invoke("cmd_get_kwitansi", { id: id });
    _editingKwitansi = k;
    const set = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val ?? ""; };
    set("e_id", k.id);
    set("e_nomor_kwitansi", k.nomor_kwitansi);
    const tp = parseTanggalParts(k.tanggal);
    set("e_tanggal", tp ? `${tp.y}-${String(tp.m).padStart(2, "0")}-${String(tp.d).padStart(2, "0")}` : (k.tanggal || "").slice(0, 10));
    set("e_tahun_anggaran", k.tahun_anggaran);
    set("e_kode_rekening", k.kode_rekening);
    set("e_kode_kegiatan", k.kode_kegiatan || "");
    set("e_sudah_terima_dari", k.sudah_terima_dari);
    set("e_jumlah", Math.round(k.jumlah).toLocaleString("id-ID"));
    set("e_ppn", (k.ppn_nominal || 0) > 0 ? Math.round(k.ppn_nominal).toLocaleString("id-ID") : "");
    set("e_untuk_pembayaran", k.untuk_pembayaran);
    set("e_penerima", k.penerima);
    set("e_mengetahui", k.mengetahui);
    set("e_nip_mengetahui", k.nip_mengetahui);
    set("e_bendahara", k.bendahara);
    set("e_nip_bendahara", k.nip_bendahara);
    set("e_nama_toko", k.nama_toko || "");
    set("e_alamat_toko", k.alamat_toko || "");
    set("e_pimpinan_toko", k.pimpinan_toko || "");
    document.getElementById("e_cb_pph21").checked = !!k.kena_pph21;
    document.getElementById("e_cb_pph21_5").checked = !!k.kena_pph21_5;
    document.getElementById("e_cb_pph23").checked = !!k.kena_pph23;
    document.getElementById("e_cb_pph23_2").checked = !!k.kena_pph23_2;
    updateEditNetto();
    populateKegiatanDatalist();
    document.getElementById("modal-edit").classList.remove("hidden");
  } catch (e) {
    showToast("Gagal memuat kwitansi: " + e, "error");
  }
};

window.handleEditJumlahInput = function (el) {
  const raw = el.value.replace(/[^\d]/g, "");
  if (raw === "") { updateEditNetto(); return; }
  el.value = parseInt(raw).toLocaleString("id-ID");
  updateEditNetto();
};

window.handleEditPpnInput = function (el) {
  const raw = el.value.replace(/[^\d]/g, "");
  if (raw === "") { updateEditNetto(); return; }
  el.value = parseInt(raw).toLocaleString("id-ID");
  updateEditNetto();
};

window.handleEditPajakToggle = function (which) {
  const cb = (id) => document.getElementById(id);
  if (which === "pph21" && cb("e_cb_pph21").checked) { cb("e_cb_pph23").checked = false; cb("e_cb_pph23_2").checked = false; cb("e_cb_pph21_5").checked = false; }
  if (which === "pph21_5" && cb("e_cb_pph21_5").checked) { cb("e_cb_pph21").checked = false; cb("e_cb_pph23").checked = false; cb("e_cb_pph23_2").checked = false; }
  if (which === "pph23" && cb("e_cb_pph23").checked) { cb("e_cb_pph21").checked = false; cb("e_cb_pph21_5").checked = false; cb("e_cb_pph23_2").checked = false; }
  if (which === "pph23_2" && cb("e_cb_pph23_2").checked) { cb("e_cb_pph21").checked = false; cb("e_cb_pph21_5").checked = false; cb("e_cb_pph23").checked = false; }
  updateEditNetto();
};

function updateEditNetto() {
  const raw = (document.getElementById("e_jumlah")?.value || "0").replace(/[^\d]/g, "");
  const bruto = parseFloat(raw) || 0;
  const rate = document.getElementById("e_cb_pph21")?.checked ? 0.06
    : (document.getElementById("e_cb_pph21_5")?.checked ? 0.05
    : (document.getElementById("e_cb_pph23")?.checked ? 0.04
    : (document.getElementById("e_cb_pph23_2")?.checked ? 0.02 : 0)));
  const ppnRaw = (document.getElementById("e_ppn")?.value || "0").replace(/[^\d]/g, "");
  const ppn = parseFloat(ppnRaw) || 0;
  const netto = bruto - Math.round(bruto * rate) - ppn;
  const info = document.getElementById("e_netto_info");
  if (info) info.textContent = (rate > 0 || ppn > 0) ? `Total: Rp ${formatRupiah(netto)}` : `Rp ${formatRupiah(bruto)}`;
}

window.handleUpdateKwitansi = async function () {
  if (!_editingKwitansi) return;
  const jumlahRaw = (document.getElementById("e_jumlah").value || "0").replace(/[^\d]/g, "");
  const kena21 = document.getElementById("e_cb_pph21")?.checked || false;
  const kwitansi = {
    ..._editingKwitansi,
    nomor_kwitansi: document.getElementById("e_nomor_kwitansi").value,
    tanggal: document.getElementById("e_tanggal").value,
    sudah_terima_dari: document.getElementById("e_sudah_terima_dari").value,
    jumlah: parseFloat(jumlahRaw) || 0,
    terbilang: "",
    untuk_pembayaran: document.getElementById("e_untuk_pembayaran").value,
    kode_rekening: document.getElementById("e_kode_rekening").value,
    kode_kegiatan: document.getElementById("e_kode_kegiatan")?.value || "",
    tahun_anggaran: document.getElementById("e_tahun_anggaran").value,
    mengetahui: document.getElementById("e_mengetahui").value,
    nip_mengetahui: document.getElementById("e_nip_mengetahui").value,
    bendahara: document.getElementById("e_bendahara").value,
    nip_bendahara: document.getElementById("e_nip_bendahara").value,
    penerima: document.getElementById("e_penerima").value,
    nama_toko: document.getElementById("e_nama_toko")?.value || "",
    alamat_toko: document.getElementById("e_alamat_toko")?.value || "",
    pimpinan_toko: document.getElementById("e_pimpinan_toko")?.value || "",
    kena_pph21: kena21,
    kena_pph21_5: !kena21 && (document.getElementById("e_cb_pph21_5")?.checked || false),
    kena_pph23: !kena21 && !(document.getElementById("e_cb_pph21_5")?.checked || false) && (document.getElementById("e_cb_pph23")?.checked || false),
    kena_pph23_2: !kena21 && !(document.getElementById("e_cb_pph21_5")?.checked || false) && !(document.getElementById("e_cb_pph23")?.checked || false) && (document.getElementById("e_cb_pph23_2")?.checked || false),
    ppn_nominal: parseFloat((document.getElementById("e_ppn")?.value || "0").replace(/[^\d]/g, "")) || 0,
  };
  try {
    await invoke("cmd_update_kwitansi", { kwitansi: kwitansi });
    showToast("Kwitansi berhasil diperbarui", "success");
    window._closeModal("modal-edit");
    _editingKwitansi = null;
    await loadRiwayat();
  } catch (e) {
    showToast("Gagal menyimpan: " + e, "error");
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
  const n = selectedKwitansiIds.size;
  const btnPrint = document.getElementById("btn-cetak-batch");
  const btnDel = document.getElementById("btn-hapus-batch");
  if (btnPrint) {
    btnPrint.style.display = n >= 1 ? "inline-flex" : "none";
    btnPrint.textContent = `🖨️ Cetak yang Dipilih (${n})`;
  }
  if (btnDel) {
    btnDel.style.display = n >= 1 ? "inline-flex" : "none";
    btnDel.textContent = `🗑️ Hapus yang Dipilih (${n})`;
  }
}

window.handleHapusBatch = async function () {
  if (selectedKwitansiIds.size === 0) {
    showToast("Pilih minimal satu kwitansi", "warning");
    return;
  }
  if (!confirm(`Yakin hapus ${selectedKwitansiIds.size} kwitansi yang dipilih? Tindakan ini tidak bisa dibatalkan.`)) return;
  try {
    let ok = 0;
    for (const id of selectedKwitansiIds) {
      await invoke("cmd_delete_kwitansi", { id: id });
      ok++;
    }
    showToast(`${ok} kwitansi dihapus`, "success");
    selectedKwitansiIds.clear();
    await loadRiwayat();
  } catch (e) {
    showToast("Gagal menghapus: " + e, "error");
  }
};

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

// ========== PRINT SETTINGS ==========
async function loadPrintSettings() {
  try {
    currentPrintSettings = await invoke("cmd_get_print_settings");
    if (currentPrintSettings.field_positions === "{}" || !currentPrintSettings.field_positions) {
      currentPrintSettings.field_positions = JSON.stringify(DEFAULT_FIELD_POSITIONS);
    } else {
      // Bersihkan field lama yang sudah tidak dipakai (kode/tahun menyatu
      // dalam kalimat pembayaran, tanggal menyatu dalam blok penerima)
      try {
        const pos = JSON.parse(currentPrintSettings.field_positions);
        let dirty = false;
        for (const legacy of ["tahun_anggaran", "kode_rekening", "tanggal"]) {
          if (legacy in pos) { delete pos[legacy]; dirty = true; }
        }
        if (dirty) {
          currentPrintSettings.field_positions = JSON.stringify(pos);
          await invoke("cmd_save_print_settings", { settings: currentPrintSettings });
        }
      } catch (_) {}
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
      { key: "sudah_terima_dari", label: "Sudah Terima Dari", color: "#d97706" },
      { key: "uang_sejumlah", label: "Uang Sejumlah", color: "#d97706" },
      { key: "untuk_pembayaran", label: "Untuk Pembayaran (kalimat gabungan)", color: "#d97706" },
      { key: "jumlah_rp", label: "Jumlah Rp", color: "#dc2626" },
      { key: "pajak", label: "Pajak (Bruto/PPh/Netto)", color: "#ea580c" },
      { key: "mengetahui", label: "Mengetahui (Nama + NIP)", color: "#6366f1" },
      { key: "penerima", label: "Penerima + Tgl (Nama)", color: "#ec4899" },
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

  // Sinkronkan modal preview bila sedang terbuka (biar ikut angka terkini)
  if (currentPrintSettings) {
    const modal = document.getElementById("modal-cetak-preview");
    const modalContent = document.getElementById("modal-cetak-content");
    if (modal && modalContent && !modal.classList.contains("hidden")) {
      modalContent.innerHTML = renderKwitansiTemplate(SAMPLE_KWITANSI);
    }
  }
}

/** Buka modal preview cetak (khusus layar kecil — tampil penuh, bisa scroll) */
window.openCetakPreviewModal = function () {
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
  const modalContent = document.getElementById("modal-cetak-content");
  if (modalContent && currentPrintSettings) {
    modalContent.innerHTML = renderKwitansiTemplate(SAMPLE_KWITANSI);
  }
  document.getElementById("modal-cetak-preview")?.classList.remove("hidden");
};

/** Contoh data untuk preview live di Pengaturan Cetak */
const SAMPLE_KWITANSI = {
  id: null,
  nomor_kwitansi: "BPU12",
  tanggal: "2026-06-21",
  sudah_terima_dari: "Bendahara BOS SDN 1 Contoh",
  jumlah: 1500000,
  terbilang: "satu juta lima ratus ribu rupiah",
  untuk_pembayaran: "Belanja ATK dan tinta printer",
  kode_rekening: "5.1.02.01.01.0001",
  kode_kegiatan: "06.05.08",
  tahun_anggaran: "2026",
  bulan: "JUNI",
  mengetahui: "Dr. Contoh, M.Pd",
  nip_mengetahui: "19700101 199903 1 001",
  bendahara: "Nama Bendahara",
  nip_bendahara: "19800202 200501 2 002",
  penerima: "Toko Makmur Jaya",
  nama_toko: "",
  alamat_toko: "",
  pimpinan_toko: "",
  created_at: null,
  kena_pph21: false,
  kena_pph23: true,
};

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

  // Blok pajak (field draggable sendiri; kosong bila tidak kena pajak/PPN)
  let pajakBlock = "";
  const pphRate = k.kena_pph21 ? 0.06 : (k.kena_pph21_5 ? 0.05 : (k.kena_pph23 ? 0.04 : (k.kena_pph23_2 ? 0.02 : 0)));
  const ppn = (k.ppn_nominal || 0) > 0 ? Math.round(k.ppn_nominal) : 0;
  if (pphRate > 0 || ppn > 0) {
    const bruto = k.jumlah;
    const pph = Math.round(bruto * pphRate);
    const netto = bruto - pph - ppn;
    const label = k.kena_pph21 ? "PPh 21 6%" : (k.kena_pph21_5 ? "PPh 21 5%" : (k.kena_pph23 ? "PPh 23 4%" : "PPh 23 2%"));
    const ppnLine = ppn > 0 ? `<br>PPN: - Rp ${formatRupiah(ppn)}` : "";
    pajakBlock = `<div class="kv multi-line" style="${pos('pajak')}">Bruto: Rp ${formatRupiah(bruto)}<br>${label}: - Rp ${formatRupiah(pph)}${ppnLine}<br><b>Netto: Rp ${formatRupiah(netto)}</b></div>`;
  }

  return `
    <div class="kwitansi-page values-only" style="width:${s.paper_width}mm; min-height:${s.paper_height}mm; padding:${s.margin_top}mm ${s.margin_right}mm ${s.margin_bottom}mm ${s.margin_left}mm; font-size:${fontSize}pt;">
      <div class="kv" style="${pos('nomor')}">${esc(k.nomor_kwitansi)}</div>
      <div class="kv multi-line" style="${pos('sudah_terima_dari')}">${esc(k.sudah_terima_dari)}</div>
      <div class="kv multi-line" style="${pos('uang_sejumlah')}">${esc(capitalize(k.terbilang))}</div>
      <div class="kv multi-line" style="${pos('untuk_pembayaran')}">${esc(composePaymentSentence(k))}</div>
      <div class="kv jumlah" style="${pos('jumlah_rp')}">Rp ${formatRupiah(nettoJumlah(k))}</div>
      ${pajakBlock}
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

  // Blok pajak (PPh 21 6% / PPh 21 5% / PPh 23 4% / PPh 23 2% + PPN nominal opsional)
  let pphBlock = "";
  const pphRate = k.kena_pph21 ? 0.06 : (k.kena_pph21_5 ? 0.05 : (k.kena_pph23 ? 0.04 : (k.kena_pph23_2 ? 0.02 : 0)));
  const pphLabel = k.kena_pph21 ? "PPh 21 6%" : (k.kena_pph21_5 ? "PPh 21 5%" : (k.kena_pph23 ? "PPh 23 4%" : "PPh 23 2%"));
  const ppnFull = (k.ppn_nominal || 0) > 0 ? Math.round(k.ppn_nominal) : 0;
  if (pphRate > 0 || ppnFull > 0) {
    const bruto = k.jumlah;
    const pph = Math.round(bruto * pphRate);
    const netto = bruto - pph - ppnFull;
    const ppnLine = ppnFull > 0 ? `<div>PPN      : <b style="color:var(--danger);">- Rp ${formatRupiah(ppnFull)}</b></div>` : "";
    pphBlock = `
      <div style="margin-top:3mm; font-size:10pt; color:#333;">
        <div>Bruto    : <b>Rp ${formatRupiah(bruto)}</b></div>
        <div>${pphLabel}: <b style="color:var(--danger);">- Rp ${formatRupiah(pph)}</b></div>
        ${ppnLine}
        <div style="margin-top:1mm;"><b>Netto    : Rp ${formatRupiah(netto)}</b></div>
      </div>
    `;
  }

  return `
    <div class="kwitansi-page" style="width:${pw}mm; min-height:${ph}mm; padding:${mt}mm ${mr}mm ${mb}mm ${ml}mm; font-size:${fs}pt;">
      <div class="kwitansi-header">
        <h2>KWITANSI</h2>
        <div class="nomor">${esc(k.nomor_kwitansi)}</div>
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
          <span class="kwitansi-value">${esc(composePaymentSentence(k))}</span>
        </div>
        <div style="text-align: right; margin-top: 5mm;">
          <div class="kwitansi-jumlah-box">Rp ${formatRupiah(nettoJumlah(k))}</div>
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

// ========== POS SETTINGS MODAL (legacy, dipakai setup page) ==========

window.handleSimpanPosSettings = async function () {
  try {
    await invoke("cmd_save_pos_settings", { settings: readPosSetupForm() });
    await loadPosSettingsMod();
    showToast("Pengaturan POS disimpan", "success");
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

function readPosSetupForm() {
  const s = getPosSettings() || {};
  return {
    id: s.id || null,
    paper_width: parseInt(document.getElementById("pos_setup_paper_width")?.value || "58"),
    port: document.getElementById("pos_setup_port")?.value || "",
    baud_rate: parseInt(document.getElementById("pos_setup_baud_rate")?.value || "9600"),
    header_text: document.getElementById("pos_setup_header")?.value || "",
    footer_text: document.getElementById("pos_setup_footer")?.value || "",
  };
}

/** Scan port serial + isi dropdown, pertahankan pilihan tersimpan */
window.handleScanPorts = async function (silent) {
  const sel = document.getElementById("pos_setup_port");
  let ports = [];
  try {
    ports = await invoke("cmd_list_serial_ports");
  } catch (e) {
    if (!silent && window._showToast) window._showToast("Gagal scan: " + e, "error");
    ports = [];
  }
  if (sel) {
    const cur = sel.value || (getPosSettings()?.port || "");
    sel.innerHTML = `<option value="">— pilih port —</option>` +
      ports.map(p => `<option value="${p}"${p === cur ? " selected" : ""}>${p}</option>`).join("") +
      (cur && !ports.includes(cur) ? `<option value="${cur}" selected>${cur} (tersimpan)</option>` : "");
    if (!sel.value && ports.length === 1) sel.value = ports[0];
  }
  if (!silent) {
    if (window._showToast) {
      if (ports.length === 0) window._showToast("Tidak ada port COM terdeteksi — instal driver USB-Serial printer dulu", "warning");
      else window._showToast(`${ports.length} port ditemukan: ${ports.join(", ")}`, "success");
    }
  }
  return ports;
};

async function loadPosSetupPage() {
  try {
    const s = await invoke("cmd_get_pos_settings");
    await loadPosSettingsMod();
    await window.handleScanPorts(true);
    const sel = document.getElementById("pos_setup_port");
    if (sel && s.port) {
      if (![...sel.options].some(o => o.value === s.port)) {
        sel.innerHTML += `<option value="${s.port}" selected>${s.port} (tersimpan)</option>`;
      }
      sel.value = s.port;
    }
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
  try {
    await invoke("cmd_save_pos_settings", { settings: readPosSetupForm() });
    await loadPosSettingsMod();
    showToast("Pengaturan printer thermal disimpan", "success");
  } catch (e) {
    showToast("Gagal simpan: " + e, "error");
  }
};

window.handlePosSetupTestPrint = async function () {
  // Test pakai nilai di layar apa adanya — TANPA menyimpan + tanpa toast simpan.
  try {
    await invoke("cmd_pos_test_print_with", { settings: readPosSetupForm() });
    showToast("Test print berhasil dikirim", "success");
  } catch (e) {
    showToast("Gagal test print: " + e, "error");
  }
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

/** Total bayar: bruto − PPh − PPN nominal (bruto jika tidak kena) */
function nettoJumlah(k) {
  let v = k.jumlah;
  if (k.kena_pph21) v -= Math.round(k.jumlah * 0.06);
  else if (k.kena_pph21_5) v -= Math.round(k.jumlah * 0.05);
  else if (k.kena_pph23) v -= Math.round(k.jumlah * 0.04);
  else if (k.kena_pph23_2) v -= Math.round(k.jumlah * 0.02);
  if ((k.ppn_nominal || 0) > 0) v -= Math.round(k.ppn_nominal);
  return v;
}

/** Gabung uraian + uraian resmi ARKAS + kode rekening + tahun anggaran jadi 1 kalimat.
 * Uraian resmi dilookup dari Kode-Rekening-ARKAS-2026-Lengkap.pdf (kode-referensi.js). */
function composePaymentSentence(k) {
  const raw = (k.untuk_pembayaran || "").trim().replace(/\s+/g, " ").replace(/[.]+$/, "");
  const resmi = cariUraianKegiatan(k.kode_kegiatan) || cariUraianKegiatan(k.kode_rekening);
  const rawLower = raw.toLowerCase();
  const base = (resmi && !rawLower.includes(resmi.toLowerCase()))
    ? (raw ? `${raw} untuk ${resmi}` : resmi)
    : raw;
  const kode = (k.kode_rekening || "").trim();
  const tahun = (k.tahun_anggaran || "").trim();
  const hasKode = kode && !base.includes(kode);
  const hasTahun = tahun && !base.includes(tahun);
  if (!base && !hasKode && !hasTahun) return "";
  if (!base) {
    if (hasKode && hasTahun) return `Dengan Kode Rekening ${kode} pada Tahun Anggaran ${tahun}`;
    if (hasKode) return `Dengan Kode Rekening ${kode}`;
    return `Pada Tahun Anggaran ${tahun}`;
  }
  if (hasKode && hasTahun) return `${base} dengan Kode Rekening ${kode} pada Tahun Anggaran ${tahun}`;
  if (hasKode) return `${base} dengan Kode Rekening ${kode}`;
  if (hasTahun) return `${base} pada Tahun Anggaran ${tahun}`;
  return base;
}

/** Isi datalist saran kode kegiatan resmi ARKAS (dipakai modal edit) */
function populateKegiatanDatalist() {
  const dl = document.getElementById("kode_kegiatan_list");
  if (!dl || dl.dataset.filled) return;
  dl.innerHTML = DAFTAR_KEGIATAN.map(([c, u]) => `<option value="${c}">${u}</option>`).join("");
  dl.dataset.filled = "1";
}

function defaultSudahTerimaDari() {
  const nama = sekolahData?.nama_sekolah?.trim() || "";
  return nama ? `Bendahara BOS ${nama}` : "Bendahara BOS";
}
window._defaultSudahTerimaDari = defaultSudahTerimaDari;

function formatRupiah(num) {
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const NAMA_BULAN_PANJANG = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

/** Parse YYYY-MM-DD atau DD-MM-YYYY (juga / dan .) -> {d,m,y} */
function parseTanggalParts(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return { d: parseInt(m[3], 10), m: parseInt(m[2], 10), y: parseInt(m[1], 10) };
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
  if (m) return { d: parseInt(m[1], 10), m: parseInt(m[2], 10), y: parseInt(m[3], 10) };
  return null;
}

function formatTanggal(dateStr) {
  if (!dateStr) return "-";
  const p = parseTanggalParts(dateStr);
  if (p && p.m >= 1 && p.m <= 12) {
    return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function formatTanggalPanjang(dateStr) {
  if (!dateStr) return "-";
  const p = parseTanggalParts(dateStr);
  if (p && p.m >= 1 && p.m <= 12) {
    return `${p.d} ${NAMA_BULAN_PANJANG[p.m - 1]} ${p.y}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return `${d.getDate()} ${NAMA_BULAN_PANJANG[d.getMonth()]} ${d.getFullYear()}`;
}

function truncatePayment(s) {
  const t = s || "";
  return t.length > 60 ? t.substring(0, 60) + "..." : t;
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
