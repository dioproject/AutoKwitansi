import { invoke } from "@tauri-apps/api/core";

// ========== PRODUK (master POS kasir, mandiri) ==========

let produkData = [];

window._loadProduk = async function () {
  try {
    produkData = await invoke("cmd_get_all_produk");
    renderKategoriFilter();
    renderProduk();
  } catch (e) {
    if (window._showToast) window._showToast("Gagal memuat produk: " + e, "error");
  }
};

window.handleProdukFilterChange = function () {
  renderProduk();
};

function renderKategoriFilter() {
  const sel = document.getElementById("produk-kategori-filter");
  if (!sel) return;
  const cur = sel.value || "";
  const kats = [...new Set(produkData.map(p => (p.kategori || "").trim()).filter(Boolean))].sort();
  sel.innerHTML = `<option value="">Semua kategori (${produkData.length})</option>` +
    kats.map(k => `<option value="${esc(k)}"${k === cur ? " selected" : ""}>${esc(k)}</option>`).join("");
  const dl = document.getElementById("kategori-list");
  if (dl) dl.innerHTML = kats.map(k => `<option value="${esc(k)}"></option>`).join("");
}

function renderProduk() {
  const tbody = document.getElementById("produk-tbody");
  if (!tbody) return;
  const kat = document.getElementById("produk-kategori-filter")?.value || "";
  const q = (document.getElementById("produk-search")?.value || "").toLowerCase().trim();
  const rows = produkData.filter(p =>
    (!kat || (p.kategori || "").trim() === kat) &&
    (!q || (p.nama || "").toLowerCase().includes(q))
  );
  tbody.innerHTML = rows.length === 0
    ? '<tr><td colspan="6" class="empty">Belum ada produk — klik Tambah Produk</td></tr>'
    : rows.map((p, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(p.nama)}</td>
        <td>${esc(p.kategori || "-")}</td>
        <td class="rupiah" style="text-align:right;">Rp ${formatRupiah(p.harga)}</td>
        <td>${esc(p.satuan || "-")}</td>
        <td><div class="actions">
          <button class="btn btn-sm btn-secondary" title="Edit produk" onclick="openProdukModal(${p.id})">✏️</button>
          <button class="btn btn-sm btn-danger" title="Hapus produk" onclick="hapusProduk(${p.id})">🗑️</button>
        </div></td>
      </tr>`).join("");
}

window.openProdukModal = async function (id) {
  document.getElementById("p_id").value = "";
  document.getElementById("modal-produk-title").textContent = "📦 Tambah Produk";
  if (id) {
    const p = produkData.find(x => x.id === id);
    if (!p) return;
    document.getElementById("p_id").value = p.id;
    document.getElementById("p_nama").value = p.nama || "";
    document.getElementById("p_harga").value = p.harga ? Math.round(p.harga).toLocaleString("id-ID") : "";
    document.getElementById("p_satuan").value = p.satuan || "";
    document.getElementById("p_kategori").value = p.kategori || "";
    document.getElementById("modal-produk-title").textContent = "✏️ Edit Produk";
  } else {
    document.getElementById("p_nama").value = "";
    document.getElementById("p_harga").value = "";
    document.getElementById("p_satuan").value = "";
    document.getElementById("p_kategori").value = "";
  }
  document.getElementById("modal-produk").classList.remove("hidden");
};

window.handleProdukHargaInput = function (el) {
  const raw = el.value.replace(/[^\d]/g, "");
  el.value = raw === "" ? "" : parseInt(raw).toLocaleString("id-ID");
};

window.handleSimpanProduk = async function () {
  const nama = document.getElementById("p_nama").value.trim();
  if (!nama) {
    if (window._showToast) window._showToast("Nama produk wajib diisi", "warning");
    return;
  }
  const harga = parseFloat((document.getElementById("p_harga").value || "0").replace(/[^\d]/g, "")) || 0;
  const payload = {
    id: null,
    nama: nama,
    harga: harga,
    kategori: document.getElementById("p_kategori").value.trim(),
    satuan: document.getElementById("p_satuan").value.trim() || "pcs",
    created_at: null,
  };
  try {
    const eid = document.getElementById("p_id").value;
    if (eid) {
      payload.id = parseInt(eid);
      await invoke("cmd_update_produk", { produk: payload });
      if (window._showToast) window._showToast("Produk diperbarui", "success");
    } else {
      await invoke("cmd_simpan_produk", { produk: payload });
      if (window._showToast) window._showToast("Produk ditambahkan", "success");
    }
    window._closeModal("modal-produk");
    window._loadProduk();
  } catch (e) {
    if (window._showToast) window._showToast("Gagal menyimpan: " + e, "error");
  }
};

window.hapusProduk = async function (id) {
  if (!confirm("Yakin hapus produk ini?")) return;
  try {
    await invoke("cmd_delete_produk", { id: id });
    if (window._showToast) window._showToast("Produk dihapus", "success");
    window._loadProduk();
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

window._produkReady = true;
