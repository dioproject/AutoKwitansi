import { invoke } from "@tauri-apps/api/core";

// ========== DASHBOARD ==========
// Ringkasan agregat dari cmd_dashboard_stats (sumber tunggal, tanpa duplikasi rumus).

window._loadDashboard = async function () {
  try {
    const s = await invoke("cmd_dashboard_stats");
    renderDashboard(s);
  } catch (e) {
    if (window._showToast) window._showToast("Gagal memuat dashboard: " + e, "error");
  }
};

function card(label, value, accent) {
  return `<div style="background:var(--bg-card);padding:12px 18px;border-radius:var(--radius);box-shadow:var(--shadow);min-width:140px;flex:1;border-top:3px solid ${accent || "var(--primary)"};">
    <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">${label}</div>
    <div style="font-size:18px;font-weight:700;margin-top:2px;">${value}</div>
  </div>`;
}

function renderDashboard(s) {
  const cards = document.getElementById("dashboard-cards");
  if (cards) {
    cards.innerHTML =
      card("Kwitansi", String(s.total_n), "var(--primary)") +
      card("Bruto", "Rp " + formatRupiah(s.total_bruto), "var(--primary)") +
      card("PPh", "Rp " + formatRupiah(s.total_pph), "var(--danger)") +
      card("PPN", "Rp " + formatRupiah(s.total_ppn), "var(--warning)") +
      card("Total", "Rp " + formatRupiah(s.total_netto), "var(--success)") +
      card(`BPU (${s.bpu_n})`, "Rp " + formatRupiah(s.bpu_total), "#1a56db") +
      card(`BNU (${s.bnu_n})`, "Rp " + formatRupiah(s.bnu_total), "#ec4899");
  }

  const tax = document.getElementById("dashboard-tax");
  if (tax) {
    const rows = [
      ["PPh 21 6%", s.pph21_total],
      ["PPh 21 5%", s.pph21_5_total],
      ["PPh 23 4%", s.pph23_total],
      ["PPh 23 2%", s.pph23_2_total],
    ];
    const max = Math.max(1, ...rows.map(r => r[1]));
    tax.innerHTML = rows.map(([l, v]) => `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
          <span>${l}</span><b>Rp ${formatRupiah(v)}</b>
        </div>
        <div style="background:var(--bg-secondary);border-radius:4px;height:10px;">
          <div style="background:var(--danger);border-radius:4px;height:10px;width:${Math.round(v / max * 100)}%;"></div>
        </div>
      </div>`).join("") +
      `<div style="display:flex;justify-content:space-between;font-size:13px;margin-top:12px;padding-top:10px;border-top:1px solid var(--border);">
        <span>PPN</span><b>Rp ${formatRupiah(s.total_ppn)}</b>
      </div>`;
  }

  const bars = document.getElementById("dashboard-bars");
  if (bars) {
    if (!s.periods || s.periods.length === 0) {
      bars.innerHTML = '<div class="empty">Belum ada data</div>';
      return;
    }
    const max = Math.max(1, ...s.periods.map(p => p.total));
    bars.innerHTML = s.periods.map(p => `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
          <span>${esc(p.label)} <span style="color:var(--text-muted);">(${p.n})</span></span><b>Rp ${formatRupiah(p.total)}</b>
        </div>
        <div style="background:var(--bg-secondary);border-radius:4px;height:12px;">
          <div style="background:var(--primary);border-radius:4px;height:12px;width:${Math.round(p.total / max * 100)}%;"></div>
        </div>
      </div>`).join("");
  }
}

function esc(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatRupiah(num) {
  return Math.round(num || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

window._dashboardReady = true;
