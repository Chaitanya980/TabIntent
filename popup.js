function timeAgo(ts) {
    const diff = Date.now() - ts;
    const sec = Math.floor(diff / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    if (day > 0) return `${day}d ago`;
    if (hr > 0) return `${hr}h ago`;
    if (min > 0) return `${min}m ago`;
    return `just now`;
  }
  
  function escapeHtml(str) {
    return (str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  
  async function getAllForPopup() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_ALL_FOR_POPUP" }, (res) => resolve(res));
    });
  }
  
  async function render() {
    const q = document.getElementById("q").value.trim().toLowerCase();
    const intentFilter = document.getElementById("intentFilter").value;
  
    const res = await getAllForPopup();
    const history = (res?.history || []).filter(Boolean);
    const analytics = res?.analytics || { saved: 0, skipped: 0 };
  
    document.getElementById("savedCount").textContent = String(analytics.saved || 0);
    document.getElementById("skippedCount").textContent = String(analytics.skipped || 0);
  
    const items = history
      .filter((r) => (intentFilter ? r.intent === intentFilter : true))
      .filter((r) => {
        if (!q) return true;
        const hay = `${r.intent} ${r.note || ""} ${r.title || ""} ${r.url || ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (b.lastSeenAt || b.createdAt || 0) - (a.lastSeenAt || a.createdAt || 0));
  
    const list = document.getElementById("list");
    const empty = document.getElementById("empty");
    list.innerHTML = "";
  
    if (items.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
  
    for (const r of items) {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="row1">
          <div class="title" title="${escapeHtml(r.title || r.url)}">
            ${escapeHtml(r.title || r.url || "Untitled")}
          </div>
          <div class="badge">${escapeHtml(r.intent || "—")}</div>
        </div>
        <div class="meta">
          Opened ${r.createdAt ? timeAgo(r.createdAt) : "—"} · Last seen ${r.lastSeenAt ? timeAgo(r.lastSeenAt) : "—"}
          ${r.note ? `<br/>Note: ${escapeHtml(r.note)}` : ""}
        </div>
        <div class="actions">
          <span class="link" data-open="${escapeHtml(r.url)}">Open</span>
        </div>
      `;
  
      el.querySelector("[data-open]").addEventListener("click", async (e) => {
        const url = e.target.getAttribute("data-open");
        await chrome.tabs.create({ url });
      });
  
      list.appendChild(el);
    }
  }
  
  document.getElementById("q").addEventListener("input", render);
  document.getElementById("intentFilter").addEventListener("change", render);
  
  document.getElementById("openOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  
  document.getElementById("clearAll").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "CLEAR_ALL" });
    await render();
  });
  
  render();
  