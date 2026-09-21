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
    initPeriodRows();
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

// ========== GABUNG TRANSAKSI MANUAL (PER BULAN) ==========
// periodRowsByGroup[groupId] = array of { rid, tx, orig, count }
let periodRowsByGroup = {};
let periodRidCounter = 0;

function initPeriodRows() {
  periodRidCounter = 0;
  periodRowsByGroup = {};
  for (const g of currentGrouped) {
    periodRowsByGroup[g.id] = g.transactions.map(tx => ({ rid: periodRidCounter++, tx: { ...tx }, orig: null, count: 1 }));
  }
}

function getPeriodRows(group) {
  return periodRowsByGroup[group.id] || [];
}

function capturePeriodPenerimaEdits() {
  document.querySelectorAll(".period-penerima-input").forEach(inp => {
    const gid = inp.dataset.group;
    const rid = parseInt(inp.dataset.rid);
    const row = (periodRowsByGroup[gid] || []).find(r => r.rid === rid);
    if (row) row.tx.penerima = inp.value;
  });
}

function mergePeriodByRids(gid, rids) {
  const rows = periodRowsByGroup[gid] || [];
  const ridSet = new Set(rids);
  const rowsToMerge = rows.filter(r => ridSet.has(r.rid));
  if (rowsToMerge.length < 2) return false;
  const firstIdx = rows.findIndex(r => ridSet.has(r.rid));
  const mergedRow = {
    rid: periodRidCounter++,
    tx: window._mergeDisplayRows(rowsToMerge),
    orig: rowsToMerge.map(r => ({ rid: r.rid, tx: r.tx, orig: r.orig, count: r.count })),
    count: rowsToMerge.reduce((s, r) => s + (r.count || 1), 0),
  };
  periodRowsByGroup[gid] = rows.filter(r => !ridSet.has(r.rid));
  periodRowsByGroup[gid].splice(Math.min(firstIdx, periodRowsByGroup[gid].length), 0, mergedRow);
  return true;
}

window.handleGabungPeriodSelected = function () {
  capturePeriodPenerimaEdits();
  const byGroup = new Map();
  document.querySelectorAll(".period-row-check:checked").forEach(cb => {
    const gid = cb.dataset.group;
    if (!byGroup.has(gid)) byGroup.set(gid, []);
    byGroup.get(gid).push(parseInt(cb.dataset.rid));
  });
  let totalMerged = 0;
  for (const [gid, rids] of byGroup) {
    if (rids.length >= 2 && mergePeriodByRids(gid, rids)) totalMerged += rids.length;
  }
  renderPeriodPreview(currentGrouped);
  if (totalMerged === 0) {
    if (window._showToast) window._showToast("Centang minimal 2 baris dalam bulan yang sama", "warning");
  } else {
    if (window._showToast) window._showToast(`${totalMerged} transaksi digabung`, "success");
  }
};

window.handleGabungPeriodAutoKode = function () {
  capturePeriodPenerimaEdits();
  let mergedGroups = 0;
  for (const g of currentGrouped) {
    const byKode = new Map();
    for (const row of getPeriodRows(g)) {
      const key = (row.tx.kode_rekening || "").trim() || "(tanpa kode)";
      if (!byKode.has(key)) byKode.set(key, []);
      byKode.get(key).push(row.rid);
    }
    for (const [, ridList] of byKode) {
      if (ridList.length >= 2 && mergePeriodByRids(g.id, ridList)) mergedGroups++;
    }
  }
  renderPeriodPreview(currentGrouped);
  if (window._showToast) {
    if (mergedGroups === 0) window._showToast("Tidak ada transaksi dengan kode rekening sama", "warning");
    else window._showToast(`${mergedGroups} grup kode rekening digabung otomatis`, "success");
  }
};

window.handleUraiPeriodRow = function (gid, rid) {
  const rows = periodRowsByGroup[gid] || [];
  const idx = rows.findIndex(r => r.rid === rid);
  if (idx < 0 || !rows[idx].orig) return;
  rows.splice(idx, 1, ...rows[idx].orig);
  renderPeriodPreview(currentGrouped);
  if (window._showToast) window._showToast("Gabungan diuraikan", "success");
};

window.handleUraiPeriodSemua = function () {
  initPeriodRows();
  renderPeriodPreview(currentGrouped);
  if (window._showToast) window._showToast("Semua gabungan diuraikan", "success");
};

function renderPeriodPreview(grouped) {
  const tbody = document.getElementById("bku-period-tbody");
  if (!tbody) return;

  const countEl = document.getElementById("bku-period-count");
  if (countEl) {
    countEl.textContent = grouped.reduce((sum, g) => sum + getPeriodRows(g).length, 0);
  }

  let html = "";
  for (const group of grouped) {
    const rows = getPeriodRows(group);
    html += `<tr class="period-header-row">
      <td colspan="7" style="background:linear-gradient(135deg,#e8effc,#dbeafe);font-weight:700;padding:10px 14px;border-bottom:2px solid var(--primary);">
        <span style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:16px;">📅</span>
          <span style="color:var(--primary);">BKU</span>
          <input type="text" class="period-bulan-input" data-group="${group.id}" value="${esc(group.bulan)}" style="width:100px;font-weight:700;font-size:13px;padding:4px 8px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;" placeholder="Bulan" />
          <input type="text" class="period-tahun-input" data-group="${group.id}" value="${esc(group.tahun)}" style="width:70px;font-weight:700;font-size:13px;padding:4px 8px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;" placeholder="Tahun" />
          <span style="margin-left:auto;font-size:12px;font-weight:400;color:var(--text-muted);">${rows.length} transaksi</span>
        </span>
      </td>
    </tr>`;
    for (const row of rows) {
      const tx = row.tx;
      const pph21 = (tx.no_bukti||'').toUpperCase().includes('BNU') || (tx.kode_kegiatan||'').includes('07.12.04') || (tx.uraian||'').toLowerCase().match(/honor|instruktur/);
      const gabBadge = row.count > 1
        ? ` <span class="badge badge-period" title="Gabungan ${row.count} transaksi">${row.count}x</span> <button type="button" class="btn btn-sm btn-secondary" style="padding:1px 7px;font-size:11px;" title="Uraikan gabungan ini" onclick="handleUraiPeriodRow('${group.id}', ${row.rid})">&#10006;</button>`
        : "";
      html += `
        <tr${row.count > 1 ? ' style="background:#fffbeb;"' : ""}>
          <td><input type="checkbox" class="period-row-check" data-group="${group.id}" data-rid="${row.rid}" checked /></td>
          <td>${esc(tx.no_bukti)}${gabBadge} ${pph21 ? '<span class="badge badge-warn" style="font-size:10px;">PPh21</span>' : ''}</td>
          <td>${esc(tx.tanggal)}</td>
          <td>${esc(tx.kode_rekening)}</td>
          <td title="${esc(tx.uraian)}">${esc(tx.uraian.length > 50 ? tx.uraian.substring(0, 50) + "..." : tx.uraian)}</td>
          <td class="rupiah" style="text-align:right;">Rp ${formatRupiah(tx.pengeluaran)}</td>
          <td><input type="text" class="period-penerima-input" data-group="${group.id}" data-rid="${row.rid}" value="${esc(tx.penerima)}" placeholder="Penerima..." style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px;width:130px;" /></td>
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

    const checkedRids = new Set(
      [...document.querySelectorAll(`.period-row-check[data-group="${group.id}"]:checked`)].map(cb => parseInt(cb.dataset.rid))
    );
    if (checkedRids.size === 0) continue;

    capturePeriodPenerimaEdits();
    const txns = getPeriodRows(group)
      .filter(row => checkedRids.has(row.rid))
      .map(row => ({ ...row.tx }));

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
  periodRowsByGroup = {};
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
