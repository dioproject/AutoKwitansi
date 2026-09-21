import { invoke } from "@tauri-apps/api/core";

let currentPosSettings = null;

export function isBpu(nomor) {
  return (nomor || "").trim().toUpperCase().includes("BPU");
}

export async function loadPosSettings() {
  try {
    currentPosSettings = await invoke("cmd_get_pos_settings");
  } catch (e) {
    currentPosSettings = { id: null, paper_width: 58, port: "", baud_rate: 9600 };
  }
  return currentPosSettings;
}

export function getPosSettings() {
  return currentPosSettings;
}

// Store for modal actions
let _posModalKwitansi = null;
let _posModalSettings = null;

/**
 * Tampilkan modal preview nota POS, lalu user pilih cetak thermal atau browser.
 */
export async function cetakNotaPos(kwitansi) {
  _posModalKwitansi = kwitansi;
  _posModalSettings = currentPosSettings || { paper_width: 58, header_text: "", footer_text: "" };

  // Render nota template inside modal
  const contentEl = document.getElementById("modal-pos-content");
  if (contentEl) {
    contentEl.innerHTML = renderPosNotaTemplate(kwitansi, _posModalSettings);
  }

  // Reset status
  const statusEl = document.getElementById("modal-pos-status");
  if (statusEl) statusEl.textContent = "";

  // Show modal
  const modal = document.getElementById("modal-pos-preview");
  if (modal) modal.classList.remove("hidden");
}

/** Called from modal: print to thermal */
export async function cetakPosThermal() {
  if (!_posModalKwitansi) return;
  const btn = document.getElementById("btn-pos-thermal");
  const status = document.getElementById("modal-pos-status");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Mengirim..."; }
  if (status) status.textContent = "";

  try {
    await invoke("cmd_print_pos_nota", { kwitansiId: _posModalKwitansi.id });
    if (status) { status.textContent = "✅ Berhasil dikirim ke printer thermal!"; status.style.color = "var(--success)"; }
    if (window._showToast) window._showToast("Nota POS berhasil dikirim ke printer", "success");
  } catch (e) {
    if (status) { status.textContent = "❌ Gagal: " + e; status.style.color = "var(--danger)"; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "🖨️ Cetak ke Printer Thermal"; }
  }
}

/** Called from modal: print via browser */
export function cetakPosBrowser() {
  if (!_posModalKwitansi) return;
  const s = _posModalSettings || { paper_width: 58 };
  const widthMm = s.paper_width || 58;

  // Close modal first so it doesn't appear in print
  const modal = document.getElementById("modal-pos-preview");
  if (modal) modal.classList.add("hidden");

  // Render to print container
  const container = document.getElementById("print-container");
  if (!container) return;
  container.innerHTML = renderPosNotaTemplate(_posModalKwitansi, s);

  let styleEl = document.getElementById("dynamic-print-style");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "dynamic-print-style";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    @media print {
      @page { size: ${widthMm}mm auto; margin: 0; }
      body * { visibility: hidden; }
      #print-container, #print-container * { visibility: visible; }
      .pos-nota { margin: 0; padding: 2mm; border: none; }
    }
  `;

  setTimeout(() => window.print(), 300);
}

export function renderPosNotaTemplate(k, settings) {
  const s = settings || currentPosSettings || { paper_width: 58, header_text: "", footer_text: "" };
  const widthMm = s.paper_width || 58;
  const fontSize = widthMm <= 58 ? 7 : 8;
  const maxChars = widthMm <= 58 ? 32 : 48;
  const sep = "─".repeat(maxChars);
  const doubleSep = "═".repeat(maxChars);

  const autoNum = generateRandomNotaNum();
  const lines = [];
  
  // HEADER — data toko (BPU) atau custom text
  const customHeader = (s.header_text || "").trim();
  const hasToko = (k.nama_toko || "").trim() !== "";

  if (customHeader) {
    for (const hline of customHeader.split("\n")) {
      lines.push(centerText(hline, maxChars));
    }
  } else if (hasToko) {
    lines.push(centerText(k.nama_toko, maxChars));
    if (k.alamat_toko) lines.push(centerText(k.alamat_toko, maxChars));
    if (k.pimpinan_toko) lines.push(centerText(`Pimp: ${k.pimpinan_toko}`, maxChars));
  } else {
    lines.push(centerText("NOTA PEMBAYARAN", maxChars));
  }
  lines.push(doubleSep);
  
  // No (auto-generated, tanpa label BPU/BNU) & Tanggal
  lines.push(`No   : ${autoNum}`);
  lines.push(`Tgl  : ${formatTanggalPanjang(k.tanggal)}`);
  lines.push(sep);
  
  // ITEM — kalimat gabungan uraian + kode rekening + tahun anggaran
  lines.push("  ITEM");
  const kalimat = composePaymentSentence(k);
  for (const wl of wrapText(kalimat, maxChars - 4)) {
    lines.push(`    ${wl}`);
  }
  lines.push(sep);
  
  // TOTAL — netto jika kena PPh 21
  const pph = k.kena_pph21 ? Math.round(k.jumlah * 0.06) : 0;
  const netto = k.jumlah - pph;
  if (k.kena_pph21) {
    lines.push(`Bruto  : Rp ${formatRupiah(k.jumlah)}`);
    lines.push(`PPh 6% : Rp ${formatRupiah(pph)}`);
  }
  let totalLine = `TOTAL  : Rp ${formatRupiah(netto)}`;
  const pad = Math.max(0, maxChars - totalLine.length);
  lines.push(" ".repeat(pad) + totalLine);
  lines.push(sep);
  
  // Penerima
  lines.push(`Penerima: ${k.penerima || "-"}`);
  lines.push(sep);
  
  // FOOTER
  const footer = (s.footer_text || "").trim();
  if (footer) {
    for (const fline of footer.split("\n")) {
      lines.push(centerText(fline, maxChars));
    }
  } else {
    lines.push(centerText("Terima kasih", maxChars));
  }

  return `
    <div class="pos-nota" style="width:${widthMm}mm;font-family:'Courier New',monospace;font-size:${fontSize}pt;line-height:1.3;white-space:pre;border:1px solid #ccc;padding:3mm;margin:0 auto;">${lines.map(l => escHtml(l)).join("\n")}</div>
  `;
}

function labelNomorCetak(nomor) {
  const upper = (nomor || "").toUpperCase();
  if (upper.includes("BNU")) return "BNU";
  if (upper.includes("BPU")) return "BPU";
  return nomor || "";
}

function generateRandomNotaNum() {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${ymd}-${rand}`;
}

/** Gabung uraian + kode rekening + tahun anggaran jadi 1 kalimat */
function composePaymentSentence(k) {
  const s = k.untuk_pembayaran || "-";
  const parts = [];
  if ((k.kode_rekening || "").trim()) parts.push(`Kode Rekening ${k.kode_rekening.trim()}`);
  if ((k.tahun_anggaran || "").trim()) parts.push(`Tahun Anggaran ${k.tahun_anggaran.trim()}`);
  if (parts.length === 0) return s;
  return `${s} (${parts.join(", ")})`;
}

/** Word-wrap teks ke lebar maksimum */
function wrapText(text, width) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const out = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= width) cur += " " + w;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out.length ? out : ["-"];
}

function centerText(text, maxChars) {
  const pad = Math.max(0, Math.floor((maxChars - text.length) / 2));
  return " ".repeat(pad) + text;
}

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

function escHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

window._posReady = true;
