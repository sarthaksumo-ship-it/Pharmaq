import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Send, Volume2 } from 'lucide-react';
import { base64Pcm16ToFloat32, float32ToBase64Pcm16 } from '../utils/audioPcm';
import type {
  EmergencyCheckResult,
  LanguageMode,
  LiveTranscriptEntry,
  ReadingLevel,
} from '../types/medmate';

interface LiveVoicePanelProps {
  language: LanguageMode;
  readingLevel: ReadingLevel;
  documentContext: string;
  hospitalContext?: string;
  onConnectionChange: (connected: boolean) => void;
  onEmergencyDetected: (emergency: EmergencyCheckResult) => void;
  connectSignal: number;
}

type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'error';

export const LiveVoicePanel: React.FC<LiveVoicePanelProps> = ({
  language,
  readingLevel,
  documentContext,
  hospitalContext = '',
  onConnectionChange,
  onEmergencyDetected,
  connectSignal,
}) => {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [micAvailable, setMicAvailable] = useState(true);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [transcripts, setTranscripts] = useState<LiveTranscriptEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const isMutedRef = useRef<boolean>(false);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (transcripts.length > 0 && transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcripts]);

  const appendTranscript = (speaker: LiveTranscriptEntry['speaker'], text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setTranscripts((prev) => {
      const last = prev[prev.length - 1];
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (last && last.speaker === speaker && speaker !== 'system') {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          text: `${last.text} ${clean}`.trim(),
        };
        return updated;
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          speaker,
          text: clean,
          timestamp: now,
        },
      ];
    });
  };

  const stopAudioOutputQueue = () => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Ignore already stopped buffer sources
      }
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    setIsModelSpeaking(false);
  };

  const playAudioChunk = (base64Pcm: string) => {
    if (!outputCtxRef.current) {
      outputCtxRef.current = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = outputCtxRef.current;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const float32 = base64Pcm16ToFloat32(base64Pcm);
    if (float32.length === 0) return;

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const bufferSource = ctx.createBufferSource();
    bufferSource.buffer = buffer;
    bufferSource.connect(ctx.destination);

    const startTime = Math.max(nextStartTimeRef.current, ctx.currentTime);
    nextStartTimeRef.current = startTime + buffer.duration;

    activeSourcesRef.current.add(bufferSource);
    setIsModelSpeaking(true);

    bufferSource.onended = () => {
      activeSourcesRef.current.delete(bufferSource);
      if (activeSourcesRef.current.size === 0) {
        setIsModelSpeaking(false);
      }
    };

    bufferSource.start(startTime);
  };

  const cleanupSession = () => {
    stopAudioOutputQueue();

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (inputCtxRef.current) {
      void inputCtxRef.current.close();
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      void outputCtxRef.current.close();
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }

    onConnectionChange(false);
  };

  useEffect(() => {
    return () => {
      cleanupSession();
    };
  }, []);

  const startLiveVoice = async () => {
    if (status === 'connecting' || status === 'connected') return;

    setErrorMessage(null);
    setStatus('connecting');
    setMicAvailable(true);

    try {
      outputCtxRef.current = new AudioContext({ sampleRate: 24000 });
      if (outputCtxRef.current.state === 'suspended') {
        await outputCtxRef.current.resume();
      }
      nextStartTimeRef.current = outputCtxRef.current.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/live`);
      wsRef.current = ws;

      ws.onopen = async () => {
        ws.send(
          JSON.stringify({
            type: 'setup',
            language,
            readingLevel,
            documentContext,
            hospitalContext,
          })
        );

        try {
          if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('Microphone not supported in this browser.');
          }
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;

          const inputCtx = new AudioContext({ sampleRate: 16000 });
          inputCtxRef.current = inputCtx;
          const source = inputCtx.createMediaStreamSource(stream);
          sourceNodeRef.current = source;

          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (event) => {
            if (isMutedRef.current) return;
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
            const channelData = event.inputBuffer.getChannelData(0);
            const base64Audio = float32ToBase64Pcm16(channelData);
            wsRef.current.send(JSON.stringify({ audio: base64Audio }));
          };

          source.connect(processor);
          processor.connect(inputCtx.destination);
        } catch {
          setMicAvailable(false);
          appendTranscript(
            'system',
            'Microphone access is unavailable here. You can still type questions below and hear/read Pharmer Live responses.'
          );
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as {
            type?: string;
            audio?: string;
            text?: string;
            error?: string;
            emergency?: EmergencyCheckResult;
          };

          if (msg.type === 'ready') {
            setStatus('connected');
            onConnectionChange(true);
            appendTranscript(
              'system',
              'Connected to Pharmer Live Voice. Say hello or ask a question about symptoms, doctors, or your health report.'
            );
          } else if (msg.type === 'audio' && msg.audio) {
            playAudioChunk(msg.audio);
          } else if (msg.type === 'inputTranscript' && msg.text) {
            appendTranscript('user', msg.text);
          } else if (msg.type === 'outputTranscript' && msg.text) {
            appendTranscript('assistant', msg.text);
          } else if (msg.type === 'interrupted') {
            stopAudioOutputQueue();
          } else if (msg.type === 'emergency' && msg.emergency) {
            onEmergencyDetected(msg.emergency);
          } else if (msg.type === 'error' && msg.error) {
            setErrorMessage(msg.error);
            setStatus('error');
            cleanupSession();
          } else if (msg.type === 'closed') {
            setStatus('idle');
            cleanupSession();
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onerror = () => {
        setErrorMessage('Could not connect to the Live Voice service right now.');
        setStatus('error');
        cleanupSession();
      };

      ws.onclose = () => {
        setStatus((prev) => (prev === 'error' ? 'error' : 'idle'));
        onConnectionChange(false);
      };
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to start voice conversation.');
      setStatus('error');
      cleanupSession();
    }
  };

  useEffect(() => {
    if (connectSignal > 0 && status === 'idle') {
      void startLiveVoice();
    }
  }, [connectSignal]);

  const handleEndSession = () => {
    cleanupSession();
    setStatus('idle');
  };

  const handleSendTextMessage = (promptText: string) => {
    const clean = promptText.trim();
    if (!clean) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setErrorMessage('Start the Live Voice session first before sending a message.');
      return;
    }
    appendTranscript('user', clean);
    wsRef.current.send(JSON.stringify({ text: clean }));
    setTextInput('');
  };

  return (
    <section
      id="voice-companion"
      aria-labelledby="voice-heading"
      className="bg-white border border-[#E2DCD0] rounded-2xl p-5 sm:p-8"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#E2DCD0]">
        <div>
          <div className="text-xs text-[#5A564E]">
            <span>Pharmer Real-Time Voice Companion</span>
            <span aria-hidden="true"> · </span>
            <span>
              {status === 'connected'
                ? isModelSpeaking
                  ? 'Pharmer is speaking'
                  : isMuted
                  ? 'Microphone muted'
                  : micAvailable
                  ? 'Listening live'
                  : 'Text-to-voice live'
                : status === 'connecting'
                ? 'Connecting...'
                : 'Ready to talk'}
            </span>
          </div>
          <h2 id="voice-heading" className="font-display text-xl sm:text-2xl font-semibold text-[#1F1B18] mt-0.5">
            Talk naturally with Pharmer Live
          </h2>
          <p className="text-sm text-[#5A564E] mt-1 max-w-2xl">
            Speak in any language — built for everyone, including users who prefer talking over reading. Ask about symptoms, precautions, doctor rooms, or decoded reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {status !== 'connected' ? (
            <button
              type="button"
              onClick={startLiveVoice}
              disabled={status === 'connecting'}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#2864A0] hover:bg-[#1E5082] disabled:bg-slate-400 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
            >
              <Mic className="w-4 h-4" aria-hidden="true" />
              {status === 'connecting' ? 'Connecting...' : 'Start Voice Conversation'}
            </button>
          ) : (
            <>
              {micAvailable && (
                <button
                  type="button"
                  onClick={() => setIsMuted((prev) => !prev)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 min-h-[42px] ${
                    isMuted
                      ? 'bg-[#FDF4E7] border-[#F1D0A5] text-[#6B3C0A]'
                      : 'bg-[#FAF7F0] border-[#E2DCD0] text-[#1F1B18] hover:bg-[#F3EFE6]'
                  }`}
                >
                  {isMuted ? (
                    <>
                      <MicOff className="w-4 h-4" aria-hidden="true" />
                      Unmute Mic
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4 text-[#2864A0]" aria-hidden="true" />
                      Mute Mic
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={handleEndSession}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[42px]"
              >
                <PhoneOff className="w-4 h-4" aria-hidden="true" />
                End Voice Call
              </button>
            </>
          )}
        </div>
      </div>

      {/* Helpful Starter Prompts when Connected */}
      {status === 'connected' && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#5A564E] mr-1">Quick voice prompts:</span>
          {[
            'Which doctor should I visit and what room are they in?',
            'What precautions should I follow right now?',
            'Explain my report in 2 simple sentences',
          ].map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handleSendTextMessage(prompt)}
              className="text-xs font-medium text-[#2864A0] bg-[#EDF4FB] hover:bg-[#DFECFA] border border-[#BDD5EE] rounded-lg px-3 py-1.5 transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Live Transcript Area */}
      <div
        ref={transcriptContainerRef}
        className="mt-4 rounded-xl border border-[#E2DCD0] bg-[#FAF7F0] p-4 min-h-[180px] max-h-[300px] overflow-y-auto space-y-3"
      >
        {transcripts.length === 0 ? (
          <div className="h-36 flex flex-col items-center justify-center text-center px-4">
            <Volume2 className="w-6 h-6 text-[#D78728] mb-2" aria-hidden="true" />
            <p className="text-sm font-medium text-[#1F1B18]">
              {documentContext
                ? 'Your decoded report is ready for voice Q&A'
                : 'Press "Start Voice Conversation" whenever you want to talk'}
            </p>
            <p className="text-xs text-[#5A564E] mt-1 max-w-md">
              Ask things like "What does HbA1c mean?" or "Can I take this tablet with tea?"
            </p>
          </div>
        ) : (
          transcripts.map((entry) => (
            <div
              key={entry.id}
              className={`flex flex-col ${
                entry.speaker === 'user'
                  ? 'items-end'
                  : entry.speaker === 'assistant'
                  ? 'items-start'
                  : 'items-center'
              }`}
            >
              {entry.speaker === 'system' ? (
                <div className="text-xs text-[#5A564E] bg-white border border-[#E2DCD0] rounded-lg px-3 py-1.5 text-center">
                  {entry.text}
                </div>
              ) : (
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    entry.speaker === 'user'
                      ? 'bg-[#2864A0] text-white'
                      : 'bg-white border border-[#E2DCD0] text-[#1F1B18]'
                  }`}
                >
                  <div className="text-[11px] opacity-75 mb-0.5">
                    {entry.speaker === 'user' ? 'You' : 'Pharmer Voice'} · {entry.timestamp}
                  </div>
                  <div>{entry.text}</div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Text Fallback Input inside Live Session */}
      <form
        className="mt-3 flex flex-col sm:flex-row gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          handleSendTextMessage(textInput);
        }}
      >
        <label htmlFor="live-text-fallback" className="sr-only">
          Send a typed message to the live voice companion
        </label>
        <input
          id="live-text-fallback"
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          disabled={status !== 'connected'}
          placeholder={
            status === 'connected'
              ? 'Speak aloud or type a message into the live voice session...'
              : 'Start the voice conversation above to chat live...'
          }
          className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 disabled:bg-slate-100 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20 min-h-[42px]"
        />
        <button
          type="submit"
          disabled={status !== 'connected' || !textInput.trim()}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[42px]"
        >
          <Send className="w-4 h-4" aria-hidden="true" />
          Send
        </button>
      </form>

      {errorMessage && (
        <div role="alert" className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900">
          {errorMessage}
        </div>
      )}
    </section>
  );
};
