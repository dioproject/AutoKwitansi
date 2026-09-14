import { invoke } from "@tauri-apps/api/core";

let currentPosSettings = null;

export function isBpu(nomor) {
  return (nomor || "").trim().toUpperCase().includes("BPU");
}

export async function loadPosSettings() {
  try {
    currentPosSettings = await invoke("cmd_get_pos_settings");
  } catch (e) {
    currentPosSettings = { id: null, paper_width: 58, connection: "USB" };
  }
  return currentPosSettings;
}

export function getPosSettings() {
  return currentPosSettings;
}

window.handleSimpanPosSettings = async function () {
  const paperWidth = parseInt(document.getElementById("pos_paper_width")?.value || "58");
  const connection = document.getElementById("pos_connection")?.value || "USB";

  const settings = {
    id: currentPosSettings?.id || null,
    paper_width: paperWidth,
    connection: connection,
  };

  try {
    await invoke("cmd_save_pos_settings", { settings });
    currentPosSettings = settings;
    if (window._showToast) window._showToast("Pengaturan POS disimpan", "success");
    if (window._closeModal) window._closeModal("modal-pos-settings");
  } catch (e) {
    if (window._showToast) window._showToast("Gagal simpan: " + e, "error");
  }
};

export function renderPosNotaTemplate(k, settings) {
  const s = settings || currentPosSettings || { paper_width: 58, connection: "USB" };
  const widthMm = s.paper_width || 58;
  const fontSize = widthMm <= 58 ? 7 : 8;

  const lines = [];
  lines.push(centerText("KWITANSI POS", widthMm));
  lines.push("─".repeat(widthMm <= 58 ? 32 : 48));
  lines.push(`No: ${k.nomor_kwitansi}`);
  lines.push(`Tgl: ${formatTanggal(k.tanggal)}`);
  lines.push(`Thn: ${k.tahun_anggaran || "-"}`);
  lines.push("");
  lines.push(`Dari: ${k.sudah_terima_dari}`);
  lines.push("");
  lines.push(`Barang:`);
  lines.push(k.untuk_pembayaran || "-");
  lines.push("");
  lines.push(`Jml: Rp ${formatRupiah(k.jumlah)}`);
  lines.push(`${k.terbilang || ""}`);
  lines.push("");
  lines.push(`Toko: ${k.nama_toko || "-"}`);
  lines.push(`Almt: ${k.alamat_toko || "-"}`);
  lines.push("");
  lines.push("─".repeat(widthMm <= 58 ? 32 : 48));
  lines.push(`Bendahara: ${k.bendahara || "-"}`);
  lines.push(`Penerima: ${k.penerima || "-"}`);

  return `
    <div class="pos-nota" style="width:${widthMm}mm;font-family:'Courier New',monospace;font-size:${fontSize}pt;line-height:1.3;white-space:pre;border:1px solid #ccc;padding:3mm;margin:0 auto;">${lines.map(l => escHtml(l)).join("\n")}</div>
  `;
}

export function cetakNotaPos(k, settings) {
  const s = settings || currentPosSettings || { paper_width: 58 };
  const widthMm = s.paper_width || 58;
  const container = document.getElementById("print-container");
  if (!container) return;

  container.innerHTML = renderPosNotaTemplate(k, s);
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

function centerText(text, widthMm) {
  const chars = widthMm <= 58 ? 32 : 48;
  const pad = Math.max(0, Math.floor((chars - text.length) / 2));
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

function escHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

window._posReady = true;
