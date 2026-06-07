// ==========================================
// Routine Execution (The Core Engine)
// ==========================================
import { playSFX, audioCtx, playBGM, stopBGM, activeInstances, bgmGainNode } from './audio.js';
import { dbDelete, dbPut } from './db.js';
import { toggleMusicMute, toggleSoundMute, updateAllMuteButtons, isMusicMuted, isSoundMuted } from './audio.js';

export class RoutineInstance {
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
    window.dispatchEvent(new CustomEvent('evaluateGlobalAudio'));
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
      window.dispatchEvent(new CustomEvent('evaluateGlobalAudio'));
    }
    window.dispatchEvent(new CustomEvent('saveSessionState'));
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
        requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('updatePWAThemeColor')));
      };
    } else {
      this.container.style.backgroundImage = 'none';
      this.container.style.backgroundColor = 'transparent';
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('updatePWAThemeColor')));
    }

    this.container.innerHTML = `
      <div class="partition-top">
        <div class="header-bar">${this.currentTask.name}</div>
        ${this.currentTask.maxTime > 0 ? `<div class="timer-bar"><div class="timer-fill" style="width:0%"></div></div>` : ''}
      </div>
      <div class="partition-body-combined">
        <div class="mute-controls hidden" style="position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 10; display: flex; gap: 10px; pointer-events: auto;">
          <button class="kid-btn btn-mute-music" style="font-size: 14px; padding: 8px 16px; margin: 0; min-width: auto; box-shadow: 0 4px 0 #0a4b80;"></button>
          <button class="kid-btn btn-mute-sounds" style="font-size: 14px; padding: 8px 16px; margin: 0; min-width: auto; box-shadow: 0 4px 0 #0a4b80;"></button>
        </div>
        <div class="partition-middle">
          ${this.currentTask.img ? `<img src="${this.currentTask.img}" class="task-display-image" alt="Task Graphic">` : ''}
        </div>
        <div class="partition-controls">
          <button class="kid-btn btn-finish" ${this.currentTask.minTime > 0 ? 'style="visibility: hidden;"' : ''}>Finish</button>
          <button class="kid-btn btn-pause">Pause</button>
          <div class="kid-name-display">${this.profile.name}</div>
          <button class="kid-btn tilted btn-skip" ${this.currentTask.skipBehavior === 'none' ? 'disabled' : ''}>Skip</button>
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
      this.updateMuteControlsVisibility();
      window.dispatchEvent(new CustomEvent('evaluateGlobalAudio'));
    };

    this.container.querySelector('.btn-exit').onclick = () => {
      window.customConfirm("Exit Routine?", () => this.destroy());
    };

    this.container.querySelector('.btn-mute-music').onclick = () => {
      toggleMusicMute();
    };

    this.container.querySelector('.btn-mute-sounds').onclick = () => {
      toggleSoundMute();
    };

    this.updateMuteControlsVisibility();
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
    window.dispatchEvent(new CustomEvent('evaluateGlobalAudio'));
    window.dispatchEvent(new CustomEvent('saveSessionState'));
    if (activeInstances.length === 0) { stopBGM(); window.dispatchEvent(new CustomEvent('renderKidsHub')); }
  }

  updateMuteControlsVisibility() {
    const muteControls = this.container.querySelector('.mute-controls');
    if (muteControls) {
      if (this.isPaused) {
        muteControls.classList.remove('hidden');
        this.updateMuteButtonsText();
      } else {
        muteControls.classList.add('hidden');
      }
    }
  }

  updateMuteButtonsText() {
    const btnMusic = this.container.querySelector('.btn-mute-music');
    const btnSounds = this.container.querySelector('.btn-mute-sounds');
    
    const musicOnSvg = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><pat[...]
    const musicOffSvg = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><pa[...]
    
    const soundsOnSvg = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><pa[...]
    const soundsOffSvg = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><p[...]

    if (btnMusic) btnMusic.innerHTML = isMusicMuted ? musicOffSvg : musicOnSvg;
    if (btnSounds) btnSounds.innerHTML = isSoundMuted ? soundsOffSvg : soundsOnSvg;
  }
}

export function evaluateGlobalAudio(activeInstances) {
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
