import { invoke } from "@tauri-apps/api/core";
import { getPosSettings } from "./pos.js";

// ========== POS KASIR (nota toko, mandiri — terpisah dari kwitansi/BKU) ==========

let kasirProduk = [];
let kasirKat = "";
let kasirCart = []; // {produk_id, nama, harga, satuan, qty}
let kasirRiwayat = [];

window._loadKasir = async function () {
  try {
    kasirProduk = await invoke("cmd_get_all_produk");
  } catch (e) {
    kasirProduk = [];
    if (window._showToast) window._showToast("Gagal memuat produk: " + e, "error");
  }
  const tgl = document.getElementById("kasir-tanggal");
  if (tgl && !tgl.value) tgl.value = new Date().toISOString().split("T")[0];
  const nota = document.getElementById("kasir-nota");
  if (nota && !nota.value) nota.value = genNotaNum();
  renderKategoriChips();
  renderKatalog();
  renderCart();
  loadRiwayatJual();
};

window.regenKasirNota = function () {
  document.getElementById("kasir-nota").value = genNotaNum();
};

function genNotaNum() {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `${ymd}-${Math.floor(1000 + Math.random() * 9000)}`;
}

window.renderKatalog = function () {
  renderKategoriChips();
  const q = (document.getElementById("kasir-search")?.value || "").toLowerCase().trim();
  const grid = document.getElementById("kasir-katalog");
  if (!grid) return;
  const rows = kasirProduk.filter(p =>
    (!kasirKat || (p.kategori || "").trim() === kasirKat) &&
    (!q || (p.nama || "").toLowerCase().includes(q))
  );
  grid.innerHTML = rows.length === 0
    ? '<div class="empty" style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:20px;">Tidak ada produk — tambah dulu di menu Produk</div>'
    : rows.map(p => `<button onclick="addToCart(${p.id})" title="Tambah ke keranjang"
        style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:10px;cursor:pointer;text-align:left;box-shadow:var(--shadow);">
        <div style="font-weight:700;font-size:13px;">${esc(p.nama)}</div>
        <div style="font-size:11px;color:var(--text-muted);">${esc(p.kategori || "-")} • ${esc(p.satuan || "")}</div>
        <div style="font-weight:700;color:var(--primary);margin-top:4px;">Rp ${formatRupiah(p.harga)}</div>
      </button>`).join("");
};

function renderKategoriChips() {
  const box = document.getElementById("kasir-kategori");
  if (!box) return;
  const kats = [...new Set(kasirProduk.map(p => (p.kategori || "").trim()).filter(Boolean))].sort();
  box.innerHTML = `<button class="btn btn-sm ${!kasirKat ? "btn-primary" : "btn-secondary"}" onclick="setKasirKat('')">Semua</button>` +
    kats.map(k => `<button class="btn btn-sm ${kasirKat === k ? "btn-primary" : "btn-secondary"}" onclick="setKasirKat('${esc(k).replace(/'/g, "\\'")}')">${esc(k)}</button>`).join("");
}

window.setKasirKat = function (k) {
  kasirKat = k;
  renderKatalog();
};

window.addToCart = function (id) {
  const p = kasirProduk.find(x => x.id === id);
  if (!p) return;
  const line = kasirCart.find(l => l.produk_id === id);
  if (line) line.qty += 1;
  else kasirCart.push({ produk_id: id, nama: p.nama, harga: p.harga, satuan: p.satuan, qty: 1 });
  renderCart();
};

window.chQty = function (idx, delta) {
  const line = kasirCart[idx];
  if (!line) return;
  line.qty += delta;
  if (line.qty < 1) kasirCart.splice(idx, 1);
  renderCart();
};

window.removeLine = function (idx) {
  kasirCart.splice(idx, 1);
  renderCart();
};

window.clearKasirCart = function () {
  kasirCart = [];
  document.getElementById("kasir-diskon").value = "";
  document.getElementById("kasir-tunai").value = "";
  renderCart();
};

function cartSubtotal() {
  return kasirCart.reduce((s, l) => s + Math.round(l.harga) * l.qty, 0);
}

function cartDiskon() {
  const raw = (document.getElementById("kasir-diskon")?.value || "0").replace(/[^\d]/g, "");
  const d = parseFloat(raw) || 0;
  return Math.min(Math.max(d, 0), cartSubtotal());
}

function cartTunai() {
  const raw = (document.getElementById("kasir-tunai")?.value || "0").replace(/[^\d]/g, "");
  return parseFloat(raw) || 0;
}

function cartTotal() {
  return cartSubtotal() - cartDiskon();
}

window.handleKasirDiskonInput = function (el) {
  const raw = el.value.replace(/[^\d]/g, "");
  el.value = raw === "" ? "" : parseInt(raw).toLocaleString("id-ID");
  renderCart();
};

window.setKasirDiskonPersen = function (pct) {
  const el = document.getElementById("kasir-diskon");
  const v = Math.round(cartSubtotal() * pct / 100);
  if (el) el.value = v ? v.toLocaleString("id-ID") : "";
  renderCart();
};

window.handleKasirTunaiInput = function (el) {
  const raw = el.value.replace(/[^\d]/g, "");
  el.value = raw === "" ? "" : parseInt(raw).toLocaleString("id-ID");
  renderCart();
};

window.setKasirTunaiPas = function () {
  const el = document.getElementById("kasir-tunai");
  if (el) el.value = cartTotal().toLocaleString("id-ID");
  renderCart();
};

function renderCart() {
  const box = document.getElementById("kasir-cart");
  const totalBox = document.getElementById("kasir-total");
  if (!box || !totalBox) return;
  box.innerHTML = kasirCart.length === 0
    ? '<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:16px;">Keranjang kosong — klik produk di katalog</div>'
    : kasirCart.map((l, i) => `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px dashed var(--border);font-size:13px;">
        <div style="flex:1;min-width:0;"><b>${esc(l.nama)}</b><br><span style="color:var(--text-muted);font-size:11px;">Rp ${formatRupiah(l.harga)} / ${esc(l.satuan || "")}</span></div>
        <button class="btn btn-sm btn-secondary" onclick="chQty(${i},-1)">−</button>
        <span style="min-width:24px;text-align:center;font-weight:700;">${l.qty}</span>
        <button class="btn btn-sm btn-secondary" onclick="chQty(${i},1)">+</button>
        <span style="min-width:80px;text-align:right;font-weight:700;">${formatRupiah(Math.round(l.harga) * l.qty)}</span>
        <button class="btn btn-sm btn-danger" title="Hapus baris" onclick="removeLine(${i})">🗑️</button>
      </div>`).join("");

  const sub = cartSubtotal(), dis = cartDiskon(), tot = cartTotal(), tun = cartTunai();
  const kem = tun - tot;
  totalBox.innerHTML = `
    <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>Rp ${formatRupiah(sub)}</span></div>
    <div style="display:flex;justify-content:space-between;"><span>Diskon</span><span>- Rp ${formatRupiah(dis)}</span></div>
    <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;margin-top:4px;"><span>TOTAL</span><span>Rp ${formatRupiah(tot)}</span></div>
    <div style="display:flex;justify-content:space-between;margin-top:4px;color:${kem < 0 ? "var(--danger)" : "var(--success)"};font-weight:600;"><span>Kembali</span><span>Rp ${formatRupiah(kem)}</span></div>`;
  const ok = kasirCart.length > 0 && tun >= tot && tot >= 0;
  const b1 = document.getElementById("btn-kasir-bayar");
  const b2 = document.getElementById("btn-kasir-cetak");
  if (b1) b1.disabled = !ok;
  if (b2) b2.disabled = !ok;
  renderStrukPreview();
}

function renderStrukPreview() {
  const prev = document.getElementById("kasir-preview");
  if (!prev) return;
  if (kasirCart.length === 0) { prev.textContent = "—"; return; }
  const s = getPosSettings() || {};
  const header = (s.header_text || "").trim();
  const footer = (s.footer_text || "").trim();
  const tgl = document.getElementById("kasir-tanggal")?.value || "";
  const nota = document.getElementById("kasir-nota")?.value || "";
  const kasir = document.getElementById("kasir-penerima")?.value || "";
  const lines = [];
  if (header) lines.push(...header.split("\n"));
  else lines.push("NOTA PEMBAYARAN");
  lines.push("================================");
  lines.push(`No  : ${nota}`);
  lines.push(`Tgl : ${formatTanggalPanjang(tgl)}`);
  lines.push("--------------------------------");
  for (const l of kasirCart) {
    lines.push(`${l.nama}`);
    lines.push(`  ${l.qty} x ${formatRupiah(l.harga)} = ${formatRupiah(Math.round(l.harga) * l.qty)}`);
  }
  lines.push("--------------------------------");
  lines.push(`Subtotal : Rp ${formatRupiah(cartSubtotal())}`);
  if (cartDiskon() > 0) lines.push(`Diskon   : -Rp ${formatRupiah(cartDiskon())}`);
  lines.push(`TOTAL    : Rp ${formatRupiah(cartTotal())}`);
  lines.push(`Tunai    : Rp ${formatRupiah(cartTunai())}`);
  lines.push(`Kembali  : Rp ${formatRupiah(cartTunai() - cartTotal())}`);
  if (kasir.trim()) lines.push(`Kasir: ${kasir.trim()}`);
  lines.push("--------------------------------");
  lines.push(footer || "Terima kasih");
  prev.textContent = lines.join("\n");
}

window.handleKasirCheckout = async function (cetak) {
  if (kasirCart.length === 0) {
    if (window._showToast) window._showToast("Keranjang kosong", "warning");
    return;
  }
  const payload = {
    id: null,
    no_nota: document.getElementById("kasir-nota").value.trim(),
    tanggal: document.getElementById("kasir-tanggal").value,
    total: 0, diskon: cartDiskon(), tunai: cartTunai(), kembalian: 0,
    penerima: document.getElementById("kasir-penerima").value.trim(),
    nama_toko: "", alamat_toko: "", pimpinan_toko: "",
    created_at: null,
    items: kasirCart.map(l => ({
      id: null, penjualan_id: null, produk_id: l.produk_id,
      nama: l.nama, harga: Math.round(l.harga), qty: l.qty, subtotal: 0,
    })),
  };
  const tun = cartTunai(), tot = cartTotal();
  if (tun < tot) {
    if (window._showToast) window._showToast("Tunai kurang dari total", "warning");
    return;
  }
  try {
    const id = await invoke("cmd_pos_checkout", { p: payload });
    if (cetak) {
      try {
        await invoke("cmd_print_penjualan", { penjualanId: id });
        if (window._showToast) window._showToast("Tersimpan & terkirim ke printer", "success");
      } catch (e) {
        if (window._showToast) window._showToast(`Tersimpan, cetak gagal: ${e}`, "warning");
      }
    } else {
      if (window._showToast) window._showToast("Penjualan tersimpan", "success");
    }
    clearKasirCart();
    document.getElementById("kasir-nota").value = genNotaNum();
    loadRiwayatJual();
  } catch (e) {
    if (window._showToast) window._showToast("Gagal simpan: " + e, "error");
  }
};

async function loadRiwayatJual() {
  try {
    kasirRiwayat = await invoke("cmd_get_all_penjualan");
  } catch (e) {
    kasirRiwayat = [];
  }
  const tbody = document.getElementById("kasir-riwayat-tbody");
  if (!tbody) return;
  tbody.innerHTML = kasirRiwayat.length === 0
    ? '<tr><td colspan="4" class="empty">Belum ada penjualan</td></tr>'
    : kasirRiwayat.map(p => `<tr>
        <td style="font-family:monospace;">${esc(p.no_nota)}</td>
        <td>${formatTanggal(p.tanggal)}</td>
        <td class="rupiah" style="text-align:right;">Rp ${formatRupiah(p.total)}</td>
        <td><div class="actions">
          <button class="btn btn-sm btn-pos" title="Cetak ulang struk" onclick="reprintJual(${p.id})">🖨️</button>
          <button class="btn btn-sm btn-danger" title="Hapus" onclick="hapusJual(${p.id})">🗑️</button>
        </div></td>
      </tr>`).join("");
}

window.reprintJual = async function (id) {
  try {
    await invoke("cmd_print_penjualan", { penjualanId: id });
    if (window._showToast) window._showToast("Struk dikirim ke printer", "success");
  } catch (e) {
    if (window._showToast) window._showToast("Gagal cetak: " + e, "error");
  }
};

window.hapusJual = async function (id) {
  if (!confirm("Hapus penjualan ini?")) return;
  try {
    await invoke("cmd_delete_penjualan", { id: id });
    if (window._showToast) window._showToast("Penjualan dihapus", "success");
    loadRiwayatJual();
  } catch (e) {
    if (window._showToast) window._showToast("Gagal menghapus: " + e, "error");
  }
};

function esc(str) {
  if (!str && str !== 0) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatRupiah(num) {
  return Math.round(num || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parseTanggalParts(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return { d: parseInt(m[3], 10), m: parseInt(m[2], 10), y: parseInt(m[1], 10) };
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
  if (m) return { d: parseInt(m[1], 10), m: parseInt(m[2], 10), y: parseInt(m[3], 10) };
  return null;
}

const NAMA_BULAN_PANJANG = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

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

window._kasirReady = true;
