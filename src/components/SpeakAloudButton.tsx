import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, Pause, Play, RotateCcw, Square, Volume2 } from 'lucide-react';
import {
  createMessageSpeechSession,
  registerSpeechListener,
  type SpeechControllerSession,
  type SpeechStatus,
  unlockAudioPlayback,
} from '../utils/speechPlayer';
import type { LanguageMode } from '../types/medmate';

interface SpeakAloudButtonProps {
  messageId?: string;
  text: string;
  language?: LanguageMode;
  label?: string;
  compact?: boolean;
  showControls?: boolean;
  autoPlay?: boolean;
}

export const SoundWaveBars: React.FC<{ active?: boolean }> = ({ active = true }) => (
  <span className="inline-flex items-end gap-0.5 h-3.5" aria-hidden="true">
    {[0, 0.16, 0.32, 0.12].map((delay, idx) => (
      <span
        key={idx}
        className={`w-0.5 rounded-full bg-[#2864A0] ${
          active ? 'pharmer-wave-bar h-3.5' : 'h-1.5 opacity-60'
        }`}
        style={active ? { animationDelay: `${delay}s` } : undefined}
      />
    ))}
  </span>
);

export const SpeakAloudButton: React.FC<SpeakAloudButtonProps> = ({
  messageId,
  text,
  language = 'en',
  label = 'Listen Aloud',
  compact = false,
  showControls = false,
  autoPlay = false,
}) => {
  const fallbackId = useId();
  const resolvedId = messageId || fallbackId;

  const [status, setStatus] = useState<SpeechStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sessionRef = useRef<SpeechControllerSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = createMessageSpeechSession(resolvedId);
  }
  const autoPlayedKeyRef = useRef<string>('');

  useEffect(() => {
    const unregister = registerSpeechListener(resolvedId, (nextStatus, err) => {
      setStatus(nextStatus);
      setErrorMessage(err);
    });
    return () => {
      unregister();
      sessionRef.current?.stop();
    };
  }, [resolvedId]);

  const handlePlay = useCallback(() => {
    unlockAudioPlayback();
    void sessionRef.current?.playFromText(text, language);
  }, [language, text]);

  const handleReplay = useCallback(() => {
    unlockAudioPlayback();
    void sessionRef.current?.replay(text, language);
  }, [language, text]);

  const handlePauseOrResume = useCallback(() => {
    unlockAudioPlayback();
    if (status === 'playing') {
      sessionRef.current?.pause();
    } else if (status === 'paused') {
      void sessionRef.current?.resume();
    }
  }, [status]);

  const handleStop = useCallback(() => {
    sessionRef.current?.stop();
  }, []);

  useEffect(() => {
    const key = `${resolvedId}:${text}`;
    if (autoPlay && text.trim() && autoPlayedKeyRef.current !== key) {
      autoPlayedKeyRef.current = key;
      void sessionRef.current?.playFromText(text, language);
    }
  }, [autoPlay, language, resolvedId, text]);

  if (showControls) {
    return (
      <div className="inline-flex flex-col items-end gap-1.5">
        <div className="inline-flex flex-wrap items-center gap-1.5">
          {status === 'loading' && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#EDF4FB] text-[#2864A0] border border-[#BDD5EE] min-h-[38px]">
              <SoundWaveBars active={false} />
              <span>Preparing voice...</span>
              <button
                type="button"
                onClick={handleStop}
                className="ml-1 inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-[#1F1B18] bg-white hover:bg-[#FAF7F0] rounded-md border border-[#D5CCBC] transition-colors"
              >
                <Square className="w-3 h-3 fill-current" aria-hidden="true" />
                Stop
              </button>
            </div>
          )}

          {(status === 'playing' || status === 'paused') && (
            <div
              role="region"
              aria-label="Voice playback controls"
              className="inline-flex flex-wrap items-center gap-1.5 bg-[#EDF4FB] border border-[#2864A0]/40 rounded-lg px-2.5 py-1"
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2864A0] px-1 whitespace-nowrap">
                <SoundWaveBars active={status === 'playing'} />
                <span>{status === 'playing' ? 'Pharmer is speaking' : 'Paused'}</span>
              </span>
              <button
                type="button"
                onClick={handlePauseOrResume}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#2864A0] bg-white hover:bg-[#FAF7F0] rounded-md border border-[#BDD5EE] transition-colors whitespace-nowrap min-h-[32px]"
              >
                {status === 'playing' ? (
                  <>
                    <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" aria-hidden="true" />
                    Resume
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-[#1F1B18] hover:bg-black rounded-md transition-colors whitespace-nowrap min-h-[32px]"
              >
                <Square className="w-3 h-3 fill-current" aria-hidden="true" />
                Stop
              </button>
              <button
                type="button"
                onClick={handleReplay}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#1F1B18] bg-white hover:bg-[#FAF7F0] rounded-md border border-[#D5CCBC] transition-colors whitespace-nowrap min-h-[32px]"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                Replay
              </button>
            </div>
          )}

          {status === 'completed' && (
            <div className="inline-flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[#267D40] bg-[#ECF7EF] border border-[#B8DFC3] rounded-lg px-2.5 py-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                Finished speaking
              </span>
              <button
                type="button"
                onClick={handleReplay}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg bg-[#EDF4FB] hover:bg-[#DFECFA] text-[#2864A0] border border-[#BDD5EE] transition-colors whitespace-nowrap min-h-[38px]"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                Replay
              </button>
            </div>
          )}

          {(status === 'idle' || status === 'autoplay_blocked' || status === 'error') && (
            <button
              type="button"
              onClick={handlePlay}
              disabled={!text.trim()}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 min-h-[38px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2864A0] ${
                status === 'autoplay_blocked' || status === 'error'
                  ? 'bg-[#FDF4E7] hover:bg-[#F9E7CC] text-[#9A550C] border-[#E5B87D]'
                  : 'bg-[#EDF4FB] hover:bg-[#DFECFA] text-[#2864A0] border-[#BDD5EE]'
              }`}
            >
              {status === 'autoplay_blocked' ? (
                <>
                  <Play className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Tap to Hear Answer</span>
                </>
              ) : status === 'error' ? (
                <>
                  <RotateCcw className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Retry Audio</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </>
              )}
            </button>
          )}
        </div>

        {errorMessage && (
          <span role="status" className="text-xs text-[#7C4408] text-right max-w-xs leading-snug">
            {errorMessage}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={status === 'playing' || status === 'paused' ? handleStop : handlePlay}
        disabled={status === 'loading' || !text.trim()}
        className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0 ${
          compact
            ? 'px-2.5 py-1.5 text-xs bg-[#F3EFE6] hover:bg-[#EDF4FB] text-[#1F1B18] border border-[#E2DCD0] min-h-[34px]'
            : 'px-4 py-2 text-sm bg-[#F3EFE6] hover:bg-[#EDF4FB] text-[#1F1B18] border border-[#E2DCD0] min-h-[42px]'
        }`}
      >
        {status === 'playing' || status === 'paused' ? (
          <>
            <Square className="w-3.5 h-3.5 fill-current text-[#2864A0]" aria-hidden="true" />
            Stop Audio
          </>
        ) : (
          <>
            <Volume2 className="w-4 h-4 text-[#2864A0]" aria-hidden="true" />
            {status === 'loading' ? 'Loading Audio...' : status === 'error' ? 'Retry Audio' : label}
          </>
        )}
      </button>
      {errorMessage && <span className="text-xs text-[#7C4408]">{errorMessage}</span>}
    </div>
  );
};
