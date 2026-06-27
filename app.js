// app.js — LeanLog

// ── Helpers ──────────────────────────────────────────
function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" +
    String(d.getMonth()+1).padStart(2,"0") + "-" +
    String(d.getDate()).padStart(2,"0");
}

function formatDateKey(key) {
  const [y,m,d] = key.split("-").map(Number);
  return new Date(y, m-1, d).toLocaleDateString("en-US", {
    weekday:"short", year:"numeric", month:"short", day:"numeric"
  });
}

function msUntilMidnight() {
  const now = new Date();
  const mid = new Date(now);
  mid.setHours(24,0,0,0);
  return mid - now;
}

// ── LocalStorage ──────────────────────────────────────
function getUid() {
  let uid = localStorage.getItem("leanlog_uid");
  if (!uid) {
    uid = "u_" + Math.random().toString(36).slice(2,10) + Date.now().toString(36);
    localStorage.setItem("leanlog_uid", uid);
  }
  return uid;
}

// ── Screen switching ──────────────────────────────────
function showScreen(id) {
  ["splash-screen","onboarding-screen","dashboard-screen"].forEach(function(sid) {
    var el = document.getElementById(sid);
    el.classList.add("hidden");
    el.classList.remove("splash-visible");
  });
  document.getElementById(id).classList.remove("hidden");
}

// ── State ─────────────────────────────────────────────
var currentUser = null;
var entries = [];
var midTimer = null;

// ── Firestore refs ────────────────────────────────────
function uDoc(uid)      { return db.collection("users").doc(uid); }
function eDoc(uid,date) { return db.collection("users").doc(uid).collection("entries").doc(date); }
function eColl(uid)     { return db.collection("users").doc(uid).collection("entries"); }

// ── Boot: splash then init ─────────────────────────────
setTimeout(function() {
  initApp();
}, 3000);

async function initApp() {
  var uid = getUid();
  try {
    var snap = await uDoc(uid).get();
    if (snap.exists) {
      currentUser = Object.assign({ id: uid }, snap.data());
      await loadDashboard();
    } else {
      showScreen("onboarding-screen");
    }
  } catch(e) {
    console.error("initApp error", e);
    showScreen("onboarding-screen");
  }
}

// ── Onboarding save ───────────────────────────────────
document.getElementById("start-btn").addEventListener("click", async function() {
  var nameVal = document.getElementById("user-name").value.trim();
  var sw      = parseFloat(document.getElementById("start-weight").value);
  var ht      = parseFloat(document.getElementById("start-height").value);
  var gw      = parseFloat(document.getElementById("goal-weight").value);
  var errEl   = document.getElementById("form-error");

  errEl.textContent = "";
  if (!nameVal)             { errEl.textContent = "Please enter your name.";        return; }
  if (isNaN(sw) || sw < 30) { errEl.textContent = "Enter a valid starting weight."; return; }
  if (isNaN(ht) || ht < 100){ errEl.textContent = "Enter a valid height.";          return; }
  if (isNaN(gw) || gw < 30) { errEl.textContent = "Enter a valid goal weight.";     return; }

  var btn = document.getElementById("start-btn");
  btn.disabled = true;
  btn.querySelector("span").textContent = "Saving...";
  errEl.textContent = "";

  var uid = getUid();
  var data = { name: nameVal, startWeight: sw, height: ht, goalWeight: gw };

  try {
    await uDoc(uid).set(data);
    currentUser = Object.assign({ id: uid }, data);
    await loadDashboard();
  } catch(e) {
    console.error("save user error", e);
    errEl.textContent = "Error saving. Check internet and try again.";
    btn.disabled = false;
    btn.querySelector("span").textContent = "Start tracking";
  }
});

// ── Dashboard ─────────────────────────────────────────
async function loadDashboard() {
  showScreen("dashboard-screen");
  renderProfile();
  await loadEntries();
  renderTodayForm();
  scheduleMidnight();
}

function renderProfile() {
  var u = currentUser;
  document.getElementById("profile-name").textContent = u.name;
  document.getElementById("avatar-circle").textContent = u.name.charAt(0).toUpperCase();
  var bmi = u.startWeight / Math.pow(u.height/100, 2);
  document.getElementById("profile-meta").textContent = u.height + " cm · BMI " + bmi.toFixed(1) + " at start";
  document.getElementById("stat-start").textContent = u.startWeight + " kg";
  document.getElementById("stat-goal").textContent  = u.goalWeight  + " kg";
}

async function loadEntries() {
  try {
    var snap = await eColl(currentUser.id).orderBy("date","desc").get();
    entries = snap.docs.map(function(d){ return d.data(); });
    renderStats();
    renderTimeline();
  } catch(e) {
    console.error("loadEntries error", e);
  }
}

function renderStats() {
  document.getElementById("stat-days").textContent = entries.length;
  var latest = entries.find(function(e){ return e.weight; });
  var cw = latest ? latest.weight : currentUser.startWeight;
  document.getElementById("stat-current").textContent = cw + " kg";
  var delta = cw - currentUser.startWeight;
  var badge = document.getElementById("progress-badge");
  document.getElementById("badge-delta").textContent = (delta > 0 ? "+" : "") + delta.toFixed(1) + " kg";
  badge.classList.remove("badge-loss","badge-gain","badge-neutral");
  badge.classList.add(delta < 0 ? "badge-loss" : delta > 0 ? "badge-gain" : "badge-neutral");
}

function renderTimeline() {
  var cont  = document.getElementById("history-timeline");
  var today = todayKey();
  var past  = entries.filter(function(e){ return e.date !== today; });

  if (!past.length) {
    cont.innerHTML = '<div class="empty-history"><svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="20" stroke="var(--text-muted)" stroke-width="1.5" fill="none" opacity="0.4"/><path d="M16 28 C16 28 18 20 24 20 C30 20 32 28 32 28" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.4"/></svg><p>No history yet. Entries appear here after midnight.</p></div>';
    return;
  }

  var asc = past.slice().sort(function(a,b){ return a.date.localeCompare(b.date); });
  var html = past.map(function(entry, idx) {
    var ai   = asc.findIndex(function(e){ return e.date === entry.date; });
    var pw   = ai > 0 ? (asc[ai-1].weight || currentUser.startWeight) : currentUser.startWeight;
    var delta = entry.weight != null ? entry.weight - pw : null;
    var ds   = delta != null
      ? '<span class="entry-delta ' + (delta<0?"delta-down":delta>0?"delta-up":"delta-flat") + '">' + (delta>0?"+":"") + delta.toFixed(1) + ' kg</span>'
      : "";
    var isFirst = idx === past.length - 1;
    return '<div class="timeline-row">' +
      '<div class="tl-left"><div class="tl-dot ' + (isFirst?"tl-dot-first":"") + '"></div>' + (isFirst?"":'<div class="tl-line"></div>') + '</div>' +
      '<div class="tl-card">' +
        '<div class="tl-card-header"><span class="tl-day">Day ' + (ai+1) + '</span><span class="tl-date">' + formatDateKey(entry.date) + '</span></div>' +
        '<div class="tl-card-body">' +
          '<div class="tl-metric"><span class="tl-metric-label">Weight</span><span class="tl-metric-value">' + (entry.weight!=null?entry.weight+" kg":"—") + " " + ds + '</span></div>' +
          '<div class="tl-metric"><span class="tl-metric-label">Calories</span><span class="tl-metric-value">' + (entry.calories!=null?entry.calories.toLocaleString()+" kcal":"—") + '</span></div>' +
        '</div>' +
      '</div></div>';
  }).join("");
  cont.innerHTML = html;
}

function renderTodayForm() {
  var today = todayKey();
  document.getElementById("today-date").textContent = formatDateKey(today);
  var te = entries.find(function(e){ return e.date === today; });
  if (te) {
    if (te.weight   != null) document.getElementById("today-weight").value   = te.weight;
    if (te.calories != null) document.getElementById("today-calories").value = te.calories;
  }
}

// ── Save today ────────────────────────────────────────
document.getElementById("save-today-btn").addEventListener("click", async function() {
  var w = parseFloat(document.getElementById("today-weight").value);
  var c = parseFloat(document.getElementById("today-calories").value);

  if (isNaN(w) && isNaN(c)) { showToast("Enter weight or calories first."); return; }

  var btn   = document.getElementById("save-today-btn");
  var today = todayKey();
  btn.disabled = true;
  btn.textContent = "Saving...";

  var ex       = entries.find(function(e){ return e.date === today; });
  var pastDays = entries.filter(function(e){ return e.date < today; }).length;
  var dayNum   = ex ? (ex.dayNumber || pastDays + 1) : pastDays + 1;

  var data = {
    date:      today,
    weight:    isNaN(w) ? null : w,
    calories:  isNaN(c) ? null : c,
    dayNumber: dayNum
  };

  try {
    await eDoc(currentUser.id, today).set(data, { merge: true });

    var idx = entries.findIndex(function(e){ return e.date === today; });
    if (idx >= 0) entries[idx] = Object.assign({}, entries[idx], data);
    else          entries.unshift(data);

    renderStats();
    renderTimeline();
    showToast("Saved!");
  } catch(e) {
    console.error("save entry error", e);
    showToast("Save failed. Check internet.");
  }

  btn.disabled = false;
  btn.innerHTML = '<svg viewBox="0 0 20 20" fill="none"><path d="M5 10l4 4 6-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Save today';
});

function showToast(msg) {
  document.getElementById("toast-msg").textContent = msg;
  var t = document.getElementById("save-toast");
  t.classList.add("show");
  setTimeout(function(){ t.classList.remove("show"); }, 2500);
}

// ── Midnight reset ────────────────────────────────────
function scheduleMidnight() {
  if (midTimer) clearTimeout(midTimer);
  midTimer = setTimeout(async function() {
    await loadEntries();
    renderTodayForm();
    scheduleMidnight();
  }, msUntilMidnight());
}

// ── Logout ─────────────────────────────────────────────
document.getElementById("logout-btn").addEventListener("click", function() {
  if (!confirm("Sign out and clear session?")) return;
  localStorage.removeItem("leanlog_uid");
  currentUser = null;
  entries = [];
  if (midTimer) clearTimeout(midTimer);
  ["user-name","start-weight","start-height","goal-weight"].forEach(function(id){
    document.getElementById(id).value = "";
  });
  document.getElementById("form-error").textContent = "";
  showScreen("onboarding-screen");
});
