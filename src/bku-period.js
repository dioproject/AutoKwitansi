import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

let currentBkuPeriodData = [];
let currentGrouped = [];

window.openBkuPeriodDialog = async function () {
  try {
    const filePaths = await open({
      multiple: true,
      filters: [{ name: "PDF BKU", extensions: ["pdf"] }],
    });
    if (!filePaths || filePaths.length === 0) return;
    await processBkuPeriodFiles(filePaths);
  } catch (e) {
    if (window._showToast) window._showToast("Gagal membuka dialog: " + e, "error");
  }
};

async function processBkuPeriodFiles(filePaths) {
  const loading = document.getElementById("bku-period-loading");
  const preview = document.getElementById("bku-period-preview");
  const settings = document.getElementById("bku-period-settings");

  if (loading) loading.classList.remove("hidden");
  if (preview) preview.classList.add("hidden");
  if (settings) settings.classList.add("hidden");

  try {
    const result = await invoke("cmd_parse_bku_pdfs", { filePaths });
    currentBkuPeriodData = result;

    const grouped = groupByPeriod(result);
    currentGrouped = grouped;
    renderPeriodPreview(grouped);

    if (settings) settings.classList.remove("hidden");
    if (preview) preview.classList.remove("hidden");

    // Bug #10: Auto-fill dari data sekolah (konsisten dengan PDF BKU biasa di main.js)
    const sekolah = window._sekolahData;
    if (sekolah) {
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
      setVal("bku-period-mengetahui", sekolah.kepala_sekolah);
      setVal("bku-period-nip-mengetahui", sekolah.nip_kepala);
      setVal("bku-period-bendahara", sekolah.bendahara);
      setVal("bku-period-nip-bendahara", sekolah.nip_bendahara);
    }

    if (window._showToast) window._showToast(`${result.length} BKU berhasil diproses`, "success");
  } catch (e) {
    if (window._showToast) window._showToast("Gagal memproses PDF: " + e, "error");
  } finally {
    if (loading) loading.classList.add("hidden");
  }
}

function groupByPeriod(data) {
  const map = {};
  let counter = 0;
  for (const item of data) {
    const key = `${item.bulan} ${item.tahun}`;
    if (!map[key]) {
      map[key] = { id: `grp-${counter++}`, bulan: item.bulan, tahun: item.tahun, transactions: [] };
    }
    map[key].transactions.push(...item.transactions);
  }
  return Object.values(map);
}

function renderPeriodPreview(grouped) {
  const tbody = document.getElementById("bku-period-tbody");
  if (!tbody) return;

  const countEl = document.getElementById("bku-period-count");
  if (countEl) countEl.textContent = grouped.reduce((sum, g) => sum + g.transactions.length, 0);

  let html = "";
  for (const group of grouped) {
    html += `<tr class="period-header-row">
      <td colspan="7" style="background:linear-gradient(135deg,#e8effc,#dbeafe);font-weight:700;padding:10px 14px;border-bottom:2px solid var(--primary);">
        <span style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:16px;">📅</span>
          <span style="color:var(--primary);">BKU</span>
          <input type="text" class="period-bulan-input" data-group="${group.id}" value="${esc(group.bulan)}" style="width:100px;font-weight:700;font-size:13px;padding:4px 8px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;" placeholder="Bulan" />
          <input type="text" class="period-tahun-input" data-group="${group.id}" value="${esc(group.tahun)}" style="width:70px;font-weight:700;font-size:13px;padding:4px 8px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;" placeholder="Tahun" />
          <span style="margin-left:auto;font-size:12px;font-weight:400;color:var(--text-muted);">${group.transactions.length} transaksi</span>
        </span>
      </td>
    </tr>`;
    for (let i = 0; i < group.transactions.length; i++) {
      const tx = group.transactions[i];
      const pph21 = (tx.no_bukti||'').toUpperCase().includes('BNU') || (tx.kode_kegiatan||'').includes('07.12.04') || (tx.uraian||'').toLowerCase().match(/honor|instruktur/);
      html += `
        <tr>
          <td><input type="checkbox" class="period-row-check" data-group="${group.id}" data-index="${i}" checked /></td>
          <td>${esc(tx.no_bukti)} ${pph21 ? '<span class="badge badge-warn" style="font-size:10px;">PPh21</span>' : ''}</td>
          <td>${esc(tx.tanggal)}</td>
          <td>${esc(tx.kode_rekening)}</td>
          <td title="${esc(tx.uraian)}">${esc(tx.uraian.length > 50 ? tx.uraian.substring(0, 50) + "..." : tx.uraian)}</td>
          <td class="rupiah" style="text-align:right;">Rp ${formatRupiah(tx.pengeluaran)}</td>
          <td><input type="text" class="period-penerima-input" data-group="${group.id}" data-index="${i}" value="${esc(tx.penerima)}" placeholder="Penerima..." style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px;width:130px;" /></td>
        </tr>`;
    }
  }
  tbody.innerHTML = html;
}

window.toggleSelectAllPeriod = function (el) {
  document.querySelectorAll(".period-row-check").forEach((cb) => {
    cb.checked = el.checked;
  });
};

window.handleImportBkuPeriod = async function () {
  if (currentGrouped.length === 0) {
    if (window._showToast) window._showToast("Tidak ada data untuk diimport", "warning");
    return;
  }

  const groupMap = {};

  for (const group of currentGrouped) {
    const bulanInput = document.querySelector(`.period-bulan-input[data-group="${group.id}"]`);
    const tahunInput = document.querySelector(`.period-tahun-input[data-group="${group.id}"]`);
    const bulan = bulanInput ? bulanInput.value.trim() : group.bulan;
    const tahun = tahunInput ? tahunInput.value.trim() : group.tahun;

    const checked = document.querySelectorAll(`.period-row-check[data-group="${group.id}"]:checked`);
    if (checked.length === 0) continue;

    const txns = [];
    checked.forEach((cb) => {
      const idx = parseInt(cb.dataset.index);
      if (group.transactions[idx]) {
        const tx = { ...group.transactions[idx] };
        const input = document.querySelector(`.period-penerima-input[data-group="${group.id}"][data-index="${idx}"]`);
        if (input) tx.penerima = input.value;
        txns.push(tx);
      }
    });

    if (txns.length > 0) {
      if (!groupMap[group.id]) groupMap[group.id] = { bulan, tahun, transactions: [] };
      groupMap[group.id].transactions.push(...txns);
    }
  }

  const items = Object.values(groupMap);
  if (items.length === 0) {
    if (window._showToast) window._showToast("Pilih minimal satu transaksi", "warning");
    return;
  }

  try {
    const count = await invoke("cmd_import_bku_period", {
      items,
      tahunAnggaran: items[0]?.tahun || new Date().getFullYear().toString(),
      sudahTerimaDari: window._defaultSudahTerimaDari ? window._defaultSudahTerimaDari() : "Bendahara BOS",
      mengetahui: document.getElementById("bku-period-mengetahui")?.value || "",
      nipMengetahui: document.getElementById("bku-period-nip-mengetahui")?.value || "",
      bendahara: document.getElementById("bku-period-bendahara")?.value || "",
      nipBendahara: document.getElementById("bku-period-nip-bendahara")?.value || "",
    });
    if (window._showToast) window._showToast(`${count} kwitansi berhasil diimport`, "success");
    resetBkuPeriod();
    if (window._showPage) window._showPage("riwayat");
  } catch (e) {
    if (window._showToast) window._showToast("Gagal import: " + e, "error");
  }
};

window.resetBkuPeriod = function () {
  currentBkuPeriodData = [];
  currentGrouped = [];
  const loading = document.getElementById("bku-period-loading");
  const preview = document.getElementById("bku-period-preview");
  const settings = document.getElementById("bku-period-settings");
  if (loading) loading.classList.add("hidden");
  if (preview) preview.classList.add("hidden");
  if (settings) settings.classList.add("hidden");
};

function esc(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatRupiah(num) {
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

window._bkuPeriodReady = true;
