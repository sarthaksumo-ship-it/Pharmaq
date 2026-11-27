import type { LanguageMode } from '../types/medmate';

export type SpeechStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'completed'
  | 'autoplay_blocked'
  | 'error';

export interface ActiveSpeechSnapshot {
  messageId: string | null;
  status: SpeechStatus;
  errorMessage: string | null;
}

type GlobalListener = (snapshot: ActiveSpeechSnapshot) => void;
type InstanceListener = (status: SpeechStatus, errorMessage: string | null) => void;

const globalListeners = new Set<GlobalListener>();
const instanceListeners = new Map<string, InstanceListener>();

let sharedAudioCtx: AudioContext | null = null;
let currentAbortController: AbortController | null = null;
let currentSourceNode: AudioBufferSourceNode | null = null;
let currentHtmlAudio: HTMLAudioElement | null = null;
let currentGeneration = 0;

let activeSnapshot: ActiveSpeechSnapshot = {
  messageId: null,
  status: 'idle',
  errorMessage: null,
};

function notifyGlobal() {
  for (const listener of globalListeners) {
    listener({ ...activeSnapshot });
  }
}

function setInstanceStatus(messageId: string, status: SpeechStatus, errorMessage: string | null = null) {
  activeSnapshot = {
    messageId: status === 'idle' ? null : messageId,
    status,
    errorMessage,
  };
  const listener = instanceListeners.get(messageId);
  if (listener) {
    listener(status, errorMessage);
  }
  notifyGlobal();
}

export function subscribeGlobalSpeech(listener: GlobalListener): () => void {
  globalListeners.add(listener);
  listener({ ...activeSnapshot });
  return () => {
    globalListeners.delete(listener);
  };
}

export function registerSpeechListener(messageId: string, listener: InstanceListener): () => void {
  instanceListeners.set(messageId, listener);
  return () => {
    if (instanceListeners.get(messageId) === listener) {
      instanceListeners.delete(messageId);
    }
  };
}

export function detectSpeechLang(text: string, mode: LanguageMode = 'auto'): string {
  if (/[\u0900-\u097F]/.test(text) || mode === 'hi') {
    return 'hi-IN';
  }
  if (mode === 'hinglish') {
    return 'en-IN';
  }
  if (mode === 'en') {
    return 'en-US';
  }
  if (/\b(hai|hain|hoon|kya|nahi|bukhar|dard|paani|aaram|dawa|subah|raat|mujhe|mere|karein)\b/i.test(text)) {
    return 'en-IN';
  }
  return 'en-IN';
}

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new Ctx();
  }
  return sharedAudioCtx;
}

/**
 * Must be called synchronously inside a user gesture (click / submit / tap Speak)
 * so the browser keeps audio playback unlocked across async fetch('/api/chat') + fetch('/api/tts').
 */
export function unlockAudioPlayback(): void {
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const silentBuffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = silentBuffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // Ignore unlock failures; HTMLAudioElement/autoplay fallback will handle it cleanly
  }
}

export function stopAllSpeech(): void {
  const prevId = activeSnapshot.messageId;
  currentGeneration += 1;

  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  if (currentSourceNode) {
    try {
      currentSourceNode.onended = null;
      currentSourceNode.stop();
      currentSourceNode.disconnect();
    } catch {
      // ignore already stopped
    }
    currentSourceNode = null;
  }
  if (currentHtmlAudio) {
    try {
      currentHtmlAudio.onended = null;
      currentHtmlAudio.onerror = null;
      currentHtmlAudio.pause();
      currentHtmlAudio.currentTime = 0;
    } catch {
      // ignore
    }
    currentHtmlAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }

  if (prevId) {
    const prevListener = instanceListeners.get(prevId);
    if (prevListener) {
      prevListener('idle', null);
    }
  }
  activeSnapshot = {
    messageId: null,
    status: 'idle',
    errorMessage: null,
  };
  notifyGlobal();
}

export interface SpeechControllerSession {
  playFromText: (text: string, language: LanguageMode) => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  replay: (text: string, language: LanguageMode) => Promise<void>;
  stop: () => void;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function pickBrowserVoice(targetLang: string): Promise<SpeechSynthesisVoice | null> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  let voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      window.speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
      window.setTimeout(finish, 180);
    });
    voices = window.speechSynthesis.getVoices();
  }
  if (voices.length === 0) return null;

  const lowerTarget = targetLang.toLowerCase();
  const baseTarget = lowerTarget.split('-')[0];
  return (
    voices.find((v) => v.lang.toLowerCase() === lowerTarget) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(`${baseTarget}-`)) ||
    voices.find((v) => v.lang.toLowerCase() === baseTarget) ||
    voices.find((v) => v.lang.toLowerCase().startsWith('en-')) ||
    voices[0] ||
    null
  );
}

export function createMessageSpeechSession(messageId: string): SpeechControllerSession {
  let cachedAudioBase64: string | null = null;
  let cachedMimeType = 'audio/wav';
  let cachedBuffer: AudioBuffer | null = null;
  let pauseOffsetSec = 0;
  let startedAtCtxTime = 0;
  let usingBrowserSpeech = false;
  let isIntentionalPauseOrStop = false;

  const playAudioBuffer = async (buffer: AudioBuffer, offsetSec: number, myGen: number) => {
    const ctx = getOrCreateAudioContext();
    if (!ctx) throw new Error('AudioContext unavailable');
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (ctx.state === 'suspended') {
      const blockedErr = new Error('Autoplay blocked by browser');
      blockedErr.name = 'NotAllowedError';
      throw blockedErr;
    }
    if (myGen !== currentGeneration) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    currentSourceNode = source;
    usingBrowserSpeech = false;
    isIntentionalPauseOrStop = false;

    const clampedOffset = Math.max(0, Math.min(offsetSec, Math.max(0, buffer.duration - 0.05)));
    startedAtCtxTime = ctx.currentTime - clampedOffset;

    source.onended = () => {
      if (myGen !== currentGeneration) return;
      if (isIntentionalPauseOrStop) return;
      currentSourceNode = null;
      pauseOffsetSec = 0;
      setInstanceStatus(messageId, 'completed', null);
    };

    source.start(0, clampedOffset);
    setInstanceStatus(messageId, 'playing', null);
  };

  const playViaHtmlAudio = async (base64: string, mimeType: string, myGen: number) => {
    if (myGen !== currentGeneration) return;
    const audio = new Audio(`data:${mimeType};base64,${base64}`);
    currentHtmlAudio = audio;
    usingBrowserSpeech = false;
    isIntentionalPauseOrStop = false;

    audio.onended = () => {
      if (myGen !== currentGeneration || isIntentionalPauseOrStop) return;
      currentHtmlAudio = null;
      setInstanceStatus(messageId, 'completed', null);
    };
    audio.onerror = () => {
      if (myGen !== currentGeneration) return;
      currentHtmlAudio = null;
      setInstanceStatus(
        messageId,
        'error',
        'Audio playback failed. You can read the answer above or tap Retry Audio.'
      );
    };

    await audio.play();
    if (myGen === currentGeneration) {
      setInstanceStatus(messageId, 'playing', null);
    }
  };

  const speakWithBrowserVoice = async (text: string, language: LanguageMode, myGen: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setInstanceStatus(
        messageId,
        'error',
        'Voice playback is unavailable right now. You can read the complete response above.'
      );
      return;
    }

    const targetLang = detectSpeechLang(text, language);
    const selectedVoice = await pickBrowserVoice(targetLang);
    if (myGen !== currentGeneration) return;

    if (!selectedVoice) {
      setInstanceStatus(
        messageId,
        'error',
        'Speech audio could not be generated right now. The full answer is shown above — tap Retry Audio to try again.'
      );
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang || targetLang;
      utterance.rate = 0.96;

      usingBrowserSpeech = true;
      isIntentionalPauseOrStop = false;

      utterance.onend = () => {
        if (myGen !== currentGeneration || isIntentionalPauseOrStop) return;
        usingBrowserSpeech = false;
        setInstanceStatus(messageId, 'completed', null);
      };
      utterance.onerror = (ev) => {
        if (myGen !== currentGeneration || isIntentionalPauseOrStop) return;
        usingBrowserSpeech = false;
        const errCode = (ev as { error?: string })?.error;
        if (errCode === 'not-allowed') {
          setInstanceStatus(
            messageId,
            'autoplay_blocked',
            'Your browser paused automatic audio. Tap Play to hear Pharmer speak.'
          );
          return;
        }
        setInstanceStatus(
          messageId,
          'error',
          'Speech playback hit an issue. The full written answer stays visible above.'
        );
      };

      setInstanceStatus(messageId, 'playing', null);
      window.speechSynthesis.speak(utterance);
    } catch {
      usingBrowserSpeech = false;
      setInstanceStatus(
        messageId,
        'error',
        'Could not start voice playback right now. Please tap Retry Audio.'
      );
    }
  };

  const playFromText = async (text: string, language: LanguageMode) => {
    const cleanText = text.trim();
    if (!cleanText) return;

    stopAllSpeech();
    const myGen = currentGeneration;
    pauseOffsetSec = 0;

    if (cachedBuffer) {
      try {
        await playAudioBuffer(cachedBuffer, 0, myGen);
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'NotAllowedError') {
          setInstanceStatus(
            messageId,
            'autoplay_blocked',
            'Tap Play to hear Pharmer read this response aloud.'
          );
          return;
        }
      }
    }

    if (cachedAudioBase64) {
      try {
        await playViaHtmlAudio(cachedAudioBase64, cachedMimeType, myGen);
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'NotAllowedError') {
          setInstanceStatus(
            messageId,
            'autoplay_blocked',
            'Tap Play to hear Pharmer read this response aloud.'
          );
          return;
        }
      }
    }

    setInstanceStatus(messageId, 'loading', null);
    const controller = new AbortController();
    currentAbortController = controller;

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, language }),
        signal: controller.signal,
      });

      if (myGen !== currentGeneration) return;
      const data = await response.json();
      if (!response.ok || !data.audioBase64) {
        throw new Error(data.error || 'TTS synthesis failed');
      }

      cachedAudioBase64 = data.audioBase64;
      cachedMimeType = data.mimeType || 'audio/wav';

      const ctx = getOrCreateAudioContext();
      if (ctx) {
        try {
          const decoded = await ctx.decodeAudioData(base64ToArrayBuffer(data.audioBase64));
          if (myGen !== currentGeneration) return;
          cachedBuffer = decoded;
          await playAudioBuffer(decoded, 0, myGen);
          return;
        } catch (decodeOrPlayErr) {
          if (decodeOrPlayErr instanceof Error && decodeOrPlayErr.name === 'NotAllowedError') {
            setInstanceStatus(
              messageId,
              'autoplay_blocked',
              'Browser blocked auto-play audio. Tap Play to listen aloud.'
            );
            return;
          }
          // Fall through to HTMLAudioElement
        }
      }

      try {
        await playViaHtmlAudio(data.audioBase64, cachedMimeType, myGen);
      } catch (htmlErr) {
        if (htmlErr instanceof Error && htmlErr.name === 'NotAllowedError') {
          setInstanceStatus(
            messageId,
            'autoplay_blocked',
            'Browser blocked auto-play audio. Tap Play to listen aloud.'
          );
          return;
        }
        await speakWithBrowserVoice(cleanText, language, myGen);
      }
    } catch (err) {
      if (myGen !== currentGeneration) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      await speakWithBrowserVoice(cleanText, language, myGen);
    } finally {
      if (currentAbortController === controller) {
        currentAbortController = null;
      }
    }
  };

  const pause = () => {
    if (activeSnapshot.messageId !== messageId) return;
    isIntentionalPauseOrStop = true;

    if (currentSourceNode && sharedAudioCtx && !usingBrowserSpeech) {
      pauseOffsetSec = Math.max(0, sharedAudioCtx.currentTime - startedAtCtxTime);
      try {
        currentSourceNode.onended = null;
        currentSourceNode.stop();
        currentSourceNode.disconnect();
      } catch {
        // ignore
      }
      currentSourceNode = null;
      setInstanceStatus(messageId, 'paused', null);
      return;
    }

    if (currentHtmlAudio && !usingBrowserSpeech) {
      currentHtmlAudio.pause();
      setInstanceStatus(messageId, 'paused', null);
      return;
    }

    if (usingBrowserSpeech && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
      setInstanceStatus(messageId, 'paused', null);
    }
  };

  const resume = async () => {
    if (activeSnapshot.messageId !== messageId) return;
    const myGen = currentGeneration;
    isIntentionalPauseOrStop = false;

    if (cachedBuffer && !usingBrowserSpeech) {
      try {
        await playAudioBuffer(cachedBuffer, pauseOffsetSec, myGen);
        return;
      } catch {
        // fallback below
      }
    }

    if (currentHtmlAudio && !usingBrowserSpeech) {
      try {
        await currentHtmlAudio.play();
        setInstanceStatus(messageId, 'playing', null);
        return;
      } catch {
        setInstanceStatus(
          messageId,
          'error',
          'Could not resume audio playback. Tap Replay to restart.'
        );
        return;
      }
    }

    if (usingBrowserSpeech && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.resume();
      setInstanceStatus(messageId, 'playing', null);
    }
  };

  const replay = async (text: string, language: LanguageMode) => {
    pauseOffsetSec = 0;
    await playFromText(text, language);
  };

  const stop = () => {
    isIntentionalPauseOrStop = true;
    pauseOffsetSec = 0;
    if (activeSnapshot.messageId === messageId) {
      stopAllSpeech();
    } else {
      setInstanceStatus(messageId, 'idle', null);
    }
  };

  return {
    playFromText,
    pause,
    resume,
    replay,
    stop,
  };
}
