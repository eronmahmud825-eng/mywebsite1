// app.js — LeanLog Weight Loss Tracker

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function formatDateKey(key) {
  const [y,m,d] = key.split("-").map(Number);
  return new Date(y,m-1,d).toLocaleDateString("en-US",{weekday:"short",year:"numeric",month:"short",day:"numeric"});
}
function msUntilMidnight() {
  const now = new Date(), mid = new Date(now);
  mid.setHours(24,0,0,0); return mid - now;
}
const Session = {
  get:(k)=>{try{return JSON.parse(localStorage.getItem(k));}catch{return null;}},
  set:(k,v)=>localStorage.setItem(k,JSON.stringify(v)),
  del:(k)=>localStorage.removeItem(k)
};

// Screen Manager
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => { s.classList.remove("active","fade-in"); s.style.display="none"; });
  const el = document.getElementById(id);
  el.style.display = (id === "splash-screen") ? "flex" : "block";
  el.classList.add("active");
  requestAnimationFrame(() => el.classList.add("fade-in"));
}

let currentUser=null, historyEntries=[], midnightTimer=null;

function userDoc(uid)        { return db.collection("users").doc(uid); }
function entryDoc(uid,key)   { return db.collection("users").doc(uid).collection("entries").doc(key); }
function entriesColl(uid)    { return db.collection("users").doc(uid).collection("entries"); }

function getOrCreateUserId() {
  let uid = Session.get("leanlog_uid");
  if (!uid) { uid="user_"+Math.random().toString(36).slice(2,10)+Date.now().toString(36); Session.set("leanlog_uid",uid); }
  return uid;
}

// Splash
function runSplash() {
  const splash = document.getElementById("splash-screen");
  splash.style.display = "flex";
  setTimeout(()=>{
    splash.classList.add("slide-out");
    setTimeout(()=>{ splash.style.display="none"; splash.classList.remove("active","slide-out"); initApp(); }, 600);
  }, 2800);
}

// Init
async function initApp() {
  try {
    const uid  = getOrCreateUserId();
    const snap = await userDoc(uid).get();
    if (snap.exists) { currentUser = {id:uid,...snap.data()}; await loadDashboard(); }
    else showScreen("onboarding-screen");
  } catch(e) { console.error("initApp:",e); showScreen("onboarding-screen"); }
}

// Onboarding
document.getElementById("start-btn").addEventListener("click", async ()=>{
  const name=document.getElementById("user-name").value.trim();
  const sw=parseFloat(document.getElementById("start-weight").value);
  const h=parseFloat(document.getElementById("start-height").value);
  const gw=parseFloat(document.getElementById("goal-weight").value);
  const err=document.getElementById("form-error");
  if(!name){err.textContent="Please enter your name.";return;}
  if(isNaN(sw)||sw<30){err.textContent="Enter a valid starting weight.";return;}
  if(isNaN(h)||h<100){err.textContent="Enter a valid height.";return;}
  if(isNaN(gw)||gw<30){err.textContent="Enter a valid goal weight.";return;}
  err.textContent="";
  const btn=document.getElementById("start-btn");
  btn.disabled=true; btn.querySelector("span").textContent="Saving...";
  const uid=getOrCreateUserId();
  const data={name,startWeight:sw,height:h,goalWeight:gw,createdAt:firebase.firestore.FieldValue.serverTimestamp()};
  try {
    await userDoc(uid).set(data);
    currentUser={id:uid,...data};
    await loadDashboard();
  } catch(e) {
    console.error(e); err.textContent="Couldn't save. Check connection.";
    btn.disabled=false; btn.querySelector("span").textContent="Start tracking";
  }
});

// Dashboard
async function loadDashboard() {
  showScreen("dashboard-screen");
  renderProfile();
  await loadHistory();
  renderTodayForm();
  scheduleMidnightReset();
}

function renderProfile() {
  const u=currentUser;
  document.getElementById("profile-name").textContent=u.name;
  document.getElementById("avatar-circle").textContent=u.name.charAt(0).toUpperCase();
  const bmi=u.startWeight/((u.height/100)**2);
  document.getElementById("profile-meta").textContent=`${u.height} cm · BMI ${bmi.toFixed(1)} at start`;
  document.getElementById("stat-start").textContent=`${u.startWeight} kg`;
  document.getElementById("stat-goal").textContent=`${u.goalWeight} kg`;
}

async function loadHistory() {
  try {
    const snap=await entriesColl(currentUser.id).orderBy("date","desc").get();
    historyEntries=snap.docs.map(d=>d.data());
    renderHistoryStats(); renderHistoryTimeline();
  } catch(e){console.error("loadHistory:",e);}
}

function renderHistoryStats() {
  const u=currentUser;
  document.getElementById("stat-days").textContent=historyEntries.length;
  const latest=historyEntries.find(e=>e.weight);
  const cw=latest?latest.weight:u.startWeight;
  document.getElementById("stat-current").textContent=`${cw} kg`;
  const delta=cw-u.startWeight;
  const badge=document.getElementById("progress-badge");
  document.getElementById("badge-delta").textContent=`${delta>0?"+":""}${delta.toFixed(1)} kg`;
  badge.classList.remove("badge-loss","badge-gain","badge-neutral");
  badge.classList.add(delta<0?"badge-loss":delta>0?"badge-gain":"badge-neutral");
}

function renderHistoryTimeline() {
  const cont=document.getElementById("history-timeline");
  const today=todayKey();
  const past=historyEntries.filter(e=>e.date!==today);
  if(!past.length){
    cont.innerHTML=`<div class="empty-history"><svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="20" stroke="var(--text-muted)" stroke-width="1.5" fill="none" opacity="0.4"/><path d="M16 28 C16 28 18 20 24 20 C30 20 32 28 32 28" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.4"/></svg><p>No history yet. Your first saved entry will appear here after midnight.</p></div>`;
    return;
  }
  const asc=[...past].sort((a,b)=>a.date.localeCompare(b.date));
  const dayMap={};
  asc.forEach((e,i)=>{dayMap[e.date]=i+1;});
  cont.innerHTML=past.map((entry,idx)=>{
    const ai=asc.findIndex(e=>e.date===entry.date);
    const pw=ai>0?(asc[ai-1].weight??currentUser.startWeight):currentUser.startWeight;
    const delta=entry.weight!=null?entry.weight-pw:null;
    const ds=delta!=null?`<span class="entry-delta ${delta<0?"delta-down":delta>0?"delta-up":"delta-flat"}">${delta>0?"+":""}${delta.toFixed(1)} kg</span>`:"";
    const isFirst=idx===past.length-1;
    return `<div class="timeline-row"><div class="tl-left"><div class="tl-dot ${isFirst?"tl-dot-first":""}"></div>${isFirst?"":'<div class="tl-line"></div>'}</div><div class="tl-card"><div class="tl-card-header"><span class="tl-day">Day ${dayMap[entry.date]}</span><span class="tl-date">${formatDateKey(entry.date)}</span></div><div class="tl-card-body"><div class="tl-metric"><span class="tl-metric-label">Weight</span><span class="tl-metric-value">${entry.weight!=null?entry.weight+" kg":"—"} ${ds}</span></div><div class="tl-metric"><span class="tl-metric-label">Calories</span><span class="tl-metric-value">${entry.calories!=null?entry.calories.toLocaleString()+" kcal":"—"}</span></div></div></div></div>`;
  }).join("");
}

function renderTodayForm() {
  const today=todayKey();
  document.getElementById("today-date").textContent=formatDateKey(today);
  const te=historyEntries.find(e=>e.date===today);
  if(te){
    if(te.weight!=null)   document.getElementById("today-weight").value=te.weight;
    if(te.calories!=null) document.getElementById("today-calories").value=te.calories;
  }
}

document.getElementById("save-today-btn").addEventListener("click",async()=>{
  const w=parseFloat(document.getElementById("today-weight").value);
  const c=parseFloat(document.getElementById("today-calories").value);
  if(isNaN(w)&&isNaN(c)){showToast("Enter at least weight or calories.");return;}
  const today=todayKey();
  const btn=document.getElementById("save-today-btn"); btn.disabled=true;
  const ex=historyEntries.find(e=>e.date===today);
  const pastDates=historyEntries.map(e=>e.date).filter(d=>d<today);
  const dayNumber=ex?(ex.dayNumber||pastDates.length+1):pastDates.length+1;
  const data={date:today,weight:isNaN(w)?null:w,calories:isNaN(c)?null:c,dayNumber,savedAt:firebase.firestore.FieldValue.serverTimestamp()};
  try {
    await entryDoc(currentUser.id,today).set(data,{merge:true});
    const i=historyEntries.findIndex(e=>e.date===today);
    if(i>=0) historyEntries[i]={...historyEntries[i],...data};
    else historyEntries.unshift(data);
    renderHistoryStats(); renderHistoryTimeline();
    showToast("Saved!");
  } catch(e){console.error(e);showToast("Error saving. Try again.");}
  finally{btn.disabled=false;}
});

function showToast(msg) {
  const t=document.getElementById("save-toast");
  Array.from(t.childNodes).filter(n=>n.nodeType===3).forEach(n=>n.remove());
  t.appendChild(document.createTextNode(" "+msg));
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),2200);
}

function scheduleMidnightReset() {
  if(midnightTimer) clearTimeout(midnightTimer);
  midnightTimer=setTimeout(async()=>{ await loadHistory(); renderTodayForm(); scheduleMidnightReset(); },msUntilMidnight());
}

document.getElementById("logout-btn").addEventListener("click",()=>{
  if(!confirm("Sign out and clear local session?")) return;
  Session.del("leanlog_uid"); currentUser=null; historyEntries=[];
  if(midnightTimer) clearTimeout(midnightTimer);
  ["user-name","start-weight","start-height","goal-weight"].forEach(id=>{document.getElementById(id).value="";});
  document.getElementById("form-error").textContent="";
  showScreen("onboarding-screen");
});

// Boot — wait for full page load so all Firebase scripts are ready
window.addEventListener("load", runSplash);
