import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

// ========== BACKUP & RESTORE ==========
// Folder backup pilihan user (tersimpan di app_settings). Daftar + pulihkan.

window._loadBackups = async function () {
  try {
    const dir = await invoke("cmd_get_backup_dir");
    const label = document.getElementById("backup-dir-label");
    if (label) label.textContent = dir;
  } catch (_) {}
  try {
    const list = await invoke("cmd_list_backups");
    const tbody = document.getElementById("backup-tbody");
    if (!tbody) return;
    tbody.innerHTML = list.length === 0
      ? '<tr><td colspan="4" class="empty">Belum ada backup</td></tr>'
      : list.map(b => `<tr>
          <td title="${esc(b.path)}">${esc(b.name)}</td>
          <td>${esc(b.modified || "-")}</td>
          <td class="rupiah" style="text-align:right;">${formatBytes(b.size)}</td>
          <td><button class="btn btn-sm btn-secondary" onclick="handleRestoreBackup('${esc(b.path).replace(/'/g, "\\'")}')">Pulihkan</button></td>
        </tr>`).join("");
  } catch (e) {
    if (window._showToast) window._showToast("Gagal memuat daftar backup: " + e, "error");
  }
};

window.handlePilihBackupDir = async function () {
  try {
    const dir = await open({ directory: true, multiple: false, title: "Pilih folder backup" });
    if (!dir) return;
    const saved = await invoke("cmd_set_backup_dir", { dir: dir });
    const label = document.getElementById("backup-dir-label");
    if (label) label.textContent = saved;
    if (window._showToast) window._showToast("Folder backup disimpan", "success");
    window._loadBackups();
  } catch (e) {
    if (window._showToast) window._showToast("Gagal: " + e, "error");
  }
};

window.handleBackupNow = async function () {
  try {
    const path = await invoke("cmd_backup_now");
    if (window._showToast) window._showToast("Backup tersimpan", "success");
    window._loadBackups();
  } catch (e) {
    if (window._showToast) window._showToast("Gagal backup: " + e, "error");
  }
};

window.handleRestoreBackup = async function (path) {
  if (!confirm("Pulihkan database dari backup ini?\nData aktif saat ini diamankan dulu sebagai cadangan darurat.")) return;
  try {
    await invoke("cmd_restore_backup", { path: path });
    if (window._showToast) window._showToast("Database dipulihkan — memuat ulang", "success");
    if (window._showPage) window._showPage("riwayat");
    else location.reload();
  } catch (e) {
    if (window._showToast) window._showToast("Gagal memulihkan: " + e, "error");
  }
};

function formatBytes(n) {
  n = n || 0;
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}

function esc(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

window._backupReady = true;
