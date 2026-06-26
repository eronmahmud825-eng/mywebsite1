// app.js — LeanLog Weight Loss Tracker

// ── Helpers ──────────────────────────────────────────

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function formatDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m-1, d).toLocaleDateString("en-US", {
    weekday: "short", year: "numeric", month: "short", day: "numeric"
  });
}

function msUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight - now;
}

const Session = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  del: (k) => localStorage.removeItem(k),
};

// ── Screen Manager ───────────────────────────────────

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active", "fade-in"));
  const target = document.getElementById(id);
  target.classList.add("active");
  requestAnimationFrame(() => target.classList.add("fade-in"));
}

// ── State ────────────────────────────────────────────

let currentUser = null;
let historyEntries = [];
let midnightTimer = null;

// ── Firestore Helpers ────────────────────────────────

function userDoc(userId) {
  return db.collection("users").doc(userId);
}
function entryDoc(userId, dateKey) {
  return db.collection("users").doc(userId).collection("entries").doc(dateKey);
}
function entriesCollection(userId) {
  return db.collection("users").doc(userId).collection("entries");
}

// ── User ID ──────────────────────────────────────────

function getOrCreateUserId() {
  let uid = Session.get("leanlog_uid");
  if (!uid) {
    uid = "user_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    Session.set("leanlog_uid", uid);
  }
  return uid;
}

// ── Splash ───────────────────────────────────────────

function runSplash() {
  setTimeout(() => {
    document.getElementById("splash-screen").classList.add("slide-out");
    setTimeout(() => {
      document.getElementById("splash-screen").classList.remove("active");
      initApp();
    }, 600);
  }, 2800);
}

// ── Init ─────────────────────────────────────────────

async function initApp() {
  const uid = getOrCreateUserId();
  try {
    const snap = await userDoc(uid).get();
    if (snap.exists) {
      currentUser = { id: uid, ...snap.data() };
      await loadDashboard();
    } else {
      showScreen("onboarding-screen");
    }
  } catch (err) {
    console.error("Firebase read error:", err);
    showScreen("onboarding-screen");
  }
}

// ── Onboarding ───────────────────────────────────────

document.getElementById("start-btn").addEventListener("click", async () => {
  const name = document.getElementById("user-name").value.trim();
  const startWeight = parseFloat(document.getElementById("start-weight").value);
  const height = parseFloat(document.getElementById("start-height").value);
  const goalWeight = parseFloat(document.getElementById("goal-weight").value);
  const errEl = document.getElementById("form-error");

  if (!name) { errEl.textContent = "Please enter your name."; return; }
  if (isNaN(startWeight) || startWeight < 30) { errEl.textContent = "Enter a valid starting weight."; return; }
  if (isNaN(height) || height < 100) { errEl.textContent = "Enter a valid height."; return; }
  if (isNaN(goalWeight) || goalWeight < 30) { errEl.textContent = "Enter a valid goal weight."; return; }

  errEl.textContent = "";
  const btn = document.getElementById("start-btn");
  btn.disabled = true;
  btn.querySelector("span").textContent = "Saving...";

  const uid = getOrCreateUserId();
  const userData = {
    name, startWeight, height, goalWeight,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await userDoc(uid).set(userData);
    currentUser = { id: uid, ...userData };
    await loadDashboard();
  } catch (err) {
    console.error("Error saving user:", err);
    errEl.textContent = "Couldn't save. Check your connection and try again.";
    btn.disabled = false;
    btn.querySelector("span").textContent = "Start tracking";
  }
});

// ── Dashboard ────────────────────────────────────────

async function loadDashboard() {
  showScreen("dashboard-screen");
  renderProfile();
  await loadHistory();
  renderTodayForm();
  scheduleMidnightReset();
}

function renderProfile() {
  const u = currentUser;
  document.getElementById("profile-name").textContent = u.name;
  document.getElementById("avatar-circle").textContent = u.name.charAt(0).toUpperCase();

  const heightM = u.height / 100;
  const bmi = u.startWeight / (heightM * heightM);
  document.getElementById("profile-meta").textContent = `${u.height} cm · BMI ${bmi.toFixed(1)} at start`;

  document.getElementById("stat-start").textContent = `${u.startWeight} kg`;
  document.getElementById("stat-goal").textContent = `${u.goalWeight} kg`;
}

async function loadHistory() {
  try {
    const snap = await entriesCollection(currentUser.id)
      .orderBy("date", "desc")
      .get();
    historyEntries = snap.docs.map(d => d.data());
    renderHistoryStats();
    renderHistoryTimeline();
  } catch (err) {
    console.error("Error loading history:", err);
  }
}

function renderHistoryStats() {
  const u = currentUser;
  document.getElementById("stat-days").textContent = historyEntries.length;

  const latestEntry = historyEntries.find(e => e.weight);
  const currentWeight = latestEntry ? latestEntry.weight : u.startWeight;
  document.getElementById("stat-current").textContent = `${currentWeight} kg`;

  const delta = currentWeight - u.startWeight;
  const badgeEl = document.getElementById("progress-badge");
  const deltaEl = document.getElementById("badge-delta");
  const sign = delta > 0 ? "+" : "";
  deltaEl.textContent = `${sign}${delta.toFixed(1)} kg`;

  badgeEl.classList.remove("badge-loss", "badge-gain", "badge-neutral");
  if (delta < 0) badgeEl.classList.add("badge-loss");
  else if (delta > 0) badgeEl.classList.add("badge-gain");
  else badgeEl.classList.add("badge-neutral");
}

function renderHistoryTimeline() {
  const container = document.getElementById("history-timeline");
  const today = todayKey();
  const past = historyEntries.filter(e => e.date !== today);

  if (past.length === 0) {
    container.innerHTML = `
      <div class="empty-history">
        <svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="20" stroke="var(--text-muted)" stroke-width="1.5" fill="none" opacity="0.4"/><path d="M16 28 C16 28 18 20 24 20 C30 20 32 28 32 28" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.4"/></svg>
        <p>No history yet. Your first saved entry will appear here after midnight.</p>
      </div>`;
    return;
  }

  const ascending = [...past].sort((a, b) => a.date.localeCompare(b.date));
  const dayMap = {};
  ascending.forEach((e, i) => { dayMap[e.date] = i + 1; });

  const html = past.map((entry, idx) => {
    const dayNum = dayMap[entry.date];
    const ascIdx = ascending.findIndex(e => e.date === entry.date);
    let prevWeight = ascIdx > 0 ? (ascending[ascIdx-1].weight ?? currentUser.startWeight) : currentUser.startWeight;

    const delta = entry.weight != null ? entry.weight - prevWeight : null;
    const deltaStr = delta != null
      ? `<span class="entry-delta ${delta < 0 ? "delta-down" : delta > 0 ? "delta-up" : "delta-flat"}">${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg</span>`
      : "";

    const isFirst = idx === past.length - 1;

    return `
      <div class="timeline-row">
        <div class="tl-left">
          <div class="tl-dot ${isFirst ? "tl-dot-first" : ""}"></div>
          ${isFirst ? "" : '<div class="tl-line"></div>'}
        </div>
        <div class="tl-card">
          <div class="tl-card-header">
            <span class="tl-day">Day ${dayNum}</span>
            <span class="tl-date">${formatDateKey(entry.date)}</span>
          </div>
          <div class="tl-card-body">
            <div class="tl-metric">
              <span class="tl-metric-label">Weight</span>
              <span class="tl-metric-value">${entry.weight != null ? entry.weight + " kg" : "—"} ${deltaStr}</span>
            </div>
            <div class="tl-metric">
              <span class="tl-metric-label">Calories</span>
              <span class="tl-metric-value">${entry.calories != null ? entry.calories.toLocaleString() + " kcal" : "—"}</span>
            </div>
          </div>
        </div>
      </div>`;
  }).join("");

  container.innerHTML = html;
}

// ── Today Form ────────────────────────────────────────

function renderTodayForm() {
  const today = todayKey();
  document.getElementById("today-date").textContent = formatDateKey(today);

  const todayEntry = historyEntries.find(e => e.date === today);
  if (todayEntry) {
    if (todayEntry.weight != null) document.getElementById("today-weight").value = todayEntry.weight;
    if (todayEntry.calories != null) document.getElementById("today-calories").value = todayEntry.calories;
  }
}

document.getElementById("save-today-btn").addEventListener("click", async () => {
  const weight = parseFloat(document.getElementById("today-weight").value);
  const calories = parseFloat(document.getElementById("today-calories").value);

  if (isNaN(weight) && isNaN(calories)) {
    showToast("Enter at least weight or calories.");
    return;
  }

  const today = todayKey();
  const btn = document.getElementById("save-today-btn");
  btn.disabled = true;

  const allDates = historyEntries.map(e => e.date).sort();
  let dayNumber = 1;
  if (allDates.length > 0) {
    const existing = historyEntries.find(e => e.date === today);
    if (existing) {
      dayNumber = existing.dayNumber || 1;
    } else {
      dayNumber = allDates.filter(d => d < today).length + 1;
    }
  }

  const entryData = {
    date: today,
    weight: isNaN(weight) ? null : weight,
    calories: isNaN(calories) ? null : calories,
    dayNumber,
    savedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await entryDoc(currentUser.id, today).set(entryData, { merge: true });
    const existingIdx = historyEntries.findIndex(e => e.date === today);
    if (existingIdx >= 0) {
      historyEntries[existingIdx] = { ...historyEntries[existingIdx], ...entryData };
    } else {
      historyEntries.unshift(entryData);
    }
    renderHistoryStats();
    renderHistoryTimeline();
    showToast("Saved!");
  } catch (err) {
    console.error("Error saving entry:", err);
    showToast("Error saving. Try again.");
  } finally {
    btn.disabled = false;
  }
});

function showToast(msg) {
  const toast = document.getElementById("save-toast");
  toast.childNodes.forEach(n => { if (n.nodeType === 3) n.remove(); });
  toast.appendChild(document.createTextNode(" " + msg));
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

// ── Midnight Reset ────────────────────────────────────

function scheduleMidnightReset() {
  if (midnightTimer) clearTimeout(midnightTimer);
  const ms = msUntilMidnight();
  midnightTimer = setTimeout(async () => {
    await loadHistory();
    renderTodayForm();
    scheduleMidnightReset();
  }, ms);
}

// ── Logout ───────────────────────────────────────────

document.getElementById("logout-btn").addEventListener("click", () => {
  if (!confirm("Sign out and clear local session?")) return;
  Session.del("leanlog_uid");
  currentUser = null;
  historyEntries = [];
  if (midnightTimer) clearTimeout(midnightTimer);
  ["user-name","start-weight","start-height","goal-weight"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("form-error").textContent = "";
  showScreen("onboarding-screen");
});

// ── Boot ─────────────────────────────────────────────

runSplash();
