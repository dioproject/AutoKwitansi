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

/**
 * Cetak nota POS langsung ke printer thermal via ESC/POS backend.
 * Fallback ke browser print jika backend gagal.
 */
export async function cetakNotaPos(kwitansi) {
  try {
    await invoke("cmd_print_pos_nota", { kwitansiId: kwitansi.id });
    if (window._showToast) window._showToast("Nota POS berhasil dikirim ke printer", "success");
  } catch (e) {
    // Fallback: tampilkan di browser print
    const proceed = confirm(`Gagal kirim ke printer POS:\n${e}\n\nGunakan browser print sebagai fallback?`);
    if (!proceed) return;

    const s = currentPosSettings || { paper_width: 58 };
    const widthMm = s.paper_width || 58;
    const container = document.getElementById("print-container");
    if (!container) return;

    container.innerHTML = renderPosNotaTemplate(kwitansi, s);
    const page = document.getElementById("page-print");
    if (page) {
      page.querySelector(".page-header h2").textContent = `Nota POS (${widthMm}mm)`;
    }

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

    if (window._showPage) window._showPage("print");
    setTimeout(() => window.print(), 200);
  }
}

export function renderPosNotaTemplate(k, settings) {
  const s = settings || currentPosSettings || { paper_width: 58, header_text: "", footer_text: "" };
  const widthMm = s.paper_width || 58;
  const fontSize = widthMm <= 58 ? 7 : 8;
  const maxChars = widthMm <= 58 ? 32 : 48;
  const sep = "─".repeat(maxChars);
  const doubleSep = "═".repeat(maxChars);

  const label = labelNomorCetak(k.nomor_kwitansi);
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
  
  // No (auto-generated) & Tanggal
  lines.push(`No   : ${label}/${autoNum}`);
  lines.push(`Tgl  : ${formatTanggalPanjang(k.tanggal)}`);
  lines.push(sep);
  
  // ITEM
  lines.push("  ITEM");
  const items = (k.untuk_pembayaran || "-").split("\n").filter(l => l.trim());
  if (items.length > 0) {
    for (const item of items) {
      lines.push(`    ${item.trim()}`);
    }
  }
  lines.push(sep);
  
  // TOTAL (right-aligned)
  let totalLine = `TOTAL  : Rp ${formatRupiah(k.jumlah)}`;
  const pad = Math.max(0, maxChars - totalLine.length);
  lines.push(" ".repeat(pad) + totalLine);
  
  // PPh block
  if (k.kena_pph21) {
    const bruto = k.jumlah;
    const pph = Math.round(bruto * 0.06);
    const netto = bruto - pph;
    lines.push(`Bruto  : Rp ${formatRupiah(bruto)}`);
    lines.push(`PPh 6% : Rp ${formatRupiah(pph)}`);
    lines.push(`NETTO  : Rp ${formatRupiah(netto)}`);
  }
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
