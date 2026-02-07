const DEFAULT_SETTINGS = {
    remindAfterMinutes: 120,
    staleAfterDays: 2,
    enableReminders: true,
    enableStaleSuggestions: true
  };
  
  async function load() {
    const { settings } = await chrome.storage.local.get("settings");
    const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  
    document.getElementById("remindAfterMinutes").value = s.remindAfterMinutes;
    document.getElementById("staleAfterDays").value = s.staleAfterDays;
    document.getElementById("enableReminders").checked = !!s.enableReminders;
    document.getElementById("enableStaleSuggestions").checked = !!s.enableStaleSuggestions;
  }
  
  async function save() {
    const s = {
      remindAfterMinutes: Number(document.getElementById("remindAfterMinutes").value || 120),
      staleAfterDays: Number(document.getElementById("staleAfterDays").value || 2),
      enableReminders: document.getElementById("enableReminders").checked,
      enableStaleSuggestions: document.getElementById("enableStaleSuggestions").checked
    };
  
    await chrome.runtime.sendMessage({ type: "UPDATE_SETTINGS", settings: s });
  
    const status = document.getElementById("status");
    status.hidden = false;
    setTimeout(() => (status.hidden = true), 1200);
  }
  
  document.getElementById("save").addEventListener("click", save);
  load();
  