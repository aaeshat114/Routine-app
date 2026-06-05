// ==========================================
// 1. IndexedDB Persistence Layer
// ==========================================
const DB_NAME = 'KidsRoutineDB';
const DB_VERSION = 1;
const PRELOADED_IMAGES = [
  './assets/images/task1.png',
  './assets/images/task2.png',
  './assets/images/task3.png',
  './assets/images/task4.png',
  './assets/images/task5.png',
  './assets/images/task6.png',
  './assets/images/task7.png',
  './assets/images/task8.png',
  './assets/images/task9.png',
  './assets/images/task10.png',
  './assets/images/task11.png',
  './assets/images/task12.png',
  './assets/images/task13.png',
  './assets/images/task14.png',
  './assets/images/task15.png',
  './assets/images/task16.png',
  './assets/images/task17.png',
  './assets/images/task18.png',
  './assets/images/task19.png',
  './assets/images/task20.png',
];
let currentTaskImageIndex = null;
let db;

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('routines')) db.createObjectStore('routines', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state', { keyPath: 'id' });
    };
    request.onsuccess = (e) => { db = e.target.result; resolve(); };
    request.onerror = (e) => reject(e);
  });
}

function dbPut(storeName, data) {
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(data);
    tx.oncomplete = () => resolve();
  });
}

function dbGetAll(storeName) {
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

function dbDelete(storeName, id) {
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve();
  });
}

// ==========================================
// 2. Audio Engine (Spatial Panning & State)
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let globalBGM = null;
let bgmType = 'standard'; 
let activeSfxCount = 0;

const bgmGainNode = audioCtx.createGain();
bgmGainNode.connect(audioCtx.destination);

const AUDIO_PATHS = {
  standard: 'assets/audio/bgm-standard.mp3',
  urgent: 'assets/audio/bgm-urgent.mp3',
  complete: 'assets/audio/sfx-complete.mp3',
  warning: 'assets/audio/sfx-warning.mp3',
  victory: 'assets/audio/sfx-victory.mp3'
};
const audioBuffers = {};

async function loadAudio() {
  for (const [key, path] of Object.entries(AUDIO_PATHS)) {
    try {
      const res = await fetch(path);
      const arrayBuffer = await res.arrayBuffer();
      audioBuffers[key] = await audioCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.warn(`Audio file missing, proceeding without: ${path}`);
    }
  }
}

function playBGM(type) {
  if (bgmType === type && globalBGM) return;
  if (globalBGM) globalBGM.stop();
  if (!audioBuffers[type]) return;
  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffers[type];
  source.loop = true;
  source.connect(bgmGainNode);
  source.start(0);
  globalBGM = source;
  bgmType = type;
  
  bgmGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
  bgmGainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);
}

function stopBGM() {
  if (globalBGM) { globalBGM.stop(); globalBGM = null; }
}

function playSFX(type, panValue = 0) {
  if (!audioBuffers[type]) return;
  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffers[type];
  
  if (audioCtx.createStereoPanner) {
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = panValue;
    source.connect(panner);
    panner.connect(audioCtx.destination);
  } else {
    source.connect(audioCtx.destination);
  }

  if (globalBGM) {
    activeSfxCount++;
    const t = audioCtx.currentTime;
    bgmGainNode.gain.cancelScheduledValues(t);
    bgmGainNode.gain.linearRampToValueAtTime(0.2, t + 0.1); 

    source.onended = () => {
      activeSfxCount--;
      if (activeSfxCount <= 0) {
        activeSfxCount = 0; 
        const endTime = audioCtx.currentTime;
        bgmGainNode.gain.cancelScheduledValues(endTime);
        
        const holdDuration = 1.0; 
        const fadeDuration = 0.5; 

        bgmGainNode.gain.setValueAtTime(0.2, endTime + holdDuration); 
        bgmGainNode.gain.linearRampToValueAtTime(1.0, endTime + holdDuration + fadeDuration); 
      }
    };
  }

  source.start(0);
}

// ==========================================
// 3. Application State & Navigation
// ==========================================
let currentMode = 'kids'; 
let activeInstances = []; 
let profiles = [];
let routines = [];
let selectedKidsForRoutine = [];
let pendingRoutineId = null;

const UI = {
  kidsHub: document.getElementById('view-kids-hub'),
  activeRoutine: document.getElementById('view-active-routine'),
  parentDash: document.getElementById('view-parent-dash'),
  routineBuilder: document.getElementById('view-routine-builder'),
  navToggle: document.getElementById('global-nav-toggle')
};

async function initApp() {
  await initDB();
  await loadAudio();
  profiles = await dbGetAll('profiles');
  routines = await dbGetAll('routines');
  const session = await dbGetAll('state');
  if (session.length > 0 && session[0].instances.length > 0) {
    document.getElementById('modal-recovery').classList.remove('hidden');
    window.recoveredState = session[0].instances;
  } else {
    if (profiles.length === 0) switchView('parentDash');
    else renderKidsHub();
  }
  
  setupEventListeners();
}

function updatePWAThemeColor() {
  const metaTag = document.getElementById('pwa-theme-color');
  if (metaTag) {
    // Find the currently active view that is not hidden
    const activeEl = Object.values(UI).find(el => el && !el.classList.contains('hidden'));
    if (activeEl) {
      // Check for a nested partition first, otherwise measure the view container itself
      const partition = activeEl.querySelector('.partition');
      const elementToMeasure = partition || activeEl;
      const computedBg = window.getComputedStyle(elementToMeasure).backgroundColor;
      metaTag.setAttribute('content', computedBg);
    }
  }
}

function switchView(viewName) {
  Object.values(UI).forEach(el => { if (el) el.classList.add('hidden'); });
  let activeEl = null;

  if (viewName === 'kidsHub') { 
    UI.kidsHub.classList.remove('hidden'); 
    currentMode = 'kids'; 
    UI.navToggle.style.display = 'block'; 
    UI.navToggle.className = 'nav-toggle kids-mode';
    activeEl = UI.kidsHub;
  }
  if (viewName === 'parentDash') { 
    UI.parentDash.classList.remove('hidden'); 
    currentMode = 'parent'; 
    renderParentDash(); 
    UI.navToggle.style.display = 'block';
    UI.navToggle.className = 'nav-toggle parent-mode';
    activeEl = UI.parentDash;
  }
  if (viewName === 'activeRoutine') { 
    UI.activeRoutine.classList.remove('hidden'); 
    UI.navToggle.style.display = 'none';
    activeEl = UI.activeRoutine;
  }
  if (viewName === 'routineBuilder') { 
    UI.routineBuilder.classList.remove('hidden'); 
    UI.navToggle.style.display = 'none';
    activeEl = UI.routineBuilder;
  }
  
  requestAnimationFrame(updatePWAThemeColor);
}

UI.navToggle.addEventListener('click', () => {
  if (currentMode === 'kids') {
    generateGate();
    document.getElementById('modal-gate').classList.remove('hidden');
  } else {
    switchView('kidsHub');
  }
});

// ==========================================
// 4. Parent Gate (Prime Number Logic)
// ==========================================
function isPrime(num) {
  for(let i = 2, s = Math.sqrt(num); i <= s; i++) if(num % i === 0) return false;
  return num > 1;
}

function generateGate() {
  const grid = document.getElementById('gate-grid');
  grid.innerHTML = '';
  const primes = [11, 13, 17, 19, 23, 29, 31, 37, 41, 43];
  const nonPrimes = [9, 12, 14, 15, 16, 18, 20, 21, 22, 24, 25, 26, 27, 28];
  const targetPrime = primes[Math.floor(Math.random() * primes.length)];
  let options = [targetPrime];
  while(options.length < 9) {
    const np = nonPrimes[Math.floor(Math.random() * nonPrimes.length)];
    if (!options.includes(np)) options.push(np);
  }
  options.sort(() => Math.random() - 0.5);
  
  options.forEach(num => {
    const btn = document.createElement('button');
    btn.textContent = num;
    btn.onclick = () => {
      if (num === targetPrime) {
        document.getElementById('modal-gate').classList.add('hidden');
        switchView('parentDash');
      } else {
        generateGate(); 
      }
    };
    grid.appendChild(btn);
  });
}

// ==========================================
// 5. Parent Dashboard & Builder
// ==========================================
async function renderParentDash() {
  const pList = document.getElementById('profile-list');
  pList.innerHTML = '';
  profiles.forEach(p => {
    const div = document.createElement('div');
    div.innerHTML = `${p.name} <button onclick="deleteProfile('${p.id}')">Del</button>`;
    pList.appendChild(div);
  });
  const rList = document.getElementById('parent-routine-list');
  rList.innerHTML = '';
  routines.forEach(r => {
    const div = document.createElement('div');
    div.innerHTML = `${r.name} 
      <button onclick="editRoutine('${r.id}')">Edit</button> 
      <button onclick="deleteRoutine('${r.id}')">Del</button>`;
    rList.appendChild(div);
  });
}

document.getElementById('btn-add-profile').onclick = async () => {
  const name = document.getElementById('new-profile-name').value;
  if (!name) return;
  const newProfile = { id: Date.now().toString(), name };
  await dbPut('profiles', newProfile);
  profiles.push(newProfile);
  document.getElementById('new-profile-name').value = '';
  renderParentDash();
};

window.deleteProfile = async (id) => { await dbDelete('profiles', id); profiles = profiles.filter(p => p.id !== id); renderParentDash(); };
window.deleteRoutine = async (id) => { 
  window.customConfirm("Delete Routine?", async () => {
    await dbDelete('routines', id); routines = routines.filter(r => r.id !== id); renderParentDash(); 
  });
};

let currentEditingRoutine = null;
document.getElementById('btn-new-routine').onclick = () => {
  currentEditingRoutine = { id: Date.now().toString(), name: '', tasks: [] };
  renderBuilder();
  switchView('routineBuilder');
};

window.editRoutine = (id) => {
  currentEditingRoutine = JSON.parse(JSON.stringify(routines.find(r => r.id === id)));
  renderBuilder();
  switchView('routineBuilder');
};

function renderBuilder() {
  document.getElementById('builder-routine-name').value = currentEditingRoutine.name;
  const tList = document.getElementById('builder-task-list');
  tList.innerHTML = '';
  currentEditingRoutine.tasks.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'panel';
    const imgName = t.img ? t.img.split('/').pop() : 'No image';
    div.innerHTML = `
      <input type="text" value="${t.name}" onchange="currentEditingRoutine.tasks[${i}].name = this.value" placeholder="Task Name">
      <input type="number" value="${t.minTime}" onchange="currentEditingRoutine.tasks[${i}].minTime = parseInt(this.value)" placeholder="Min Time (sec)">
      <input type="number" value="${t.maxTime}" onchange="currentEditingRoutine.tasks[${i}].maxTime = parseInt(this.value)" placeholder="Max Time (sec)">
      <select onchange="currentEditingRoutine.tasks[${i}].skipBehavior = this.value">
        <option value="none" ${t.skipBehavior === 'none' ? 'selected' : ''}>Cannot Skip</option>
        <option value="skip" ${t.skipBehavior === 'skip' ? 'selected' : ''}>Skip Completely</option>
        <option value="defer" ${t.skipBehavior === 'defer' ? 'selected' : ''}>Skip & Defer</option>
      </select>
      <div style="margin: 10px 0;">
        <button class="btn-choose-img" onclick="openImagePicker(${i})">Choose Image</button>
        <span class="task-img-label">${imgName}</span>
      </div>
      <button onclick="moveTask(${i}, -1)">Up</button>
      <button onclick="moveTask(${i}, 1)">Down</button>
      <button onclick="removeTask(${i})">Del</button>
    `;
    tList.appendChild(div);
  });
}

window.openImagePicker = (index) => {
  currentTaskImageIndex = index;
  const grid = document.getElementById('image-picker-grid');
  grid.innerHTML = '';
  PRELOADED_IMAGES.forEach(src => {
    const img = document.createElement('img');
    img.src = src;
    img.className = 'image-option';
    img.onclick = () => {
      currentEditingRoutine.tasks[currentTaskImageIndex].img = src;
      document.getElementById('modal-image-picker').classList.add('hidden');
      renderBuilder();
    };
    grid.appendChild(img);
  });
  document.getElementById('modal-image-picker').classList.remove('hidden');
};

document.getElementById('btn-add-task').onclick = () => {
  currentEditingRoutine.tasks.push({ name: 'New Task', minTime: 0, maxTime: 0, skipBehavior: 'none', img: '' });
  renderBuilder();
};

window.moveTask = (index, dir) => {
  if (index + dir < 0 || index + dir >= currentEditingRoutine.tasks.length) return;
  const temp = currentEditingRoutine.tasks[index];
  currentEditingRoutine.tasks[index] = currentEditingRoutine.tasks[index + dir];
  currentEditingRoutine.tasks[index + dir] = temp;
  renderBuilder();
};

window.removeTask = (index) => { currentEditingRoutine.tasks.splice(index, 1); renderBuilder(); };

document.getElementById('btn-save-routine').onclick = async () => {
  currentEditingRoutine.name = document.getElementById('builder-routine-name').value || 'Unnamed Routine';
  await dbPut('routines', currentEditingRoutine);
  const existingIdx = routines.findIndex(r => r.id === currentEditingRoutine.id);
  if (existingIdx >= 0) routines[existingIdx] = currentEditingRoutine;
  else routines.push(currentEditingRoutine);
  switchView('parentDash');
};

// ==========================================
// 6. Kids Hub & Modal Management
// ==========================================
function renderKidsHub() {
  const grid = document.getElementById('kids-routine-grid');
  grid.innerHTML = '';
  routines.forEach(r => {
    const card = document.createElement('div');
    card.className = 'routine-card';
    card.textContent = r.name; // Displays the routine name on the card
    card.onclick = () => handleRoutineClick(r.id);
    grid.appendChild(card);
  });
  switchView('kidsHub');
}

function handleRoutineClick(rId) {
  pendingRoutineId = rId;
  if (profiles.length === 1) {
    selectedKidsForRoutine = [profiles[0]];
    startRoutineExecution();
  } else {
    selectedKidsForRoutine = [];
    const list = document.getElementById('participant-list');
    list.innerHTML = '';
    profiles.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'kid-btn';
      btn.textContent = p.name;
      btn.onclick = () => {
        if (selectedKidsForRoutine.includes(p)) {
          selectedKidsForRoutine = selectedKidsForRoutine.filter(k => k !== p);
          btn.style.opacity = '0.5';
        } else if (selectedKidsForRoutine.length < 2) {
          selectedKidsForRoutine.push(p);
          btn.style.opacity = '1';
        }
      };
      list.appendChild(btn);
    });
    document.getElementById('modal-participant').classList.remove('hidden');
  }
}

document.getElementById('btn-start-routine').onclick = () => {
  if (selectedKidsForRoutine.length > 0) {
    document.getElementById('modal-participant').classList.add('hidden');
    startRoutineExecution();
  }
};

document.querySelectorAll('.close-modal').forEach(btn => {
  btn.onclick = (e) => e.target.closest('.modal').classList.add('hidden');
});

window.customConfirm = (msg, onYes) => {
  const modal = document.getElementById('modal-confirm');
  document.getElementById('confirm-title').textContent = msg;
  modal.classList.remove('hidden');
  document.getElementById('btn-confirm-yes').onclick = () => { modal.classList.add('hidden'); onYes(); };
  document.getElementById('btn-confirm-no').onclick = () => { modal.classList.add('hidden'); };
};

// Failsafe empty setup if your project structure references this function externally
function setupEventListeners() {}

// ==========================================
// 7. Routine Execution (The Core Engine)
// ==========================================
class RoutineInstance {
  constructor(profile, routineData, panSide) {
    this.profile = profile;
    this.routine = JSON.parse(JSON.stringify(routineData));
    this.panSide = panSide; 
    this.queue = [...this.routine.tasks];
    this.currentTask = null;
    this.elapsed = 0;
    this.isPaused = false;
    this.isOvertime = false;
    this.intervalId = null;
    this.chimeIntervalId = null;
    this.container = document.createElement('div');
    this.container.className = 'partition';
    this.advanceTask();
  }

  advanceTask() {
    this.cleanup();
    if (this.queue.length === 0) { this.completeRoutine(); return; }
    
    this.currentTask = this.queue.shift();
    this.elapsed = 0;
    this.isOvertime = false;
    this.renderTask();
    this.intervalId = setInterval(() => this.tick(), 1000);
    evaluateGlobalAudio();
  }

  tick() {
    if (this.isPaused) return;
    this.elapsed++;
    this.updateUI();
    if (this.currentTask.maxTime > 0 && this.elapsed >= this.currentTask.maxTime && !this.isOvertime) {
      this.isOvertime = true;
      const btnFinish = this.container.querySelector('.btn-finish');
      if (btnFinish) btnFinish.classList.add('overtime');
      
      this.chimeIntervalId = setInterval(() => {
        if (!this.isPaused) playSFX('warning', this.panSide);
      }, 30000);
      if (!this.isPaused) playSFX('warning', this.panSide);
      evaluateGlobalAudio();
    }
    saveSessionState();
  }

    updateUI() {
    const btnFinish = this.container.querySelector('.btn-finish');
    if (this.currentTask.minTime > 0) {
      if (this.elapsed >= this.currentTask.minTime) {
        if(btnFinish) btnFinish.style.visibility = 'visible';
      } else {
        if(btnFinish) btnFinish.style.visibility = 'hidden';
      }
    }
    
    const fill = this.container.querySelector('.timer-fill');
    if (fill && this.currentTask.maxTime > 0) {
      const pct = Math.min((this.elapsed / this.currentTask.maxTime) * 100, 100);
      fill.style.width = `${pct}%`;
      if (pct > 90) fill.style.background = '#ff1744';
    }
  }

  renderTask() {
    if (this.currentTask.img) {
      this.container.style.backgroundImage = 'none'; 
      
      const palette = ['#9edbf7', '#8e66bc', '#dd3938', '#fae588', '#1d4177', '#de8a45', '#c3e8b2', '#60bba9'];
      const img = new Image();
      img.src = this.currentTask.img;
      img.onload = () => {
        const cvs = document.createElement('canvas');
        cvs.width = img.width;
        cvs.height = img.height;
        const ctx = cvs.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const [r, g, b] = ctx.getImageData(img.width - 5, 5, 1, 1).data;
        let closest = palette[0], minD = Infinity;
        palette.forEach(hex => {
          const d = Math.pow(r - parseInt(hex.slice(1,3),16), 2) + 
                    Math.pow(g - parseInt(hex.slice(3,5),16), 2) + 
                    Math.pow(b - parseInt(hex.slice(5,7),16), 2);
          if (d < minD) { minD = d; closest = hex; }
        });
        this.container.style.backgroundColor = closest;
        
        requestAnimationFrame(updatePWAThemeColor);
      };
    } else {
      this.container.style.backgroundImage = 'none';
      this.container.style.backgroundColor = 'transparent';

      requestAnimationFrame(updatePWAThemeColor);
    }

            this.container.innerHTML = `
      <div class="partition-top">
        <div class="header-bar">${this.currentTask.name}</div>
        ${this.currentTask.maxTime > 0 ?
`<div class="timer-bar"><div class="timer-fill" style="width:0%"></div></div>` : ''}
      </div>
      <div class="partition-body-combined">
        <div class="partition-middle">
          ${this.currentTask.img ?
`<img src="${this.currentTask.img}" class="task-display-image" alt="Task Graphic">` : ''}
        </div>
        <div class="partition-controls">
          <button class="kid-btn btn-finish" ${this.currentTask.minTime > 0 ?
'style="visibility: hidden;"' : ''}>Finish</button>
          <button class="kid-btn btn-pause">Pause</button>
          <div class="kid-name-display">${this.profile.name}</div>
          <button class="kid-btn tilted btn-skip" ${this.currentTask.skipBehavior === 'none' ?
'disabled' : ''}>Skip</button>
          <button class="kid-btn btn-exit">Exit</button>
        </div>
      </div>
    `;

    this.container.querySelector('.btn-finish').onclick = () => {
      if (this.queue.length > 0) {
        playSFX('complete', this.panSide);
      }
      this.advanceTask();
    };

    const skipBtn = this.container.querySelector('.btn-skip');
    if (skipBtn && this.currentTask.skipBehavior !== 'none') {
      skipBtn.onclick = () => {
        window.customConfirm(`Skip ${this.currentTask.name}?`, () => {
          if (this.currentTask.skipBehavior === 'defer') this.queue.push(this.currentTask);
          this.advanceTask();
        });
      };
    }

    this.container.querySelector('.btn-pause').onclick = (e) => {
      this.isPaused = !this.isPaused;
      e.target.textContent = this.isPaused ? 'Resume' : 'Pause';
      evaluateGlobalAudio(); 
    };

    this.container.querySelector('.btn-exit').onclick = () => {
      window.customConfirm("Exit Routine?", () => this.destroy());
    };
}

  completeRoutine() {
    playSFX('victory', this.panSide);
    this.container.innerHTML = `<div class="header-bar">Great Job ${this.profile.name}!</div>`;
    setTimeout(() => this.destroy(), 3000);
  }

  cleanup() {
    clearInterval(this.intervalId);
    clearInterval(this.chimeIntervalId);
  }

  destroy() {
    this.cleanup();
    activeInstances = activeInstances.filter(i => i !== this);
    this.container.remove();
    evaluateGlobalAudio();
    saveSessionState();
    if (activeInstances.length === 0) { stopBGM(); renderKidsHub(); }
  }
}

function startRoutineExecution() {
  const rData = routines.find(r => r.id === pendingRoutineId);
  const container = document.getElementById('routine-container');
  container.innerHTML = '';
  activeInstances = [];

  selectedKidsForRoutine.forEach((kid, idx) => {
    const panSide = selectedKidsForRoutine.length === 2 ? (idx === 0 ? -0.4 : 0.4) : 0;
    const instance = new RoutineInstance(kid, rData, panSide);
    activeInstances.push(instance);
    container.appendChild(instance.container);
  });
  switchView('activeRoutine');
  if (audioCtx.state === 'suspended') audioCtx.resume();
  playBGM('standard');
  saveSessionState();
}

function evaluateGlobalAudio() {
  if (activeInstances.length === 0) { stopBGM(); return; }
  
  const allPaused = activeInstances.every(i => i.isPaused);
  
  if (allPaused) {
    if (audioCtx.state === 'running') audioCtx.suspend();
    return;
  } else {
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  const anyOvertime = activeInstances.some(i => i.isOvertime);
  playBGM(anyOvertime ? 'urgent' : 'standard');
}

// ==========================================
// 8. Session State Recovery
// ==========================================
async function saveSessionState() {
  if (activeInstances.length === 0) {
    await dbDelete('state', 'current');
    return;
  }
  const stateData = activeInstances.map(i => ({
    profile: i.profile,
    routine: i.routine,
    queue: i.queue,
    currentTask: i.currentTask,
    elapsed: i.elapsed,
    panSide: i.panSide
  }));
  await dbPut('state', { id: 'current', instances: stateData });
}

document.getElementById('btn-scrap-session').onclick = async () => {
  await dbDelete('state', 'current');
  document.getElementById('modal-recovery').classList.add('hidden');
  if (profiles.length === 0) switchView('parentDash'); else renderKidsHub();
};

document.getElementById('btn-resume-session').onclick = () => {
  document.getElementById('modal-recovery').classList.add('hidden');
  const container = document.getElementById('routine-container');
  container.innerHTML = '';
  activeInstances = [];
  
  window.recoveredState.forEach(st => {
    const instance = new RoutineInstance(st.profile, st.routine, st.panSide);
    instance.queue = st.queue;
    instance.currentTask = st.currentTask;
    instance.elapsed = st.elapsed;
    instance.renderTask();
    activeInstances.push(instance);
    container.appendChild(instance.container);
  });
  switchView('activeRoutine');
  if (audioCtx.state === 'suspended') audioCtx.resume();
  evaluateGlobalAudio();
};

// Start
document.addEventListener('DOMContentLoaded', initApp);
