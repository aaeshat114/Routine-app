// ==========================================
// Audio Engine (Spatial Panning & State)
// ==========================================
export const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
export let globalBGM = null;
export let bgmType = 'standard'; 
export let activeSfxCount = 0;

export const bgmGainNode = audioCtx.createGain();
const musicMuteGain = audioCtx.createGain();
const sfxMuteGain = audioCtx.createGain();

bgmGainNode.connect(musicMuteGain);
musicMuteGain.connect(audioCtx.destination);
sfxMuteGain.connect(audioCtx.destination);

export let isMusicMuted = false;
export let isSoundMuted = false;
export let activeInstances = [];

export function toggleMusicMute() {
  isMusicMuted = !isMusicMuted;
  musicMuteGain.gain.setValueAtTime(isMusicMuted ? 0 : 1, audioCtx.currentTime);
  updateAllMuteButtons();
}

export function toggleSoundMute() {
  isSoundMuted = !isSoundMuted;
  sfxMuteGain.gain.setValueAtTime(isSoundMuted ? 0 : 1, audioCtx.currentTime);
  updateAllMuteButtons();
}

export function updateAllMuteButtons() {
  activeInstances.forEach(instance => {
    instance.updateMuteButtonsText();
  });
}

const AUDIO_PATHS = {
  standard: 'assets/audio/bgm-standard.mp3',
  urgent: 'assets/audio/bgm-urgent.mp3',
  complete: 'assets/audio/sfx-complete.mp3',
  warning: 'assets/audio/sfx-warning.mp3',
  victory: 'assets/audio/sfx-victory.mp3'
};
export const audioBuffers = {};

export async function loadAudio() {
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

export function playBGM(type) {
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

export function stopBGM() {
  if (globalBGM) { globalBGM.stop(); globalBGM = null; }
}

export function playSFX(type, panValue = 0) {
  if (!audioBuffers[type]) return;
  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffers[type];
  if (audioCtx.createStereoPanner) {
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = panValue;
    source.connect(panner);
    panner.connect(sfxMuteGain);
  } else {
    source.connect(sfxMuteGain);
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
