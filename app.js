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
let bgmType = 'standard'; // 'standard' or 'urgent'

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
  source.connect(audioCtx.destination);
  source.start(0);
  globalBGM = source;
  bgmType = type;
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
  source.start(0);
}

// ==========================================
// 3. Application State & Navigation
// ==========================================
let currentMode = 'kids'; // 'kids' or 'parent'
let activeInstances = []; // Holds RoutineInstances for split screen
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

function switchView(viewName) {
  Object.values(UI).forEach(el => { if (el) el.classList.add('hidden'); });
  if (viewName === 'kidsHub') { UI.kidsHub.classList.remove('hidden'); currentMode = 'kids'; UI.navToggle.style.display = 'block'; }
  if (viewName === 'parentDash') { UI.parentDash.classList.remove('hidden'); currentMode = 'parent'; renderParentDash(); UI.navToggle.style.display = 'block'; }
  if (viewName === 'activeRoutine') { UI.activeRoutine.classList.remove('hidden'); UI.navToggle.style.display = 'none'; }
  if (viewName === 'routineBuilder') { UI.routineBuilder.classList.remove('hidden'); UI.navToggle.style.display = 'none'; }
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
        generateGate(); // Reshuffle
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
    div.innerHTML = `
      <input type="text" value="${t.name}" onchange="currentEditingRoutine.tasks[${i}].name = this.value" placeholder="Task Name">
      <input type="number" value="${t.minTime}" onchange="currentEditingRoutine.tasks[${i}].minTime = parseInt(this.value)" placeholder="Min Time (sec)">
      <input type="number" value="${t.maxTime}" onchange="currentEditingRoutine.tasks[${i}].maxTime = parseInt(this.value)" placeholder="Max Time (sec)">
      <select onchange="currentEditingRoutine.tasks[${i}].skipBehavior = this.value">
        <option value="none" ${t.skipBehavior === 'none' ? 'selected' : ''}>Cannot Skip</option>
        <option value="skip" ${t.skipBehavior === 'skip' ? 'selected' : ''}>Skip Completely</option>
        <option value="defer" ${t.skipBehavior === 'defer' ? 'selected' : ''}>Skip & Defer</option>
      </select>
      <button onclick="moveTask(${i}, -1)">Up</button>
      <button onclick="moveTask(${i}, 1)">Down</button>
      <button onclick="removeTask(${i})">Del</button>
    `;
    tList.appendChild(div);
  });
}

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
  if (existingIdx >= 0) routines[existingIdx] = currentEditingRoutine; else routines.push(currentEditingRoutine);
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
    card.textContent = r.name;
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
          btn.style.opacity = '1';
        } else if (selectedKidsForRoutine.length < 2) {
          selectedKidsForRoutine.push(p);
          btn.style.opacity = '0.5';
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

// Custom Confirm Modal
window.customConfirm = (msg, onYes) => {
  const modal = document.getElementById('modal-confirm');
  document.getElementById('confirm-title').textContent = msg;
  modal.classList.remove('hidden');
  document.getElementById('btn-confirm-yes').onclick = () => { modal.classList.add('hidden'); onYes(); };
  document.getElementById('btn-confirm-no').onclick = () => { modal.classList.add('hidden'); };
};

// ==========================================
// 7. Routine Execution (The Core Engine)
// ==========================================
class RoutineInstance {
  constructor(profile, routineData, panSide) {
    this.profile = profile;
    this.routine = JSON.parse(JSON.stringify(routineData));
    this.panSide = panSide; // -0.4 for Left/Top, +0.4 for Right/Bottom
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
      this.chimeIntervalId = setInterval(() => playSFX('warning', this.panSide), 30000);
      playSFX('warning', this.panSide);
      evaluateGlobalAudio();
    }
    saveSessionState();
  }

  updateUI() {
    const btnFinish = this.container.querySelector('.btn-finish');
    if (this.currentTask.minTime > 0) {
      if (this.elapsed >= this.currentTask.minTime) {
        if(btnFinish) btnFinish.style.display = 'block';
      } else {
        if(btnFinish) btnFinish.style.display = 'none';
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
    this.container.innerHTML = `
      <div class="header-bar">${this.profile.name}: ${this.currentTask.name}</div>
      ${this.currentTask.maxTime > 0 ? `<div class="timer-bar"><div class="timer-fill" style="width:0%"></div></div>` : ''}
      <div class="partition-controls">
        <button class="kid-btn btn-finish" ${this.currentTask.minTime > 0 ? 'style="display:none;"' : ''}>Finish</button>
        ${this.currentTask.skipBehavior !== 'none' ? `<button class="kid-btn tilted btn-skip">Skip</button>` : ''}
        <button class="kid-btn btn-pause">Pause</button>
        <button class="kid-btn btn-exit">Exit</button>
      </div>
    `;

    this.container.querySelector('.btn-finish').onclick = () => {
      playSFX('complete', this.panSide);
      this.advanceTask();
    };

    const skipBtn = this.container.querySelector('.btn-skip');
    if(skipBtn) {
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
              
