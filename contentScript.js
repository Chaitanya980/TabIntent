//context script for TabIntent extension

const INTENTS = ["Read later", "Research", "Work task", "Shopping", "Just curious"];

/* -------------------- Utilities -------------------- */
function isRealWebUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function sendMessage(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (res) => resolve(res)));
}

async function getTabStatus(url) {
  const res = await sendMessage({ type: "GET_TAB_STATUS", url });
  return res || { hasIntentForThisTab: false, doNotAskAgain: false };
}

async function saveIntent({ url, title, intent, note }) {
  return sendMessage({ type: "SAVE_INTENT", payload: { url, title, intent, note } });
}

async function logSkip() {
  return sendMessage({ type: "SKIP_INTENT" });
}

async function doNotAskAgain(url) {
  return sendMessage({ type: "DO_NOT_ASK_AGAIN", url });
}

/* -------------------- Local “AI” (Classifier + Keywords) -------------------- */

// Lightweight tokenizer
function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Small stopword set
const STOP = new Set([
  "the","a","an","and","or","but","to","of","in","on","for","with","as","by","at","from","is","are","was","were",
  "be","been","it","this","that","these","those","you","your","we","our","they","their","i","me","my",
  "how","what","why","when","where","which","who",
  "can","could","should","would","will","just","also","more","most","new","about","into","over","under",
  "page","home","official","site","online","learn"
]);

function termFreq(tokens) {
  const tf = Object.create(null);
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (STOP.has(t)) continue;
    tf[t] = (tf[t] || 0) + 1;
  }
  return tf;
}

const SEEDS = {
  "Shopping": [
    "buy","price","deal","discount","coupon","order","cart","checkout","shipping","returns","review","reviews",
    "amazon","ebay","walmart","bestbuy","target","store","product"
  ],
  "Research": [
    "docs","documentation","api","reference","guide","tutorial","paper","research","dataset","benchmark",
    "aws","iam","kubernetes","docker","linux","python","java","golang","system","design","security","ransomware",
    "wikipedia","arxiv","ieee"
  ],
  "Work task": [
    "jira","ticket","issue","bug","fix","deploy","deployment","build","pipeline","ci","cd","pr","pull","merge",
    "github","gitlab","bitbucket","confluence","notion","canvas","assignment","deadline","submit","rubric","grade"
  ],
  "Read later": [
    "blog","article","newsletter","post","medium","devto","substack","opinion","story","read","reading","longform"
  ],
  "Just curious": [
    "interesting","fun","random","curious","what","why","explore","discover"
  ]
};

function scoreBySeeds(tokens) {
  const set = new Set(tokens);
  const scores = {
    "Read later": 0,
    "Research": 0,
    "Work task": 0,
    "Shopping": 0,
    "Just curious": 0
  };

  for (const label of Object.keys(SEEDS)) {
    for (const k of SEEDS[label]) {
      if (set.has(k)) scores[label] += 1;
    }
  }
  return scores;
}

function domainBoost(url) {
  const s = (url || "").toLowerCase();
  const boost = {
    "Read later": 0,
    "Research": 0,
    "Work task": 0,
    "Shopping": 0,
    "Just curious": 0
  };

  if (s.includes("github.com") || s.includes("gitlab.com") || s.includes("bitbucket")) boost["Work task"] += 2.5;
  if (s.includes("stackoverflow.com") || s.includes("serverfault.com")) boost["Research"] += 2.2;
  if (s.includes("docs.") || s.includes("/docs") || s.includes("developer.")) boost["Research"] += 2.0;
  if (s.includes("amazon.") || s.includes("ebay.") || s.includes("walmart.") || s.includes("bestbuy.")) boost["Shopping"] += 2.8;
  if (s.includes("medium.com") || s.includes("dev.to") || s.includes("substack.com")) boost["Read later"] += 2.2;
  if (s.includes("youtube.com") || s.includes("netflix.com") || s.includes("twitch.tv")) boost["Just curious"] += 1.8;

  return boost;
}

function softmax(scoresObj) {
  const labels = Object.keys(scoresObj);
  const vals = labels.map((k) => scoresObj[k]);
  const max = Math.max(...vals);
  const exps = vals.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probs = {};
  labels.forEach((k, i) => (probs[k] = exps[i] / sum));
  return probs;
}

function localPredict({ title, url, description, h1 }) {
  const tokens = tokenize(`${title} ${description} ${h1} ${url}`);
  const seedScores = scoreBySeeds(tokens);
  const boosts = domainBoost(url);

  const combined = {};
  for (const label of INTENTS) {
    combined[label] =
      (seedScores[label] || 0) +
      (boosts[label] || 0) +
      Math.min(tokens.length / 60, 0.6);
  }

  const probs = softmax(combined);
  let best = "Just curious";
  let bestP = 0;

  for (const label of INTENTS) {
    if (probs[label] > bestP) {
      bestP = probs[label];
      best = label;
    }
  }

  const confidence = Math.max(0.45, Math.min(0.92, bestP));
  return { intent: best, confidence };
}

function extractKeywords({ title, description, h1 }, maxWords = 6) {
  const tokens = tokenize(`${title} ${h1} ${description}`);
  const tf = termFreq(tokens);

  const scored = Object.keys(tf).map((w) => ({
    w,
    s: tf[w] * (w.length >= 7 ? 1.25 : 1)
  }));

  scored.sort((a, b) => b.s - a.s);

  const out = [];
  for (const { w } of scored) {
    if (out.length >= maxWords) break;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

function localGenerateNote({ intent, title, description, h1 }) {
  const kws = extractKeywords({ title, description, h1 }, 5);
  const topic = kws.length ? kws.join(" ") : (title || "this page");
  const cleanTitle = (title || "").replace(/\s+/g, " ").trim();

  if (intent === "Work task") return `Work: follow up on ${kws.length ? topic : cleanTitle}`.slice(0, 90);
  if (intent === "Research") return `Research: ${kws.length ? topic : cleanTitle}`.slice(0, 90);
  if (intent === "Shopping") return `Compare options: ${kws.length ? topic : cleanTitle}`.slice(0, 90);
  if (intent === "Read later") return `Read later: ${kws.length ? topic : cleanTitle}`.slice(0, 90);
  return `Revisit: ${kws.length ? topic : cleanTitle}`.slice(0, 90);
}

/* -------------------- Shadow DOM UI -------------------- */
function overlayCss() {
  return `
    :host {
      all: initial;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      color: #111827;
    }

    /* Force text rendering inside Shadow DOM */
    * { box-sizing: border-box; }

    button, input {
      font: inherit;
      color: inherit;
      letter-spacing: normal;
      text-transform: none;
    }

    button {
      -webkit-appearance: none;
      appearance: none;
      background: transparent;
    }

    .mini, .btn, .chip {
      color: #111827 !important;
      -webkit-text-fill-color: #111827 !important;
      line-height: 1.2;
    }

    .backdrop {
      position: fixed; inset: 0; z-index: 2147483647;
      display: flex; align-items: flex-start; justify-content: center;
      padding: 24px 12px; background: rgba(0,0,0,0.25);
    }

    .card {
      width: min(560px, calc(100vw - 24px));
      background: #fff; border-radius: 16px; padding: 16px;
      border: 1px solid rgba(17,24,39,0.12);
      box-shadow: 0 18px 60px rgba(0,0,0,0.35);
      color: #111827;
    }

    .title { font-size: 18px; font-weight: 800; margin: 0 0 6px; }
    .subtitle { font-size: 13px; color: #4b5563; margin: 0 0 10px; line-height: 1.4; }

    .suggest {
      font-size: 12px; color: #374151; margin: 0 0 12px;
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
    }
    .suggest .pill {
      font-size: 12px; font-weight: 800;
      padding: 6px 10px; border-radius: 999px;
      border: 1px solid rgba(17,24,39,0.18); background: #f9fafb;
      white-space: nowrap;
      color: #111827;
      -webkit-text-fill-color: #111827;
    }

    .chips { display:flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }

    .chip {
      display: inline-flex; align-items:center; justify-content:center;
      padding: 10px 12px; border-radius: 999px;
      border: 1px solid rgba(17,24,39,0.18);
      background: #f9fafb;
      font-size: 13px; font-weight: 800;
      cursor: pointer; user-select: none;
      transition: transform 0.06s ease, background 0.15s ease, border-color 0.15s ease;
    }
    .chip:hover { background: #f3f4f6; }
    .chip:active { transform: scale(0.98); }
    .chip.active { background: rgba(17,24,39,0.08); border-color: rgba(17,24,39,0.55); }

    .note {
      width: 100%;
      padding: 12px 12px; border-radius: 12px;
      border: 1px solid rgba(17,24,39,0.18);
      background: #fff;
      font-size: 13px;
      color: #111827;
      -webkit-text-fill-color: #111827;
      outline: none;
    }
    .note:focus { border-color: rgba(17,24,39,0.55); box-shadow: 0 0 0 3px rgba(17,24,39,0.10); }

    .row {
      margin-top: 10px;
      display:flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }

    .mini {
      display:inline-flex; align-items:center; justify-content:center;
      padding: 8px 10px; border-radius: 12px;
      border: 1px solid rgba(17,24,39,0.18);
      background: #fff;
      font-size: 12px; font-weight: 800;
      cursor: pointer; user-select: none;
    }
    .mini:hover { background: #f9fafb; }

    .actions {
      margin-top: 12px;
      display:flex;
      justify-content:flex-end;
      gap: 10px;
      flex-wrap: wrap;
    }

    .btn {
      display:inline-flex; align-items:center; justify-content:center;
      padding: 10px 12px; border-radius: 12px;
      border: 1px solid rgba(17,24,39,0.18);
      background: #fff;
      font-size: 13px; font-weight: 900;
      cursor: pointer; user-select: none;
    }
    .btn:hover { background: #f9fafb; }
    .btn:disabled { opacity: 0.55; cursor: not-allowed; }

    .btn.primary { border-color: rgba(17,24,39,0.75); }

    .hint { margin-top: 12px; font-size: 12px; color: #6b7280; line-height: 1.35; }
  `;
}

function createShadowOverlay() {
  const host = document.createElement("div");
  host.id = "tabintent-shadow-host";
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>${overlayCss()}</style>
    <div class="backdrop">
      <div class="card" role="dialog" aria-modal="true">
        <div class="title">Why did you open this?</div>
        <div class="subtitle">Pick an intent (optional note). We’ll suggest one locally.</div>

        <div class="suggest">
          <div id="suggestText">Suggestion: …</div>
          <div class="pill" id="suggestPill">…</div>
        </div>

        <div class="chips" id="chips"></div>

        <input class="note" id="note" type="text" maxlength="120" placeholder="1-line note (optional)" />

        <div class="row">
          <button class="mini" id="genNote" type="button">Auto-generate note</button>
          <button class="mini" id="useSuggest" type="button">Use suggestion</button>
        </div>

        <div class="actions">
          <button class="btn" id="skip" type="button">Skip</button>
          <button class="btn primary" id="save" type="button" disabled>Save</button>
        </div>

        <div class="hint">Tip: Search later by intent from the extension popup.</div>
      </div>
    </div>
  `;

  return { host, shadow };
}

function showSkipMessage(shadow, onClose) {
  const card = shadow.querySelector(".card");
  card.innerHTML = `
    <div class="title">Skipped for now</div>
    <div class="subtitle">For TabIntent, it may ask again in <b>30 minutes</b>.</div>

    <div class="actions">
      <button class="btn" id="dont" type="button">Do not show again</button>
      <button class="btn primary" id="ok" type="button">OK</button>
    </div>

    <div class="hint">You can re-enable later by clearing extension data.</div>
  `;

  shadow.getElementById("ok").addEventListener("click", onClose);
  shadow.getElementById("dont").addEventListener("click", async () => {
    await doNotAskAgain(location.href);
    onClose();
  });
}

function getPageSignals() {
  const title = document.title || "";
  const description =
    document.querySelector('meta[name="description"]')?.content ||
    document.querySelector('meta[property="og:description"]')?.content ||
    "";
  const h1 = document.querySelector("h1")?.innerText || "";
  return { title, description, h1 };
}

/* -------------------- Main -------------------- */
(async function init() {
  if (!isRealWebUrl(location.href)) return;
  if (window.top !== window) return;

  // Prevent duplicates if old overlays exist
  if (document.getElementById("tabintent-shadow-host")) return;
  document.querySelectorAll("#tabintent-overlay").forEach((e) => e.remove());

  const status = await getTabStatus(location.href);
  if (status.hasIntentForThisTab || status.doNotAskAgain) return;

  const { title, description, h1 } = getPageSignals();

  const { host, shadow } = createShadowOverlay();
  document.documentElement.appendChild(host);

  const chips = shadow.getElementById("chips");
  const noteEl = shadow.getElementById("note");
  const saveBtn = shadow.getElementById("save");
  const skipBtn = shadow.getElementById("skip");
  const genNoteBtn = shadow.getElementById("genNote");
  const useSuggestBtn = shadow.getElementById("useSuggest");

  const suggestText = shadow.getElementById("suggestText");
  const suggestPill = shadow.getElementById("suggestPill");

  let selected = null;

  function selectIntent(label) {
    selected = label;
    chips.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    const btn = [...chips.querySelectorAll(".chip")].find((x) => x.textContent === label);
    if (btn) btn.classList.add("active");
    saveBtn.disabled = false;
  }

  // Render chips
  for (const label of INTENTS) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.type = "button";
    chip.textContent = label;

    chip.addEventListener("click", () => {
      selectIntent(label);
      setTimeout(() => noteEl.focus(), 0);
    });

    chips.appendChild(chip);
  }

  // Local suggestion
  const pred = localPredict({ title, url: location.href, description, h1 });
  const suggestedIntent = pred.intent;
  const confidencePct = Math.round(pred.confidence * 100);

  suggestText.textContent = `Suggestion: ${suggestedIntent}`;
  suggestPill.textContent = `${confidencePct}% confident`;

  // Preselect suggestion
  selectIntent(suggestedIntent);

  useSuggestBtn.addEventListener("click", () => {
    selectIntent(suggestedIntent);
    noteEl.focus();
  });

  genNoteBtn.addEventListener("click", () => {
    const note = localGenerateNote({ intent: selected || suggestedIntent, title, description, h1 });
    noteEl.value = note;
    noteEl.focus();
  });

  const closeOverlay = () => host.remove();

  skipBtn.addEventListener("click", async () => {
    await logSkip();
    showSkipMessage(shadow, closeOverlay);
  });

  saveBtn.addEventListener("click", async () => {
    if (!selected) return;
    const note = (noteEl.value || "").trim();

    await saveIntent({
      url: location.href,
      title,
      intent: selected,
      note
    });

    closeOverlay();
  });
})();
