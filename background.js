// Background script for TabIntent Chrome extension

const DEFAULT_SETTINGS = {
    remindAfterMinutes: 120,   // 2 hours
    staleAfterDays: 2,         // 2 days
    enableReminders: true,
    enableStaleSuggestions: true
  };
  
  function msFromMinutes(m) {
    return m * 60 * 1000;
  }
  function msFromDays(d) {
    return d * 24 * 60 * 60 * 1000;
  }
  function isRealWebUrl(url) {
    if (!url) return false;
    try {
      const u = new URL(url);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }
  function makeId() {
    // crypto.randomUUID is available in modern Chrome service workers
    return (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  }
  
  async function getSettings() {
    const { settings } = await chrome.storage.local.get("settings");
    return { ...DEFAULT_SETTINGS, ...(settings || {}) };
  }
  async function setDefaultSettingsIfMissing() {
    const { settings } = await chrome.storage.local.get("settings");
    if (!settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  
  async function getHistory() {
    const { intentsHistory } = await chrome.storage.local.get("intentsHistory");
    return intentsHistory || [];
  }
  async function setHistory(intentsHistory) {
    await chrome.storage.local.set({ intentsHistory });
  }
  
  async function getTabMap() {
    const { tabToEntry } = await chrome.storage.local.get("tabToEntry");
    return tabToEntry || {};
  }
  async function setTabMap(tabToEntry) {
    await chrome.storage.local.set({ tabToEntry });
  }
  
  async function getDoNotAskAgain() {
    const { doNotAskAgain } = await chrome.storage.local.get("doNotAskAgain");
    return doNotAskAgain || {};
  }
  async function setDoNotAskAgain(doNotAskAgain) {
    await chrome.storage.local.set({ doNotAskAgain });
  }
  
  async function getAnalytics() {
    const { analytics } = await chrome.storage.local.get("analytics");
    return analytics || { saved: 0, skipped: 0 };
  }
  async function setAnalytics(analytics) {
    await chrome.storage.local.set({ analytics });
  }
  async function incAnalytics(field) {
    const a = await getAnalytics();
    a[field] = (a[field] || 0) + 1;
    await setAnalytics(a);
    return a;
  }
  
  async function scheduleReminder(entryId, remindAt) {
    await chrome.alarms.create(`remind:${entryId}`, { when: remindAt });
  }
  async function clearReminder(entryId) {
    await chrome.alarms.clear(`remind:${entryId}`);
  }
  async function scheduleStaleSweep() {
    await chrome.alarms.create("staleSweep", { periodInMinutes: 360 }); // every 6 hours
  }
  
  async function sendReminderNotification(entry) {
    const msg = entry.note?.trim()
      ? `You wrote: “${entry.note.trim()}”`
      : "No note was added.";
  
    await chrome.notifications.create(`reminder:${entry.id}`, {
      type: "basic",
      iconUrl:
        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHJ4PSIxMiIgZmlsbD0iI0U1RTdFQiIvPjxwYXRoIGQ9Ik0xOCAyMGE2IDYgMCAwIDEgNi02aDE2YTYgNiAwIDAgMSA2IDZ2MjRhNiA2IDAgMCAxLTYgNkgyNGE2IDYgMCAwIDEtNi02VjIwWiIgZmlsbD0iIzExMTgyNyIvPjxwYXRoIGQ9Ik0yNCAyOGgxNk0yNCAzNmgxMiIgc3Ryb2tlPSIjRTVFN0VCIiBzdHJva2Utd2lkdGg9IjQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg==",
      title: "TabIntent reminder",
      message: `You opened this to: ${entry.intent}\n${entry.title || entry.url}\n\n${msg}`
    });
  }
  
  async function sendStaleNotification(entry) {
    await chrome.notifications.create(`stale:${entry.id}`, {
      type: "basic",
      iconUrl:
        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHJ4PSIxMiIgZmlsbD0iI0ZFRjNDNyIvPjxwYXRoIGQ9Ik0zMiAxNkw0OCA0OGgtMzJMMzIgMTZaIiBmaWxsPSIjOTI0MDBFIi8+PHBhdGggZD0iTTMyIDI0djE0IiBzdHJva2U9IiNGRUYzQzciIHN0cm9rZS13aWR0aD0iNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PGNpcmNsZSBjeD0iMzIiIGN5PSI0MiIgcj0iMi41IiBmaWxsPSIjRkVGM0M3Ii8+PC9zdmc+",
      title: "TabIntent: stale tab?",
      message: `This tab is stale: ${entry.title || entry.url}\nIntent: ${entry.intent}`,
      buttons: [{ title: "Close tab (if open)" }, { title: "Keep" }]
    });
  }
  
  async function closeTabIfOpen(tabId, url) {
    // Prefer tabId if still exists; fallback by url.
    if (typeof tabId === "number") {
      try {
        await chrome.tabs.get(tabId);
        await chrome.tabs.remove(tabId);
        return true;
      } catch {
        // tabId no longer valid
      }
    }
    if (url) {
      const tabs = await chrome.tabs.query({ url });
      if (tabs?.length) {
        for (const t of tabs) await chrome.tabs.remove(t.id);
        return true;
      }
    }
    return false;
  }
  
  chrome.runtime.onInstalled.addListener(async () => {
    await setDefaultSettingsIfMissing();
    await scheduleStaleSweep();
  
    // ensure analytics exists
    const a = await getAnalytics();
    await setAnalytics(a);
  });
  
  // Update lastSeen/title based on per-tab mapping
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!changeInfo.url && changeInfo.status !== "complete") return;
    const url = tab.url || changeInfo.url;
    if (!isRealWebUrl(url)) return;
  
    const tabMap = await getTabMap();
    const entryId = tabMap[String(tabId)];
    if (!entryId) return;
  
    const history = await getHistory();
    const idx = history.findIndex((e) => e.id === entryId);
    if (idx === -1) return;
  
    history[idx] = {
      ...history[idx],
      url,
      title: tab.title || history[idx].title || "",
      lastSeenAt: Date.now(),
      lastTabId: tabId
    };
  
    await setHistory(history);
  });
  
  // Clean tab mapping when tab closes
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const tabMap = await getTabMap();
    if (tabMap[String(tabId)]) {
      delete tabMap[String(tabId)];
      await setTabMap(tabMap);
    }
  });
  
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      const tabId = sender?.tab?.id;
  
      if (msg?.type === "GET_TAB_STATUS") {
        const url = msg.url;
        const tabMap = await getTabMap();
        const doNotAskAgain = await getDoNotAskAgain();
        const hasIntentForThisTab = tabId != null && !!tabMap[String(tabId)];
        sendResponse({
          ok: true,
          hasIntentForThisTab,
          doNotAskAgain: !!doNotAskAgain[url]
        });
        return;
      }
  
      if (msg?.type === "SKIP_INTENT") {
        const a = await incAnalytics("skipped");
        sendResponse({ ok: true, analytics: a });
        return;
      }
  
      if (msg?.type === "DO_NOT_ASK_AGAIN") {
        const url = msg.url;
        if (!url) {
          sendResponse({ ok: false, error: "Missing url" });
          return;
        }
        const m = await getDoNotAskAgain();
        m[url] = true;
        await setDoNotAskAgain(m);
        sendResponse({ ok: true });
        return;
      }
  
      if (msg?.type === "SAVE_INTENT") {
        const { url, title, intent, note } = msg.payload || {};
        if (!url || !intent) {
          sendResponse({ ok: false, error: "Missing url/intent" });
          return;
        }
  
        const settings = await getSettings();
        const now = Date.now();
        const entryId = makeId();
  
        const entry = {
          id: entryId,
          url,
          title: title || "",
          intent,
          note: note || "",
          createdAt: now,
          lastSeenAt: now,
          reminded: false,
          staleNotified: false,
          lastTabId: typeof tabId === "number" ? tabId : null
        };
  
        const history = await getHistory();
        history.push(entry);
        await setHistory(history);
  
        if (typeof tabId === "number") {
          const tabMap = await getTabMap();
          tabMap[String(tabId)] = entryId;
          await setTabMap(tabMap);
        }
  
        const a = await incAnalytics("saved");
  
        if (settings.enableReminders) {
          const remindAt = now + msFromMinutes(settings.remindAfterMinutes);
          await scheduleReminder(entryId, remindAt);
        }
  
        sendResponse({ ok: true, saved: entry, analytics: a });
        return;
      }
  
      if (msg?.type === "GET_ALL_FOR_POPUP") {
        const [history, analytics, settings] = await Promise.all([
          getHistory(),
          getAnalytics(),
          getSettings()
        ]);
        sendResponse({ ok: true, history, analytics, settings });
        return;
      }
  
      if (msg?.type === "CLEAR_ALL") {
        await chrome.storage.local.remove(["intentsHistory", "tabToEntry", "doNotAskAgain"]);
        await chrome.storage.local.set({ analytics: { saved: 0, skipped: 0 } });
        sendResponse({ ok: true });
        return;
      }
  
      sendResponse({ ok: false, error: "Unknown message" });
    })();
  
    return true;
  });
  
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    const settings = await getSettings();
  
    if (alarm.name === "staleSweep") {
      if (!settings.enableStaleSuggestions) return;
  
      const history = await getHistory();
      const now = Date.now();
      const staleMs = msFromDays(settings.staleAfterDays);
  
      let changed = false;
  
      for (let i = 0; i < history.length; i++) {
        const e = history[i];
        if (!e?.createdAt) continue;
  
        const age = now - e.createdAt;
        if (age >= staleMs && !e.staleNotified) {
          await sendStaleNotification(e);
          history[i] = { ...e, staleNotified: true };
          changed = true;
        }
      }
  
      if (changed) await setHistory(history);
      return;
    }
  
    if (alarm.name.startsWith("remind:")) {
      if (!settings.enableReminders) return;
  
      const entryId = alarm.name.slice("remind:".length);
      const history = await getHistory();
      const idx = history.findIndex((e) => e.id === entryId);
      if (idx === -1) return;
  
      const e = history[idx];
      if (e.reminded) return;
  
      await sendReminderNotification(e);
  
      history[idx] = { ...e, reminded: true };
      await setHistory(history);
      return;
    }
  });
  
  chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
    if (!notificationId.startsWith("stale:")) return;
  
    const entryId = notificationId.slice("stale:".length);
    const history = await getHistory();
    const entry = history.find((e) => e.id === entryId);
    if (!entry) return;
  
    if (buttonIndex === 0) {
      await closeTabIfOpen(entry.lastTabId, entry.url);
    }
    // buttonIndex === 1 => Keep (do nothing)
  });
  