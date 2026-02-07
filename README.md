# TabIntent

**Never forget why you opened a tab.**

TabIntent is a lightweight Chrome extension that helps you capture *intent* when you open a new tab — so your tabs don’t lose context over time.

I built this as a small side project to solve my own “too many tabs” problem and to explore browser extensions, UX, and local-first intelligence.

---

## 🚀 What TabIntent Does

Every time you open a new webpage, TabIntent gently asks:

> **“Why did you open this?”**

You can:
- Select an intent (Work, Research, Read later, Shopping, Just curious)
- Optionally add a short note
- Skip for now or stop being asked on that site

Later, TabIntent remembers the context — not just the URL.

---

## ✨ Key Features

- **Intent-based tab tracking** (not just URLs)
- **Local intent suggestion** with confidence score
- **Auto-generated 1-line notes** using keyword extraction
- **Skip & “Do not ask again” controls**
- **Per-tab tracking**
- **Analytics counters** (saved vs skipped)
- **Shadow DOM UI** (doesn’t break sites like GitHub, Canvas, etc.)
- **Fully local** — no APIs, no accounts, no tracking

---

## 🧠 Local “AI” (No APIs, No Keys)

TabIntent uses a **fully local heuristic-based approach**:

- Tokenization + stopword filtering
- Seeded keyword scoring per intent
- Domain-based boosts (e.g., GitHub → Work task)
- Softmax-based confidence estimation
- Keyword extraction for note generation

✅ Works offline  
✅ Privacy-safe  
✅ No OpenAI / HuggingFace / external calls  

---

## 🛠️ Tech Stack

- **Chrome Extension** (Manifest V3)
- **JavaScript**
- **Shadow DOM** for isolated UI
- **chrome.storage** for persistence
- Local heuristics for intent classification

---

## 📦 Installation (Manual – Load Unpacked)

Since this is not yet on the Chrome Web Store:

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the project folder (the one with `manifest.json`)

The extension will start working immediately.

---

## 🧪 How to Try It

- Open a new tab (GitHub, Medium, Amazon, etc.)
- You’ll see the TabIntent prompt
- Try:
  - Using the suggested intent
  - Auto-generating a note
  - Skipping or disabling prompts
- Open the extension popup to view saved intents

---

## 📌 Current Status

This is an **early but fully functional version**.

Deliberate design choices:
- No cloud sync
- No user accounts
- No external AI APIs
- Local-first and privacy-friendly

---

## 🔮 Possible Next Improvements

- Learn from user corrections (local personalization)
- Daily/weekly intent summaries
- Stale tab nudges
- Chrome Web Store release
- Optional opt-in cloud AI

---

## 💬 Feedback

This project started as a personal learning exercise and a real productivity problem I wanted to fix.

Feedback, ideas, and UX critiques are very welcome.

---

## 📄 License

MIT
