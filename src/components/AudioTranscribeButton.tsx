import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { unlockAudioPlayback } from '../utils/speechPlayer';
import type { LanguageMode } from '../types/medmate';

interface AudioTranscribeButtonProps {
  onTranscript: (text: string) => void;
  onBeforeStart?: () => void;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
  variant?: 'default' | 'compact' | 'prominent';
  language?: LanguageMode;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getBrowserSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export const AudioTranscribeButton: React.FC<AudioTranscribeButtonProps> = ({
  onTranscript,
  onBeforeStart,
  disabled = false,
  label = 'Speak (Any Language)',
  compact = false,
  variant = 'default',
  language = 'auto',
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionTextRef = useRef<string>('');
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setElapsedSec(0);
  };

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTimer();
      stopStream();
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore cleanup error
      }
    };
  }, []);

  const startRecording = async () => {
    onBeforeStart?.();
    unlockAudioPlayback();
    setError(null);
    recognitionTextRef.current = '';

    // Start browser SpeechRecognition in parallel if available so we always have instant backup
    const SpeechRec = getBrowserSpeechRecognition();
    if (SpeechRec) {
      try {
        const rec = new SpeechRec();
        rec.continuous = true;
        rec.interimResults = false;
        rec.lang =
          language === 'hi'
            ? 'hi-IN'
            : language === 'hinglish'
            ? 'en-IN'
            : language === 'en'
            ? 'en-US'
            : navigator.language || 'en-IN';
        rec.onresult = (event) => {
          const parts: string[] = [];
          for (let i = 0; i < event.results.length; i++) {
            const item = event.results[i];
            if (item?.[0]?.transcript) {
              parts.push(item[0].transcript.trim());
            }
          }
          if (parts.length > 0) {
            recognitionTextRef.current = parts.join(' ').trim();
          }
        };
        rec.onerror = () => {
          // Ignore silent fallback error if MediaRecorder handles transcription
        };
        rec.start();
        recognitionRef.current = rec;
      } catch {
        recognitionRef.current = null;
      }
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        if (recognitionRef.current) {
          setIsRecording(true);
          setElapsedSec(0);
          timerRef.current = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
          return;
        }
        throw new Error(
          'Microphone recording is not available in this browser view. Try opening the app in a new browser tab or typing your symptoms.'
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const supportedMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(
        (m) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(m)
      );
      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        clearTimer();
        stopStream();
        try {
          recognitionRef.current?.stop();
        } catch {
          // ignore
        }

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || supportedMime || 'audio/webm',
        });

        const speechBackup = recognitionTextRef.current.trim();
        if (blob.size === 0) {
          if (speechBackup) {
            onTranscript(speechBackup);
          } else {
            setError('No audio captured. Please speak clearly for at least 1–2 seconds.');
          }
          return;
        }

        setIsTranscribing(true);
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
            reader.onerror = () => reject(new Error('Failed to read recorded audio.'));
            reader.readAsDataURL(blob);
          });

          const response = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: base64,
              mimeType: blob.type || 'audio/webm',
            }),
          });
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Could not transcribe audio.');
          }
          const finalTranscript = (data.transcript || '').trim() || speechBackup;
          if (finalTranscript) {
            onTranscript(finalTranscript);
          } else {
            setError('Could not hear clear speech. Please try speaking closer to the mic.');
          }
        } catch (err) {
          if (speechBackup) {
            onTranscript(speechBackup);
          } else {
            setError(
              err instanceof Error
                ? err.message
                : 'Audio transcription failed. Please try again or type your symptoms.'
            );
          }
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setElapsedSec(0);
      timerRef.current = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    } catch (err) {
      clearTimer();
      stopStream();
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('notallowed')) {
        setError(
          'Microphone permission was blocked by the browser or embedded preview. Allow mic access in your address bar or open in a standalone tab.'
        );
      } else {
        setError(msg || 'Microphone access was denied.');
      }
    }
  };

  const stopRecording = () => {
    unlockAudioPlayback();
    clearTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      const speechBackup = recognitionTextRef.current.trim();
      if (speechBackup) {
        onTranscript(speechBackup);
      } else {
        setError('Could not capture speech. Please try again.');
      }
    }
    setIsRecording(false);
  };

  const resolvedVariant = variant !== 'default' ? variant : compact ? 'compact' : 'default';
  const sizeClass =
    resolvedVariant === 'compact'
      ? 'px-3 py-2 text-xs min-h-[42px]'
      : resolvedVariant === 'prominent'
      ? 'px-5 py-3 text-base font-semibold min-h-[48px]'
      : 'px-4 py-2.5 text-sm min-h-[44px]';

  return (
    <div className="inline-flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={disabled || isTranscribing}
        onClick={isRecording ? stopRecording : startRecording}
        aria-label={isRecording ? 'Stop recording and transcribe' : label}
        className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2864A0] ${sizeClass} ${
          isRecording
            ? 'bg-red-700 hover:bg-red-800 text-white shadow-sm'
            : resolvedVariant === 'prominent'
            ? 'bg-[#FDF4E7] hover:bg-[#F9E7CC] text-[#1F1B18] border border-[#E5B87D]'
            : 'bg-[#FAF7F0] hover:bg-[#EDF4FB] text-[#1F1B18] border border-[#D5CCBC] hover:border-[#2864A0] disabled:opacity-50'
        }`}
      >
        {isRecording ? (
          <>
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping shrink-0" aria-hidden="true" />
            <Square className="w-4 h-4 fill-current shrink-0" aria-hidden="true" />
            <span className="tabular-nums">Listening · Stop ({elapsedSec}s)</span>
          </>
        ) : (
          <>
            <Mic className="w-4 h-4 text-[#D78728] shrink-0" aria-hidden="true" />
            <span>{isTranscribing ? 'Listening finished · Converting speech...' : label}</span>
          </>
        )}
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-800 max-w-sm leading-snug">
          {error}
        </span>
      )}
    </div>
  );
};
