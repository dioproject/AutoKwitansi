import { invoke } from "@tauri-apps/api/core";
import { isBpu } from "./pos.js";

let currentDocStatus = null;
let currentKwitansiForDocs = null;

export function needsDocuments(k) {
  return isBpu(k.nomor_kwitansi) && k.jumlah > 1000000;
}

export async function loadDocStatus(kwitansiId) {
  try {
    currentDocStatus = await invoke("cmd_get_doc_status", { kwitansiId });
  } catch (e) {
    currentDocStatus = { dok_bast: false, dok_surat_pesanan: false, dok_invoice: false, dok_bap: false };
  }
  return currentDocStatus;
}

export function getDocStatus() {
  return currentDocStatus;
}

export function allDocsComplete(status) {
  if (!status) return false;
  return status.dok_bast && status.dok_surat_pesanan && status.dok_invoice && status.dok_bap;
}

window.setKwitansiForDocs = function (k) {
  currentKwitansiForDocs = k;
};

window.handleUpdateToko = async function () {
  if (!currentKwitansiForDocs) return;
  try {
    await invoke("cmd_update_toko", {
      kwitansiId: currentKwitansiForDocs.id,
      namaToko: document.getElementById("doc_nama_toko")?.value || "",
      alamatToko: document.getElementById("doc_alamat_toko")?.value || "",
      pimpinanToko: document.getElementById("doc_pimpinan_toko")?.value || "",
    });
    if (window._showToast) window._showToast("Data toko disimpan", "success");
  } catch (e) {
    if (window._showToast) window._showToast("Gagal simpan toko: " + e, "error");
  }
};

window.handleSetDocLengkap = async function (jenis, checked) {
  if (!currentKwitansiForDocs) return;
  const status = { ...currentDocStatus };
  status[`dok_${jenis}`] = checked;
  currentDocStatus = status;

  try {
    await invoke("cmd_set_doc_lengkap", {
      kwitansiId: currentKwitansiForDocs.id,
      dokBast: status.dok_bast,
      dokSuratPesanan: status.dok_surat_pesanan,
      dokInvoice: status.dok_invoice,
      dokBap: status.dok_bap,
    });
    updateDocChecklistUI(status);
    if (allDocsComplete(status)) {
      if (window._showToast) window._showToast("Semua dokumen lengkap! Cetak POS diaktifkan.", "success");
    }
  } catch (e) {
    if (window._showToast) window._showToast("Gagal update dokumen: " + e, "error");
  }
};

function updateDocChecklistUI(status) {
  const items = ["bast", "surat_pesanan", "invoice", "bap"];
  for (const item of items) {
    const cb = document.getElementById(`doc_cb_${item}`);
    if (cb) cb.checked = status[`dok_${item}`];
  }
  const badge = document.getElementById("doc-status-badge");
  if (badge) {
    const done = items.filter(i => status[`dok_${i}`]).length;
    badge.textContent = `${done}/4 dokumen`;
    badge.className = done === 4 ? "badge badge-ok" : "badge badge-warn";
  }
}

// ============ DOKUMEN TEMPLATES ============

window.cetakDokumen = function (jenis) {
  if (!currentKwitansiForDocs) return;
  const k = currentKwitansiForDocs;
  const sekolah = window._sekolahData || {};

  const container = document.getElementById("print-container");
  if (!container) return;

  let html = "";
  switch (jenis) {
    case "bast": html = renderBAST(k, sekolah); break;
    case "surat_pesanan": html = renderSuratPesanan(k, sekolah); break;
    case "invoice": html = renderInvoice(k, sekolah); break;
    case "bap": html = renderBAP(k, sekolah); break;
  }

  container.innerHTML = html;
  if (window._showPage) window._showPage("print");

  let styleEl = document.getElementById("dynamic-print-style");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "dynamic-print-style";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `@media print { @page { size: A4; margin: 15mm; } }`;
};

function renderBAST(k, sekolah) {
  const tgl = formatTanggalPanjang(k.tanggal);
  return `
    <div class="doc-page" style="width:210mm;min-height:297mm;padding:15mm;font-size:12pt;font-family:serif;line-height:1.6;">
      <h2 style="text-align:center;">BERITA ACARA SERAH TERIMA</h2>
      <p style="text-align:center;">Nomor: .../BAST/${k.bulan || "..."}/${k.tahun_anggaran || "..."}</p>
      <br>
      <p>Pada hari ini, ${tgl}, telah dilaksanakan serah terima barang/jasa antara:</p>
      <br>
      <p><strong>Pihak Penjual:</strong></p>
      <p>Nama Toko: ${esc(k.nama_toko || "...")}</p>
      <p>Alamat: ${esc(k.alamat_toko || "...")}</p>
      <p>Pimpinan: ${esc(k.pimpinan_toko || "...")}</p>
      <br>
      <p><strong>Pihak Pembeli:</strong></p>
      <p>Nama Sekolah: ${esc(sekolah.nama_sekolah || "...")}</p>
      <p>Alamat: ${esc(sekolah.alamat || "...")}, ${esc(sekolah.kota || "...")}</p>
      <p>Kepala Sekolah: ${esc(sekolah.kepala_sekolah || "...")}</p>
      <p>NIP: ${esc(sekolah.nip_kepala || "...")}</p>
      <br>
      <p>Dengan rincian sebagai berikut:</p>
      <table style="width:100%;border-collapse:collapse;margin:10px 0;">
        <tr style="border-bottom:2px solid #000;">
          <th style="text-align:left;padding:5px;">No</th>
          <th style="text-align:left;padding:5px;">Uraian</th>
          <th style="text-align:right;padding:5px;">Jumlah</th>
        </tr>
        <tr style="border-bottom:1px solid #ccc;">
          <td style="padding:5px;">1</td>
          <td style="padding:5px;">${esc(k.untuk_pembayaran || "...")}</td>
          <td style="padding:5px;text-align:right;">Rp ${formatRupiah(k.jumlah)}</td>
        </tr>
      </table>
      <p>Terbilang: ${esc(capitalize(k.terbilang || "..."))}</p>
      <br>
      <p>Demikian Berita Acara Serah Terima ini dibuat dengan sebenar-benarnya untuk dapat dipergunakan sebagaimana mestinya.</p>
      <br><br>
      <table style="width:100%;">
        <tr>
          <td style="width:50%;text-align:center;">
            <p>Mengetahui,</p>
            <p>Kepala Sekolah</p>
            <div style="height:40mm;"></div>
            <p><strong>${esc(sekolah.kepala_sekolah || "...")}</strong></p>
            <p>NIP. ${esc(sekolah.nip_kepala || "...")}</p>
          </td>
          <td style="width:50%;text-align:center;">
            <p>${esc(k.nama_toko ? "Penjual" : "...")}</p>
            <div style="height:40mm;"></div>
            <p><strong>${esc(k.pimpinan_toko || "...")}</strong></p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function renderSuratPesanan(k, sekolah) {
  const tgl = formatTanggalPanjang(k.tanggal);
  return `
    <div class="doc-page" style="width:210mm;min-height:297mm;padding:15mm;font-size:12pt;font-family:serif;line-height:1.6;">
      <h2 style="text-align:center;">SURAT PESANAN</h2>
      <p style="text-align:center;">Nomor: .../SP/${k.bulan || "..."}/${k.tahun_anggaran || "..."}</p>
      <br>
      <p>Kepada Yth.</p>
      <p><strong>${esc(k.nama_toko || "...")}</strong></p>
      <p>di Tempat</p>
      <br>
      <p>Dengan hormat,</p>
      <p>Kami yang bertanda tangan di bawah ini:</p>
      <p>Nama: ${esc(sekolah.kepala_sekolah || "...")}</p>
      <p>Jabatan: Kepala Sekolah ${esc(sekolah.nama_sekolah || "...")}</p>
      <p>NIP: ${esc(sekolah.nip_kepala || "...")}</p>
      <p>Dengan ini memesan barang/jasa kepada Saudara dengan rincian:</p>
      <br>
      <table style="width:100%;border-collapse:collapse;margin:10px 0;">
        <tr style="border-bottom:2px solid #000;">
          <th style="text-align:left;padding:5px;">No</th>
          <th style="text-align:left;padding:5px;">Uraian Barang/Jasa</th>
          <th style="text-align:right;padding:5px;">Jumlah (Rp)</th>
        </tr>
        <tr style="border-bottom:1px solid #ccc;">
          <td style="padding:5px;">1</td>
          <td style="padding:5px;">${esc(k.untuk_pembayaran || "...")}</td>
          <td style="padding:5px;text-align:right;">Rp ${formatRupiah(k.jumlah)}</td>
        </tr>
      </table>
      <p>Total: <strong>Rp ${formatRupiah(k.jumlah)}</strong></p>
      <p>Terbilang: ${esc(capitalize(k.terbilang || "..."))}</p>
      <br>
      <p>Demikian surat pesanan ini kami buat dengan sebenar-benarnya.</p>
      <br><br>
      <table style="width:100%;">
        <tr>
          <td style="width:50%;text-align:center;">
            <p>${esc(k.nama_toko ? "Penerima Pesanan" : "...")}</p>
            <div style="height:40mm;"></div>
            <p><strong>${esc(k.pimpinan_toko || "...")}</strong></p>
          </td>
          <td style="width:50%;text-align:center;">
            <p>${esc(sekolah.kota || "...")}, ${tgl}</p>
            <p>Pemesan,</p>
            <div style="height:40mm;"></div>
            <p><strong>${esc(sekolah.kepala_sekolah || "...")}</strong></p>
            <p>NIP. ${esc(sekolah.nip_kepala || "...")}</p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function renderInvoice(k, sekolah) {
  const tgl = formatTanggalPanjang(k.tanggal);
  return `
    <div class="doc-page" style="width:210mm;min-height:297mm;padding:15mm;font-size:12pt;font-family:serif;line-height:1.6;">
      <h2 style="text-align:center;">INVOICE</h2>
      <p style="text-align:center;">No: .../INV/${k.bulan || "..."}/${k.tahun_anggaran || "..."}</p>
      <br>
      <table style="width:100%;margin-bottom:15px;">
        <tr>
          <td style="width:50%;">
            <p><strong>Dari:</strong></p>
            <p>${esc(k.nama_toko || "...")}</p>
            <p>${esc(k.alamat_toko || "...")}</p>
            <p>Pimpinan: ${esc(k.pimpinan_toko || "...")}</p>
          </td>
          <td style="width:50%;">
            <p><strong>Kepada:</strong></p>
            <p>${esc(sekolah.nama_sekolah || "...")}</p>
            <p>${esc(sekolah.alamat || "...")}, ${esc(sekolah.kota || "...")}</p>
          </td>
        </tr>
      </table>
      <p>Tanggal: ${tgl}</p>
      <br>
      <table style="width:100%;border-collapse:collapse;margin:10px 0;">
        <tr style="border-bottom:2px solid #000;">
          <th style="text-align:left;padding:5px;">No</th>
          <th style="text-align:left;padding:5px;">Deskripsi</th>
          <th style="text-align:right;padding:5px;">Jumlah (Rp)</th>
        </tr>
        <tr style="border-bottom:1px solid #ccc;">
          <td style="padding:5px;">1</td>
          <td style="padding:5px;">${esc(k.untuk_pembayaran || "...")}</td>
          <td style="padding:5px;text-align:right;">Rp ${formatRupiah(k.jumlah)}</td>
        </tr>
        <tr style="border-top:2px solid #000;font-weight:bold;">
          <td colspan="2" style="padding:5px;">TOTAL</td>
          <td style="padding:5px;text-align:right;">Rp ${formatRupiah(k.jumlah)}</td>
        </tr>
      </table>
      <p>Terbilang: ${esc(capitalize(k.terbilang || "..."))}</p>
      <br><br>
      <table style="width:100%;">
        <tr>
          <td style="width:50%;text-align:center;">
            <p>Mengetahui,</p>
            <p>Kepala Sekolah</p>
            <div style="height:35mm;"></div>
            <p><strong>${esc(sekolah.kepala_sekolah || "...")}</strong></p>
            <p>NIP. ${esc(sekolah.nip_kepala || "...")}</p>
          </td>
          <td style="width:50%;text-align:center;">
            <p>Hormat kami,</p>
            <div style="height:35mm;"></div>
            <p><strong>${esc(k.pimpinan_toko || "...")}</strong></p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function renderBAP(k, sekolah) {
  const tgl = formatTanggalPanjang(k.tanggal);
  return `
    <div class="doc-page" style="width:210mm;min-height:297mm;padding:15mm;font-size:12pt;font-family:serif;line-height:1.6;">
      <h2 style="text-align:center;">BERITA ACARA PEMERIKSAAN BARANG</h2>
      <p style="text-align:center;">Nomor: .../BAP/${k.bulan || "..."}/${k.tahun_anggaran || "..."}</p>
      <br>
      <p>Pada hari ini, ${tgl}, telah dilakukan pemeriksaan barang atas pengadaan di ${esc(sekolah.nama_sekolah || "...")} dengan rincian:</p>
      <br>
      <table style="width:100%;border-collapse:collapse;margin:10px 0;">
        <tr style="border-bottom:2px solid #000;">
          <th style="text-align:left;padding:5px;">No</th>
          <th style="text-align:left;padding:5px;">Uraian</th>
          <th style="text-align:center;padding:5px;">Jumlah</th>
          <th style="text-align:center;padding:5px;">Kondisi</th>
        </tr>
        <tr style="border-bottom:1px solid #ccc;">
          <td style="padding:5px;">1</td>
          <td style="padding:5px;">${esc(k.untuk_pembayaran || "...")}</td>
          <td style="padding:5px;text-align:center;">1 paket</td>
          <td style="padding:5px;text-align:center;">Baik</td>
        </tr>
      </table>
      <p>Total Nilai: <strong>Rp ${formatRupiah(k.jumlah)}</strong></p>
      <p>Terbilang: ${esc(capitalize(k.terbilang || "..."))}</p>
      <br>
      <p>Hasil pemeriksaan: Barang dinyatakan <strong>Sesuai / Lengkap</strong> dengan pesanan.</p>
      <br>
      <p>Demikian Berita Acara Pemeriksaan Barang ini dibuat dengan sebenar-benarnya.</p>
      <br><br>
      <table style="width:100%;">
        <tr>
          <td style="width:33%;text-align:center;">
            <p>Mengetahui,</p>
            <p>Kepala Sekolah</p>
            <div style="height:35mm;"></div>
            <p><strong>${esc(sekolah.kepala_sekolah || "...")}</strong></p>
            <p>NIP. ${esc(sekolah.nip_kepala || "...")}</p>
          </td>
          <td style="width:33%;text-align:center;">
            <p>Pemeriksa I</p>
            <div style="height:35mm;"></div>
            <p><strong>${esc(sekolah.bendahara || "...")}</strong></p>
            <p>NIP. ${esc(sekolah.nip_bendahara || "...")}</p>
          </td>
          <td style="width:33%;text-align:center;">
            <p>Penerima</p>
            <div style="height:35mm;"></div>
            <p><strong>${esc(k.penerima || "...")}</strong></p>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function formatRupiah(num) {
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatTanggalPanjang(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
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

window._bpuDocsReady = true;
