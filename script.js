    (() => {
      "use strict";
      const STORAGE_KEY = "aquaTrackerData";
      const DEFAULTS = {
        profile: null, currentIntake: 0, dailyGoal: 2500, goalAchieved: false,
        currentStreak: 0, notificationEnabled: true, reminderFrequency: 60,
        quietStart: "22:00", quietEnd: "08:00", theme: "light", history: {}
      };
      const TIPS = [
        "Keep a reusable bottle within reach. A visual reminder makes regular sipping easier.",
        "Drink a glass of water with meals to build hydration into your daily routine.",
        "Sip consistently throughout the day instead of trying to catch up all at once.",
        "After a walk or workout, remember to drink water to replace fluid loss.",
        "Start your morning with a glass of water and set a gentle rhythm for the day.",
        "Foods like cucumber, melon, and oranges can also contribute to your fluid intake.",
        "Try pairing a few sips of water with everyday transitions, like finishing a task."
      ];
      const BADGES = [
        { id:"first", icon:"💧", title:"First Day Hydrated", description:"Reach your daily water goal once.", unlocked:s=>s.goalDays.length>=1 },
        { id:"streak3", icon:"🔥", title:"3-Day Streak", description:"Reach your goal three days in a row.", unlocked:s=>s.longestStreak>=3 },
        { id:"streak7", icon:"🌟", title:"7-Day Streak", description:"Reach your goal seven days in a row.", unlocked:s=>s.longestStreak>=7 },
        { id:"streak14", icon:"🏅", title:"14-Day Streak", description:"Reach your goal fourteen days in a row.", unlocked:s=>s.longestStreak>=14 },
        { id:"streak30", icon:"👑", title:"30-Day Streak", description:"Reach your goal thirty days in a row.", unlocked:s=>s.longestStreak>=30 },
        { id:"master", icon:"🎯", title:"Goal Master", description:"Reach your daily goal on seven days.", unlocked:s=>s.goalDays.length>=7 },
        { id:"champion", icon:"🏆", title:"Hydration Champion", description:"Reach your daily goal on thirty days.", unlocked:s=>s.goalDays.length>=30 }
      ];
      let state = loadState();
      let currentPage = "dashboard";
      let toastTimer;
      let reminderTimer;
      let pendingConfirm = null;
      const $ = id => document.getElementById(id);
      const todayKey = () => dateKey(new Date());
      const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
      const formatNumber = value => Math.round(value).toLocaleString();
      const safeInt = value => Number.isSafeInteger(value) && value >= 0;

      function loadState() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (!raw) return structuredClone(DEFAULTS);
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Saved data is invalid.");
          const merged = { ...DEFAULTS, ...parsed, history: parsed.history && typeof parsed.history === "object" ? parsed.history : {} };
          if (merged.profile && (typeof merged.profile.name !== "string" || !Number.isFinite(merged.profile.weight))) merged.profile = null;
          if (!safeInt(merged.currentIntake)) merged.currentIntake = 0;
          if (!safeInt(merged.dailyGoal) || merged.dailyGoal < 1) merged.dailyGoal = 2500;
          return merged;
        } catch (error) {
          console.error("Could not load Aqua data:", error);
          try { localStorage.removeItem(STORAGE_KEY); } catch (removeError) { console.error("Could not clear invalid Aqua data:", removeError); }
          setTimeout(() => showToast("Saved data could not be read. A fresh profile is ready.", true), 0);
          return structuredClone(DEFAULTS);
        }
      }

      function saveState() {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          return true;
        } catch (error) {
          console.error("Could not save Aqua data:", error);
          showToast("Could not save data. Check this device's available storage.", true);
          return false;
        }
      }

      function showToast(message, isError=false) {
        const toast = $("toast");
        toast.textContent = message;
        toast.classList.toggle("error", isError);
        toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
      }

      function setPage(page) {
        if (page !== "onboarding" && !state.profile) page = "onboarding";
        currentPage = page;
        document.querySelectorAll(".page").forEach(section => section.classList.toggle("active", section.id === `${page}Page`));
        document.querySelectorAll(".nav-button").forEach(button => {
          const active = button.dataset.page === page;
          button.classList.toggle("active", active);
          if (active) button.setAttribute("aria-current","page"); else button.removeAttribute("aria-current");
        });
        $("bottomNav").hidden = page === "onboarding";
        if (page === "history") renderHistory();
        if (page === "analytics") renderAnalytics();
        if (page === "achievements") renderAchievements();
        if (page === "settings") renderSettings();
        window.scrollTo({top:0,behavior:"smooth"});
      }

      function render() {
        const today = todayKey();
        if (state.profile && state._activeDate !== today) {
          state._activeDate = today;
          state.currentIntake = state.history[today] ? state.history[today].intake : 0;
          state.goalAchieved = state.currentIntake >= state.dailyGoal;
          updateStreak();
          saveState();
        }
        $("headerDate").textContent = new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric"}).format(new Date());
        $("avatar").textContent = state.profile ? state.profile.name.trim().charAt(0).toUpperCase() : "A";
        document.documentElement.dataset.theme = state.theme === "dark" ? "dark" : "light";
        if (!state.profile) { setPage("onboarding"); return; }
        $("welcomeTitle").textContent = `Hello, ${state.profile.name.trim().split(/\s+/)[0]}`;
        $("welcomeSubtitle").textContent = state.goalAchieved ? "You reached your hydration goal today. Amazing!" : "Every sip brings you closer to your goal.";
        $("streakCount").textContent = `${state.currentStreak} ${state.currentStreak === 1 ? "day" : "day"} streak`;
        $("currentIntake").textContent = formatNumber(state.currentIntake);
        $("goalAmount").textContent = formatNumber(state.dailyGoal);
        const ratio = state.dailyGoal > 0 ? state.currentIntake / state.dailyGoal : 0;
        const percent = Math.round(ratio * 100);
        $("progressPercent").textContent = `${percent}%`;
        $("progressDescription").setAttribute("aria-label",`${percent}% of daily goal`);
        $("ringValue").style.strokeDashoffset = String(565.49 * (1 - Math.min(ratio,1)));
        $("progressFill").style.width = `${Math.min(ratio*100,100)}%`;
        $("remainingText").innerHTML = state.currentIntake >= state.dailyGoal
          ? "<b>Daily goal reached!</b>" : `<b>${formatNumber(state.dailyGoal-state.currentIntake)} ml</b> remaining`;
        $("dailyTip").textContent = TIPS[(Math.floor(Date.now()/86400000)+new Date().getTimezoneOffset()) % TIPS.length];
        $("historyDate").value = $("historyDate").value || today;
        renderWeekBars();
        if (currentPage === "history") renderHistory();
        if (currentPage === "analytics") renderAnalytics();
        if (currentPage === "achievements") renderAchievements();
        if (currentPage === "settings") renderSettings();
      }

      function updateStreak() {
        const goalDays = getGoalDays();
        let streak = 0;
        const cursor = new Date();
        if (!goalDays.includes(dateKey(cursor))) cursor.setDate(cursor.getDate()-1);
        while (goalDays.includes(dateKey(cursor)) && streak < 3660) {
          streak++;
          cursor.setDate(cursor.getDate()-1);
        }
        state.currentStreak = streak;
      }

      function getGoalDays() {
        return Object.entries(state.history)
          .filter(([key, record]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && record && Number(record.intake) >= Number(record.goal || state.dailyGoal))
          .map(([key]) => key).sort();
      }

      function getLongestStreak() {
        const days = getGoalDays();
        let longest=0, current=0, previous=null;
        days.forEach(key => {
          const day = new Date(`${key}T12:00:00`);
          if (previous) {
            const diff = Math.round((day-previous)/86400000);
            current = diff === 1 ? current+1 : 1;
          } else current=1;
          longest=Math.max(longest,current); previous=day;
        });
        return longest;
      }

      function recordToday() {
        const key = todayKey();
        const prior = state.history[key] || {};
        state.history[key] = { intake:state.currentIntake, goal:state.dailyGoal, updatedAt:new Date().toISOString(), ...prior, intake:state.currentIntake, goal:state.dailyGoal };
        state.goalAchieved = state.currentIntake >= state.dailyGoal;
        updateStreak();
        saveState();
        render();
      }

      function addWater(amount) {
        if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 10000) {
          showToast("Enter a whole amount from 1 to 10,000 ml.",true); return;
        }
        if (state.currentIntake > Number.MAX_SAFE_INTEGER-amount) {
          showToast("That amount is too large to add.",true); return;
        }
        const wasAchieved = state.goalAchieved;
        state.currentIntake += amount;
        recordToday();
        showToast(state.goalAchieved && !wasAchieved ? "Daily goal reached — fantastic work!" : `${formatNumber(amount)} ml added`);
      }

      function renderWeekBars() {
        const root = $("weekBars");
        const values = [];
        for (let offset=6;offset>=0;offset--) {
          const date=new Date(); date.setDate(date.getDate()-offset);
          const key=dateKey(date);
          const amount=key===todayKey()?state.currentIntake:(state.history[key]?.intake || 0);
          values.push({day:new Intl.DateTimeFormat(undefined,{weekday:"narrow"}).format(date),amount,today:offset===0});
        }
        root.innerHTML=values.map(item=>`<div class="week-bar-wrap" title="${formatNumber(item.amount)} ml"><div class="week-bar${item.today?" today":""}" style="height:${Math.max(4,Math.min(100,item.amount/Math.max(state.dailyGoal,1)*75))}%"></div><small>${escapeHtml(item.day)}</small></div>`).join("");
      }

      function dateRecord(key) {
        if (key===todayKey()) return {intake:state.currentIntake,goal:state.dailyGoal};
        return state.history[key] || {intake:0,goal:state.dailyGoal};
      }

      function getRangeKeys(anchorKey,range) {
        const anchor=new Date(`${anchorKey || todayKey()}T12:00:00`);
        if (Number.isNaN(anchor.getTime())) return [todayKey()];
        const count=range==="daily"?1:range==="weekly"?7:30;
        return Array.from({length:count},(_,index)=>{
          const day=new Date(anchor); day.setDate(anchor.getDate()-(count-1-index)); return dateKey(day);
        });
      }

      function renderHistory() {
        const range=$("historyRange").value;
        const anchor=$("historyDate").value || todayKey();
        const keys=getRangeKeys(anchor,range);
        const records=keys.map(key=>({key,...dateRecord(key)})).reverse();
        const total=records.reduce((sum,row)=>sum+Number(row.intake||0),0);
        const goals=records.filter(row=>Number(row.intake||0)>=Number(row.goal||state.dailyGoal)).length;
        $("historyTotal").innerHTML=`${formatNumber(total)} <span>ml</span>`;
        $("historyAverage").innerHTML=`${formatNumber(total/Math.max(1,records.length))} <span>ml</span>`;
        $("historyGoals").innerHTML=`${goals} <span>${goals===1?"day":"days"}</span>`;
        $("historyCaption").textContent=range==="daily"?"Selected day":range==="weekly"?"Selected day and previous 6 days":"Selected day and previous 29 days";
        const hasAny=records.some(row=>row.intake>0);
        if (!hasAny) {
          $("historyTable").innerHTML='<div class="empty-state"><div class="empty-icon">💧</div><strong>No intake logged in this period</strong><p style="margin-top:5px;font-size:12px">Add water from Home and your records will appear here.</p></div>';
          return;
        }
        $("historyTable").innerHTML=`<table><thead><tr><th>Date</th><th>Intake</th><th>Goal</th><th>Progress</th><th>Status</th></tr></thead><tbody>${records.map(row=>{
          const pct=Math.round(Number(row.intake||0)/Math.max(Number(row.goal)||state.dailyGoal,1)*100);
          const achieved=Number(row.intake||0)>=Number(row.goal||state.dailyGoal);
          return `<tr><td>${escapeHtml(new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric"}).format(new Date(`${row.key}T12:00:00`)))}</td><td><strong>${formatNumber(row.intake||0)} ml</strong></td><td>${formatNumber(row.goal||state.dailyGoal)} ml</td><td>${pct}%</td><td><span class="status-badge${achieved?"":" pending"}">${achieved?"Goal reached":"In progress"}</span></td></tr>`;
        }).join("")}</tbody></table>`;
      }

      function renderAnalytics() {
        const range=$("analyticsRange").value;
        const count=range==="weekly"?7:30;
        const keys=getRangeKeys(todayKey(),range);
        const amounts=keys.map(key=>Number(dateRecord(key).intake||0));
        const goalDays=getGoalDays().length;
        const total=amounts.reduce((sum,value)=>sum+value,0);
        $("analyticsAverage").innerHTML=`${formatNumber(total/count)} <span>ml</span>`;
        $("analyticsCompletion").innerHTML=`${Math.round(amounts.filter((amount,index)=>amount>=Number(dateRecord(keys[index]).goal||state.dailyGoal)).length/count*100)}<span>%</span>`;
        $("longestStreak").innerHTML=`${getLongestStreak()} <span>days</span>`;
        $("chartTitle").textContent=range==="weekly"?"Weekly intake trends":"Monthly intake trends";
        drawChart(amounts,keys.map(key=>new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric"}).format(new Date(`${key}T12:00:00`))));
      }

      function drawChart(values,labels) {
        const canvas=$("intakeChart"),rect=canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const ratio=window.devicePixelRatio||1;
        canvas.width=Math.round(rect.width*ratio); canvas.height=Math.round(rect.height*ratio);
        const ctx=canvas.getContext("2d");
        ctx.scale(ratio,ratio);
        const width=rect.width,height=rect.height;
        const css=getComputedStyle(document.documentElement);
        const muted=css.getPropertyValue("--muted").trim();
        const line=css.getPropertyValue("--line").trim();
        const blue=css.getPropertyValue("--blue").trim();
        const pad={left:43,right:10,top:12,bottom:29};
        const plotW=width-pad.left-pad.right,plotH=height-pad.top-pad.bottom;
        const maxValue=Math.max(state.dailyGoal,...values,500);
        const scale=Math.ceil(maxValue/4/250)*250 || 250;
        const max=scale*4;
        ctx.font="10px system-ui";ctx.textAlign="right";ctx.textBaseline="middle";
        for(let i=0;i<=4;i++){
          const y=pad.top+plotH-(i/4)*plotH;
          ctx.strokeStyle=line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(width-pad.right,y);ctx.stroke();
          ctx.fillStyle=muted;ctx.fillText(i===0?"0":`${(max*i/4/1000).toFixed(max*i/4%1000?1:0)}k`,pad.left-8,y);
        }
        const goalY=pad.top+plotH-(state.dailyGoal/max)*plotH;
        ctx.save();ctx.setLineDash([5,4]);ctx.strokeStyle="#9fb8c0";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(pad.left,goalY);ctx.lineTo(width-pad.right,goalY);ctx.stroke();ctx.restore();
        const step=plotW/Math.max(1,values.length);
        const barW=Math.max(2,Math.min(21,step*.56));
        values.forEach((value,index)=>{
          const barH=Math.max(value>0?2:0,value/max*plotH);
          const x=pad.left+index*step+(step-barW)/2;
          const y=pad.top+plotH-barH;
          ctx.fillStyle=blue;ctx.beginPath();
          if(ctx.roundRect) ctx.roundRect(x,y,barW,barH,[4,4,0,0]); else ctx.rect(x,y,barW,barH);
          ctx.fill();
        });
        ctx.fillStyle=muted;ctx.textAlign="center";ctx.textBaseline="top";
        const labelEvery=values.length<=7?1:5;
        labels.forEach((label,index)=>{
          if(index%labelEvery===0 || index===labels.length-1) ctx.fillText(label,pad.left+index*step+step/2,pad.top+plotH+8);
        });
      }

      function renderAchievements() {
        const stats={goalDays:getGoalDays(),longestStreak:getLongestStreak()};
        const unlockedCount=BADGES.filter(badge=>badge.unlocked(stats)).length;
        $("badgeSummary").textContent=`${unlockedCount} of ${BADGES.length} unlocked`;
        $("achievementsGrid").innerHTML=BADGES.map(badge=>{
          const unlocked=badge.unlocked(stats);
          return `<article class="card badge-card${unlocked?"":" locked"}"><div class="badge-icon" aria-hidden="true">${badge.icon}</div><div><h3>${badge.title}</h3><p>${badge.description}</p><div class="badge-status">${unlocked?"Unlocked":"Locked"}</div></div></article>`;
        }).join("");
      }

      function renderSettings() {
        if(!state.profile) return;
        $("settingsName").textContent=state.profile.name;
        $("settingsDetails").textContent=`${state.profile.age} years · ${formatNumber(state.profile.height)} cm · ${formatNumber(state.profile.weight)} kg`;
        $("settingsGoal").textContent=`${formatNumber(state.dailyGoal)} ml`;
        $("darkModeToggle").checked=state.theme==="dark";
        $("notificationToggle").checked=Boolean(state.notificationEnabled);
        $("reminderFrequency").value=String(state.reminderFrequency);
        $("quietStart").value=state.quietStart;
        $("quietEnd").value=state.quietEnd;
      }

      function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
      }

      function validateProfile(form) {
        const values={
          name:form.elements.name.value.trim(),
          age:Number(form.elements.age.value),
          height:Number(form.elements.height.value),
          weight:Number(form.elements.weight.value)
        };
        const errors={
          name:!values.name?"Please enter your name.":"",
          age:!Number.isInteger(values.age)||values.age<1||values.age>120?"Age must be a whole number from 1 to 120.":"",
          height:!Number.isFinite(values.height)||values.height<50||values.height>250?"Height must be between 50 and 250 cm.":"",
          weight:!Number.isFinite(values.weight)||values.weight<10||values.weight>300?"Weight must be between 10 and 300 kg.":""
        };
        Object.entries(errors).forEach(([key,message])=>{
          const input=form.elements[key],error=$(key==="name"?"nameError":`${key}Error`);
          input.setAttribute("aria-invalid",message?"true":"false");error.textContent=message;
        });
        return Object.values(errors).every(message=>!message)?values:null;
      }

      function setFormValues(profile) {
        $("profileName").value=profile.name;
        $("profileAge").value=profile.age;
        $("profileHeight").value=profile.height;
        $("profileWeight").value=profile.weight;
        ["name","age","height","weight"].forEach(key=>$(key==="name"?"nameError":`${key}Error`).textContent="");
      }

      function submitProfile(event) {
        event.preventDefault();
        const form=event.currentTarget;
        const values=validateProfile(form);
        if(!values) { showToast("Please check the highlighted profile fields.",true);return; }
        form.classList.add("loading");
        $("profileSubmit").disabled=true;
        setTimeout(()=>{
          const priorGoal=state.dailyGoal;
          const goal=Math.round(values.weight*35);
          state.profile=values;state.dailyGoal=goal;
          if(!state._activeDate) state.currentIntake=0;
          state._activeDate=todayKey();
          if(state.history[todayKey()]) state.currentIntake=Number(state.history[todayKey()].intake)||0;
          if(priorGoal!==goal && state.history[todayKey()]) state.history[todayKey()].goal=goal;
          recordToday();
          form.classList.remove("loading");$("profileSubmit").disabled=false;
          setPage("dashboard");showToast("Profile saved. Your daily goal is ready!");
        },180);
      }

      function showCustomModal() {
        $("customAmount").value="";$("customError").textContent="";$("customAmount").removeAttribute("aria-invalid");
        $("customModal").classList.add("open");setTimeout(()=>$("customAmount").focus(),0);
      }

      function closeModal(id) { $(id).classList.remove("open"); }

      function showConfirm(message,action,acceptLabel="Continue") {
        $("confirmMessage").textContent=message;$("confirmAccept").textContent=acceptLabel;
        pendingConfirm=action;$("confirmModal").classList.add("open");$("confirmAccept").focus();
      }

      function exportData() {
        const data={...state,exportedAt:new Date().toISOString(),app:"Aqua"};
        try {
          const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
          const url=URL.createObjectURL(blob);
          const link=document.createElement("a");link.href=url;link.download=`aqua-data-${todayKey()}.json`;
          document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
          showToast("Your Aqua data export is ready.");
        } catch(error) {
          console.error("Could not export Aqua data:",error);showToast("Could not export data on this device.",true);
        }
      }

      function resetAllData() {
        try { localStorage.removeItem(STORAGE_KEY); }
        catch(error) { console.error("Could not clear Aqua data:",error);showToast("Could not clear saved data.",true);return; }
        state=structuredClone(DEFAULTS);clearInterval(reminderTimer);render();setPage("onboarding");showToast("Aqua data has been reset.");
      }

      function isQuietTime() {
        const start=state.quietStart,end=state.quietEnd;
        if(!start||!end||start===end) return false;
        const now=new Date(),current=now.getHours()*60+now.getMinutes();
        const [sh,sm]=start.split(":").map(Number),[eh,em]=end.split(":").map(Number);
        const startMinute=sh*60+sm,endMinute=eh*60+em;
        return startMinute<endMinute ? current>=startMinute&&current<endMinute : current>=startMinute||current<endMinute;
      }

      async function enableReminders(enabled) {
        if(!enabled) {
          state.notificationEnabled=false;saveState();clearInterval(reminderTimer);renderSettings();showToast("Hydration reminders are off.");return;
        }
        if(!("Notification" in window)) {
          state.notificationEnabled=false;saveState();renderSettings();showToast("This browser does not support notifications.",true);return;
        }
        try {
          const permission=Notification.permission==="granted"? "granted" : await Notification.requestPermission();
          if(permission!=="granted") {
            state.notificationEnabled=false;saveState();renderSettings();showToast("Notification permission was not granted.",true);return;
          }
          state.notificationEnabled=true;saveState();scheduleReminders();renderSettings();showToast("Reminders enabled while Aqua is open.");
        } catch(error) {
          console.error("Could not enable reminders:",error);state.notificationEnabled=false;saveState();renderSettings();showToast("Could not enable notifications in this browser.",true);
        }
      }

      function scheduleReminders() {
        clearInterval(reminderTimer);
        if(!state.notificationEnabled || !("Notification" in window) || Notification.permission!=="granted") return;
        const interval=Math.max(30,Number(state.reminderFrequency)||60)*60*1000;
        reminderTimer=setInterval(()=>{
          if(document.visibilityState!=="visible" || isQuietTime() || state.currentIntake>=state.dailyGoal) return;
          try {
            new Notification("Aqua hydration reminder",{body:"Take a moment for a sip of water. Every little bit counts.",tag:"aqua-hydration"});
          } catch(error) { console.error("Could not display hydration reminder:",error); }
        },interval);
      }

      document.querySelectorAll(".nav-button").forEach(button=>button.addEventListener("click",()=>setPage(button.dataset.page)));
      document.querySelectorAll("[data-go]").forEach(button=>button.addEventListener("click",()=>setPage(button.dataset.go)));
      document.querySelectorAll("[data-add]").forEach(button=>button.addEventListener("click",()=>addWater(Number(button.dataset.add))));
      document.addEventListener("click",event=>{
        const button=event.target.closest("button");
        if(!button || button.disabled) return;
        const rect=button.getBoundingClientRect(),size=Math.max(rect.width,rect.height);
        const ripple=document.createElement("span");ripple.className="ripple";ripple.style.width=ripple.style.height=`${size}px`;
        ripple.style.left=`${event.clientX-rect.left-size/2}px`;ripple.style.top=`${event.clientY-rect.top-size/2}px`;
        button.appendChild(ripple);setTimeout(()=>ripple.remove(),550);
      });
      $("profileForm").addEventListener("submit",submitProfile);
      $("customAmountButton").addEventListener("click",showCustomModal);
      $("cancelCustom").addEventListener("click",()=>closeModal("customModal"));
      $("customModal").addEventListener("click",event=>{if(event.target===$("customModal"))closeModal("customModal");});
      $("customForm").addEventListener("submit",event=>{
        event.preventDefault();
        const input=$("customAmount"),amount=Number(input.value),message=!Number.isInteger(amount)||amount<1||amount>10000?"Enter a whole amount from 1 to 10,000 ml.":"";
        $("customError").textContent=message;input.setAttribute("aria-invalid",message?"true":"false");
        if(message){input.focus();return;}
        closeModal("customModal");addWater(amount);
      });
      $("profileName").addEventListener("input",()=>{$("nameError").textContent="";});
      $("profileAge").addEventListener("input",()=>{$("ageError").textContent="";});
      $("profileHeight").addEventListener("input",()=>{$("heightError").textContent="";});
      $("profileWeight").addEventListener("input",()=>{$("weightError").textContent="";});
      $("resetDayButton").addEventListener("click",()=>showConfirm("This will clear today's logged intake. Your previous day records and profile will stay saved.",()=>{
        state.currentIntake=0;recordToday();showToast("Today's intake has been reset.");
      },"Reset today"));
      $("historyRange").addEventListener("change",renderHistory);
      $("historyDate").addEventListener("change",renderHistory);
      $("analyticsRange").addEventListener("change",renderAnalytics);
      $("editProfileButton").addEventListener("click",()=>{
        setFormValues(state.profile);$("onboardingTitle").textContent="Edit your profile";
        $("profileSubmit").textContent="Save profile";setPage("onboarding");
      });
      $("profileForm").addEventListener("submit",()=>{
        if(state.profile) setTimeout(()=>{$("onboardingTitle").textContent="Meet your water goals";$("profileSubmit").textContent="Create Profile";},250);
      });
      $("darkModeToggle").addEventListener("change",event=>{
        state.theme=event.target.checked?"dark":"light";document.documentElement.dataset.theme=state.theme;saveState();showToast(`${event.target.checked?"Dark":"Light"} mode enabled.`);
        if(currentPage==="analytics")renderAnalytics();
      });
      $("notificationToggle").addEventListener("change",event=>enableReminders(event.target.checked));
      $("reminderFrequency").addEventListener("change",event=>{
        state.reminderFrequency=Number(event.target.value);saveState();scheduleReminders();showToast("Reminder frequency updated.");
      });
      $("quietStart").addEventListener("change",event=>{state.quietStart=event.target.value;saveState();showToast("Quiet hours updated.");});
      $("quietEnd").addEventListener("change",event=>{state.quietEnd=event.target.value;saveState();showToast("Quiet hours updated.");});
      $("exportButton").addEventListener("click",exportData);
      $("resetDataButton").addEventListener("click",()=>showConfirm("This permanently removes your profile, intake history, achievements, and settings from this browser.",resetAllData,"Reset all data"));
      $("confirmCancel").addEventListener("click",()=>{closeModal("confirmModal");pendingConfirm=null;});
      $("confirmAccept").addEventListener("click",()=>{
        const action=pendingConfirm;pendingConfirm=null;closeModal("confirmModal");
        if(typeof action==="function")action();
      });
      $("confirmModal").addEventListener("click",event=>{if(event.target===$("confirmModal")){closeModal("confirmModal");pendingConfirm=null;}});
      document.addEventListener("keydown",event=>{
        if(event.key==="Escape"){closeModal("customModal");closeModal("confirmModal");pendingConfirm=null;}
      });
      window.addEventListener("resize",()=>{if(currentPage==="analytics")renderAnalytics();});
      document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){render();scheduleReminders();}});
      window.addEventListener("storage",event=>{
        if(event.key===STORAGE_KEY){state=loadState();render();if(state.profile)setPage(currentPage);}
      });
      if(state.profile && !state._activeDate) {
        state._activeDate=todayKey();
        state.currentIntake=Number(state.history[todayKey()]?.intake)||0;
      }
      updateStreak();render();scheduleReminders();
    })();
