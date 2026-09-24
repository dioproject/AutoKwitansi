import { invoke } from "@tauri-apps/api/core";
import { needsDocuments, loadDocStatus, allDocsComplete } from "./bpu-docs.js";

// ========== REKAP SPJ ==========
// Modul mandiri (_HELPER lokal mengikuti pola bku-period.js_):
// tabel rekap per periode + total, cetak rekap (kop + TTD), export CSV.

let rekapData = [];
let rekapFilter = "";

function groupKeyOf(k) {
  const bulan = k.bulan || "";
  const tahun = k.tahun_anggaran || "";
  return bulan ? `BKU ${bulan} ${tahun}`.trim() : "Tanpa BKU";
}

/** Rincian angka mengikuti aturan backend (PPh eksklusif 6%>5%>4%>2%, PPN nominal mengurangi) */
function rincian(k) {
  const bruto = k.jumlah || 0;
  let rate = 0;
  let label = "-";
  if (k.kena_pph21) { rate = 0.06; label = "PPh 21 6%"; }
  else if (k.kena_pph21_5) { rate = 0.05; label = "PPh 21 5%"; }
  else if (k.kena_pph23) { rate = 0.04; label = "PPh 23 4%"; }
  else if (k.kena_pph23_2) { rate = 0.02; label = "PPh 23 2%"; }
  const pph = Math.round(bruto * rate);
  const ppn = (k.ppn_nominal || 0) > 0 ? Math.round(k.ppn_nominal) : 0;
  return { bruto, pph, label, ppn, total: bruto - pph - ppn };
}

window._loadRekap = async function () {
  try {
    rekapData = await invoke("cmd_get_all_kwitansi");
    renderRekapFilter();
    renderRekap();
  } catch (e) {
    if (window._showToast) window._showToast("Gagal memuat rekap: " + e, "error");
  }
};

window.handleRekapPeriodeChange = function (value) {
  rekapFilter = value || "";
  renderRekap();
};

function filteredRows() {
  return rekapFilter ? rekapData.filter(k => groupKeyOf(k) === rekapFilter) : rekapData;
}

function renderRekapFilter() {
  const sel = document.getElementById("rekap-periode-filter");
  if (!sel) return;
  const keys = [...new Set(rekapData.map(groupKeyOf))];
  if (rekapFilter && !keys.includes(rekapFilter)) rekapFilter = "";
  sel.innerHTML = `<option value="">Semua periode (${rekapData.length})</option>` +
    keys.map(k => `<option value="${esc(k)}"${k === rekapFilter ? " selected" : ""}>${esc(k)}</option>`).join("");
}

function renderRekap() {
  const rows = filteredRows();
  const tbody = document.getElementById("rekap-tbody");
  const tfoot = document.getElementById("rekap-tfoot");
  const summary = document.getElementById("rekap-summary");
  if (!tbody) return;

  let sBruto = 0, sPph = 0, sPpn = 0, sTotal = 0;
  tbody.innerHTML = rows.length === 0
    ? '<tr><td colspan="8" class="empty">Belum ada data pada periode ini</td></tr>'
    : rows.map((k, i) => {
        const r = rincian(k);
        sBruto += r.bruto; sPph += r.pph; sPpn += r.ppn; sTotal += r.total;
        const ur = (k.untuk_pembayaran || "");
        return `<tr>
          <td>${i + 1}</td>
          <td>${esc(k.nomor_kwitansi)}</td>
          <td>${formatTanggal(k.tanggal)}</td>
          <td title="${esc(ur)}"><div class="uraian-wrap">${esc(ur.length > 80 ? ur.substring(0, 80) + "..." : ur)}</div></td>
          <td class="rupiah" style="text-align:right;">${formatRupiah(r.bruto)}</td>
          <td class="rupiah" style="text-align:right;">${formatRupiah(r.pph)}</td>
          <td class="rupiah" style="text-align:right;">${formatRupiah(r.ppn)}</td>
          <td class="rupiah" style="text-align:right;"><b>${formatRupiah(r.total)}</b></td>
        </tr>`;
      }).join("");

  if (tfoot) {
    tfoot.innerHTML = `<tr style="background:#f8fafc;font-weight:700;">
      <td colspan="4" style="text-align:right;">TOTAL (${rows.length} kwitansi)</td>
      <td class="rupiah" style="text-align:right;">${formatRupiah(sBruto)}</td>
      <td class="rupiah" style="text-align:right;">${formatRupiah(sPph)}</td>
      <td class="rupiah" style="text-align:right;">${formatRupiah(sPpn)}</td>
      <td class="rupiah" style="text-align:right;">${formatRupiah(sTotal)}</td>
    </tr>`;
  }
  if (summary) {
    summary.innerHTML = [
      ["Kwitansi", String(rows.length)],
      ["Bruto", "Rp " + formatRupiah(sBruto)],
      ["PPh", "Rp " + formatRupiah(sPph)],
      ["PPN", "Rp " + formatRupiah(sPpn)],
      ["Total", "Rp " + formatRupiah(sTotal)],
    ].map(([l, v]) => `<div style="background:var(--bg-card);padding:12px 18px;border-radius:var(--radius);box-shadow:var(--shadow);min-width:130px;">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">${l}</div>
      <div style="font-size:17px;font-weight:700;margin-top:2px;">${v}</div>
    </div>`).join("");
  }
}

window.handleValidasiLPJ = async function () {
  const box = document.getElementById("rekap-validasi");
  const rows = filteredRows();
  const issues = []; // {id, nomor, pesan}

  // Hitung duplikat nomor dalam cakupan ini
  const countNomor = {};
  for (const k of rows) {
    const key = (k.nomor_kwitansi || "").trim();
    if (key) countNomor[key] = (countNomor[key] || 0) + 1;
  }

  for (const k of rows) {
    const ref = `${k.nomor_kwitansi || "(tanpa nomor)"}`;
    if (!(k.penerima || "").trim()) issues.push({ id: k.id, nomor: ref, pesan: "Penerima kosong" });
    if (!(k.jumlah > 0)) issues.push({ id: k.id, nomor: ref, pesan: "Nominal nol/kosong" });
    if (!(k.untuk_pembayaran || "").trim()) issues.push({ id: k.id, nomor: ref, pesan: "Uraian kosong" });
    if (!parseTanggalParts(k.tanggal)) issues.push({ id: k.id, nomor: ref, pesan: `Tanggal tidak valid (${k.tanggal || "kosong"})` });
    if ((k.nomor_kwitansi || "").trim() && countNomor[k.nomor_kwitansi.trim()] > 1) {
      issues.push({ id: k.id, nomor: ref, pesan: "Nomor duplikat" });
    }
  }
  // Dokumen BPU >1jt (async, hanya yang butuh)
  for (const k of rows) {
    try {
      if (needsDocuments(k)) {
        const st = await loadDocStatus(k.id);
        if (!allDocsComplete(st)) {
          issues.push({ id: k.id, nomor: k.nomor_kwitansi, pesan: "Dokumen BPU belum lengkap" });
        }
      }
    } catch (_) {}
  }

  if (!box) return;
  const scope = rekapFilter || "Semua periode";
  if (issues.length === 0) {
    box.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;color:#065f46;font-weight:600;">
      ✅ Siap LPJ — ${rows.length} kwitansi (${esc(scope)}) tidak ada masalah.</div>`;
    return;
  }
  // Kelompokkan per jenis masalah
  const byPesan = {};
  for (const it of issues) {
    if (!byPesan[it.pesan]) byPesan[it.pesan] = [];
    byPesan[it.pesan].push(it);
  }
  box.innerHTML = `<div style="padding:10px 14px;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;color:#92400e;font-weight:600;margin-bottom:10px;">
      ⚠️ ${issues.length} temuan di ${esc(scope)} — klik Perbaiki untuk betulkan via modal Edit.</div>` +
    Object.entries(byPesan).map(([pesan, items]) => `
      <div style="margin-bottom:8px;">
        <div style="font-weight:700;margin-bottom:4px;">${esc(pesan)} (${items.length})</div>
        ${items.map(it => `<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px dashed var(--border);">
          <span style="font-family:monospace;">${esc(it.nomor)}</span>
          <button class="btn btn-sm btn-secondary" onclick="openEditModal(${it.id})">Perbaiki</button>
        </div>`).join("")}
      </div>`).join("");
};

window.handleExportRekapCsv = function () {
  const rows = filteredRows();
  if (rows.length === 0) {
    if (window._showToast) window._showToast("Tidak ada data untuk diekspor", "warning");
    return;
  }
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ["Nomor;Tanggal;Periode;Uraian;Kode Rekening;Tahun Anggaran;Bruto;Pajak;PPh;PPN;Total;Penerima"];
  for (const k of rows) {
    const r = rincian(k);
    lines.push([k.nomor_kwitansi, k.tanggal, groupKeyOf(k), k.untuk_pembayaran,
      k.kode_rekening, k.tahun_anggaran, Math.round(r.bruto), r.label,
      Math.round(r.pph), Math.round(r.ppn), Math.round(r.total), k.penerima].map(q).join(";"));
  }
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rekap-spj-${(rekapFilter || "semua").replace(/\s+/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  if (window._showToast) window._showToast(`${rows.length} baris diekspor ke CSV`, "success");
};

window.handleCetakRekap = async function () {
  const rows = filteredRows();
  if (rows.length === 0) {
    if (window._showToast) window._showToast("Tidak ada data untuk dicetak", "warning");
    return;
  }
  let sekolah = null;
  try { sekolah = await invoke("cmd_get_sekolah"); } catch (_) {}

  let sBruto = 0, sPph = 0, sPpn = 0, sTotal = 0;
  const body = rows.map((k, i) => {
    const r = rincian(k);
    sBruto += r.bruto; sPph += r.pph; sPpn += r.ppn; sTotal += r.total;
    return `<tr>
      <td style="text-align:center;">${i + 1}</td>
      <td>${esc(k.nomor_kwitansi)}</td>
      <td>${formatTanggal(k.tanggal)}</td>
      <td>${esc(k.untuk_pembayaran || "")}</td>
      <td style="text-align:right;">${formatRupiah(r.bruto)}</td>
      <td style="text-align:right;">${formatRupiah(r.pph)}</td>
      <td style="text-align:right;">${formatRupiah(r.ppn)}</td>
      <td style="text-align:right;"><b>${formatRupiah(r.total)}</b></td>
    </tr>`;
  }).join("");

  const periodeLabel = rekapFilter || "Semua Periode";
  const tglCetak = formatTanggalPanjang(new Date().toISOString().split("T")[0]);
  const container = document.getElementById("print-container");
  if (!container) return;
  container.innerHTML = `
    <div class="kwitansi-page" style="width:190mm;min-height:250mm;">
      <div style="text-align:center;margin-bottom:5mm;">
        <div style="font-size:14pt;font-weight:bold;">${esc(sekolah?.nama_sekolah || "REKAPITULASI PENGELUARAN")}</div>
        ${sekolah?.alamat ? `<div style="font-size:10pt;">${esc(sekolah.alamat)}${sekolah.kota ? ", " + esc(sekolah.kota) : ""}</div>` : ""}
        <div style="font-size:13pt;font-weight:bold;margin-top:3mm;border-top:2px solid #000;border-bottom:1px solid #000;padding:2mm 0;">REKAPITULASI PENGELUARAN<br><span style="font-size:11pt;">${esc(periodeLabel)}</span></div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:9pt;">
        <thead><tr>
          <th style="border:1px solid #000;padding:1.5mm;">No</th>
          <th style="border:1px solid #000;padding:1.5mm;">Nomor</th>
          <th style="border:1px solid #000;padding:1.5mm;">Tanggal</th>
          <th style="border:1px solid #000;padding:1.5mm;">Uraian</th>
          <th style="border:1px solid #000;padding:1.5mm;">Bruto (Rp)</th>
          <th style="border:1px solid #000;padding:1.5mm;">PPh (Rp)</th>
          <th style="border:1px solid #000;padding:1.5mm;">PPN (Rp)</th>
          <th style="border:1px solid #000;padding:1.5mm;">Total (Rp)</th>
        </tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr style="font-weight:bold;">
          <td colspan="4" style="border:1px solid #000;padding:1.5mm;text-align:right;">TOTAL (${rows.length} kwitansi)</td>
          <td style="border:1px solid #000;padding:1.5mm;text-align:right;">${formatRupiah(sBruto)}</td>
          <td style="border:1px solid #000;padding:1.5mm;text-align:right;">${formatRupiah(sPph)}</td>
          <td style="border:1px solid #000;padding:1.5mm;text-align:right;">${formatRupiah(sPpn)}</td>
          <td style="border:1px solid #000;padding:1.5mm;text-align:right;">${formatRupiah(sTotal)}</td>
        </tr></tfoot>
      </table>
      <div class="kwitansi-footer">
        <div class="kwitansi-ttd">
          <div class="label">Mengetahui,</div>
          <div class="nama">${esc(sekolah?.kepala_sekolah || "")}</div>
          <div class="nip">NIP. ${esc(sekolah?.nip_kepala || "")}</div>
        </div>
        <div class="kwitansi-ttd" style="text-align:center;">
          <div class="label" style="margin-bottom:15mm">Bendahara,</div>
          <div class="nama">${esc(sekolah?.bendahara || "")}</div>
          <div class="nip">NIP. ${esc(sekolah?.nip_bendahara || "")}</div>
        </div>
        <div class="kwitansi-ttd">
          <div class="label">${esc(tglCetak)}</div>
        </div>
      </div>
    </div>`;

  let styleEl = document.getElementById("dynamic-print-style");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "dynamic-print-style";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    @media print {
      @page { size: A4 portrait; margin: 10mm; }
      body * { visibility: hidden; }
      #print-container, #print-container * { visibility: visible; }
      #print-container { position: absolute; left: 0; top: 0; width: 100%; }
      .kwitansi-page { margin: 0; border: none; box-shadow: none; }
    }
  `;
  setTimeout(() => window.print(), 300);
};

// ========== HELPERS LOKAL ==========
function esc(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatRupiah(num) {
  return Math.round(num || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const NAMA_BULAN_PANJANG = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

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
  const p = parseTanggalParts(dateStr);
  if (p && p.m >= 1 && p.m <= 12) {
    return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`;
  }
  return dateStr || "-";
}

function formatTanggalPanjang(dateStr) {
  const p = parseTanggalParts(dateStr);
  if (p && p.m >= 1 && p.m <= 12) {
    return `${p.d} ${NAMA_BULAN_PANJANG[p.m - 1]} ${p.y}`;
  }
  return dateStr || "-";
}

window._rekapReady = true;
