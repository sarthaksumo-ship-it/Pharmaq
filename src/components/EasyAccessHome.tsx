import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  HeartHandshake,
  HelpCircle,
  RotateCcw,
  Send,
  ShieldAlert,
  Square,
  Stethoscope,
  UserCheck,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AudioTranscribeButton } from './AudioTranscribeButton';
import { SoundWaveBars, SpeakAloudButton } from './SpeakAloudButton';
import { detectEmergencyRedFlags } from '../utils/safety';
import {
  type ActiveSpeechSnapshot,
  stopAllSpeech,
  subscribeGlobalSpeech,
  unlockAudioPlayback,
} from '../utils/speechPlayer';
import type {
  EasyAccessChatMessage,
  EasyAccessSection,
  EmergencyCheckResult,
  LanguageMode,
  TeachBackEvaluation,
  UserRole,
} from '../types/medmate';

interface EasyAccessHomeProps {
  language: LanguageMode;
  onLanguageChange: (lang: LanguageMode) => void;
  onEmergencyDetected: (emergency: EmergencyCheckResult) => void;
  onOpenPortal: (portal: UserRole) => void;
}

const EXAMPLE_PROMPTS = [
  'I have a headache and feel tired.',
  'Mujhe kal se bukhar hai.',
  'My child has been coughing.',
  'I accidentally took the wrong medicine.',
  'Mere gale mein dard ho raha hai.',
];

function getSectionStyle(id: EasyAccessSection['id']) {
  if (id === 'what_might_be_happening') {
    return {
      container: 'bg-[#EDF4FB]/80 border-[#BDD5EE]',
      icon: <HelpCircle className="w-4 h-4 text-[#2864A0] shrink-0" aria-hidden="true" />,
      titleColor: 'text-[#1E4F80]',
    };
  }
  if (id === 'what_to_do_now') {
    return {
      container: 'bg-[#ECF7EF]/85 border-[#B8DFC3]',
      icon: <CheckCircle2 className="w-4 h-4 text-[#267D40] shrink-0" aria-hidden="true" />,
      titleColor: 'text-[#174D27]',
    };
  }
  if (id === 'what_to_avoid') {
    return {
      container: 'bg-[#FDF4E7]/90 border-[#EED3AC]',
      icon: <ShieldAlert className="w-4 h-4 text-[#B86A14] shrink-0" aria-hidden="true" />,
      titleColor: 'text-[#7C4408]',
    };
  }
  if (id === 'when_to_see_doctor') {
    return {
      container: 'bg-[#FAF7F0] border-[#E2DCD0]',
      icon: <Stethoscope className="w-4 h-4 text-[#2864A0] shrink-0" aria-hidden="true" />,
      titleColor: 'text-[#1F1B18]',
    };
  }
  return {
    container: 'bg-red-50 border-red-200',
    icon: <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />,
    titleColor: 'text-red-900',
  };
}

function getDefaultSectionHeading(id: EasyAccessSection['id']): string {
  switch (id) {
    case 'what_might_be_happening':
      return 'What might be happening?';
    case 'what_to_do_now':
      return 'What can you do now?';
    case 'what_to_avoid':
      return 'What should you avoid?';
    case 'when_to_see_doctor':
      return 'When should you see a doctor?';
    case 'when_urgent':
      return 'When is it urgent?';
    default:
      return 'Guidance';
  }
}

function buildSpeechSummary(msg: EasyAccessChatMessage): string {
  const parts: string[] = [msg.text];
  if (msg.sections && msg.sections.length > 0) {
    for (const sec of msg.sections) {
      parts.push(`${sec.heading}.`);
      if (sec.summary) parts.push(sec.summary);
      if (sec.bullets && sec.bullets.length > 0) {
        parts.push(sec.bullets.join('. '));
      }
    }
  }
  return parts.join(' ').slice(0, 1180);
}

const AUTO_SPEAK_STORAGE_KEY = 'pharmer_easy_auto_speak';

function readInitialAutoSpeak(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = window.sessionStorage.getItem(AUTO_SPEAK_STORAGE_KEY);
    return stored !== 'false';
  } catch {
    return true;
  }
}

export const EasyAccessHome: React.FC<EasyAccessHomeProps> = ({
  language,
  onLanguageChange,
  onEmergencyDetected,
  onOpenPortal,
}) => {
  const [messages, setMessages] = useState<EasyAccessChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState<boolean>(readInitialAutoSpeak);
  const [latestAiId, setLatestAiId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speechSnapshot, setSpeechSnapshot] = useState<ActiveSpeechSnapshot>({
    messageId: null,
    status: 'idle',
    errorMessage: null,
  });

  // Inline Explain-It-Back feedback keyed by AI message ID
  const [teachBackState, setTeachBackState] = useState<
    Record<
      string,
      {
        selectedChoice?: string;
        loading?: boolean;
        evaluation?: TeachBackEvaluation | null;
        error?: string | null;
      }
    >
  >({});

  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const unsub = subscribeGlobalSpeech(setSpeechSnapshot);
    return () => {
      unsub();
      stopAllSpeech();
    };
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages, isSending]);

  const toggleAutoSpeak = () => {
    setAutoSpeak((prev) => {
      const next = !prev;
      try {
        window.sessionStorage.setItem(AUTO_SPEAK_STORAGE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      if (!next) {
        stopAllSpeech();
      } else {
        unlockAudioPlayback();
      }
      return next;
    });
  };

  const handleSendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isSending) return;

    unlockAudioPlayback();
    stopAllSpeech();
    setError(null);

    const localEmergency = detectEmergencyRedFlags(trimmed);
    if (localEmergency.isEmergency) {
      onEmergencyDetected(localEmergency);
    }

    const userMsg: EasyAccessChatMessage = {
      id: `easy-u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setIsSending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextHistory.map((m) => ({ role: m.role, text: m.text })),
          roleMode: 'patient',
          language,
          easyAccess: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not reach Pharmer right now. Please try again.');
      }
      if (data.emergency?.isEmergency) {
        onEmergencyDetected(data.emergency);
        const emergencyReply: EasyAccessChatMessage = {
          id: `easy-m-${Date.now()}`,
          role: 'model',
          text: `${data.emergency.title}. ${data.emergency.guidance}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          sections: [
            {
              id: 'when_urgent',
              heading: 'When is it urgent?',
              summary: data.emergency.guidance,
              bullets: (data.emergency.helplines || []).map(
                (h: { region: string; number: string; label: string }) =>
                  `${h.region}: ${h.number} (${h.label})`
              ),
            },
          ],
        };
        setMessages((prev) => [...prev, emergencyReply]);
        setLatestAiId(emergencyReply.id);
        return;
      }

      const aiMsg: EasyAccessChatMessage = {
        id: `easy-m-${Date.now()}`,
        role: 'model',
        text: data.reply || 'I am listening. Please tell me a little more.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sections: Array.isArray(data.sections) ? data.sections : [],
        explainItBack: data.explainItBack || null,
        showHospitalPortalHint: Boolean(data.showHospitalPortalHint),
        modelUsed: data.modelUsed,
      };
      setMessages((prev) => [...prev, aiMsg]);
      setLatestAiId(aiMsg.id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to connect right now. Please try sending your message again.'
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleTeachBackChoice = async (msg: EasyAccessChatMessage, choice: string) => {
    if (!msg.explainItBack) return;
    setTeachBackState((prev) => ({
      ...prev,
      [msg.id]: { selectedChoice: choice, loading: true, evaluation: null, error: null },
    }));

    try {
      const response = await fetch('/api/teachback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetConcept: msg.explainItBack.targetConcept,
          question: msg.explainItBack.question,
          userAnswer: choice,
          documentSummary: msg.text,
          language,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not check your answer right now.');
      }
      if (data.emergency?.isEmergency) {
        onEmergencyDetected(data.emergency);
        return;
      }
      setTeachBackState((prev) => ({
        ...prev,
        [msg.id]: {
          selectedChoice: choice,
          loading: false,
          evaluation: data.evaluation as TeachBackEvaluation,
          error: null,
        },
      }));
    } catch (err) {
      setTeachBackState((prev) => ({
        ...prev,
        [msg.id]: {
          selectedChoice: choice,
          loading: false,
          evaluation: null,
          error: err instanceof Error ? err.message : 'Unable to check answer.',
        },
      }));
    }
  };

  const handleResetConversation = () => {
    stopAllSpeech();
    setMessages([]);
    setLatestAiId(null);
    setTeachBackState({});
    setError(null);
    textareaRef.current?.focus();
  };

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* A. Accessible Conversational Hero Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
        <div className="lg:col-span-8 space-y-4">
          <p className="text-xs sm:text-sm font-semibold text-[#2864A0]">
            Pharmer · Precision Guidance · Understand your health. Make informed decisions.
          </p>
          <h1
            className="font-display font-bold tracking-tight text-[#1F1B18] leading-[1.12]"
            style={{
              fontSize: 'clamp(2.15rem, 4vw, 3.35rem)',
              textWrap: 'balance',
            }}
          >
            Tell us what&apos;s troubling you.
          </h1>
          <p className="font-display text-lg sm:text-xl font-medium text-[#2864A0]">
            We&apos;re here to help you understand what to do next.
          </p>
          <p className="text-base sm:text-lg text-[#5A564E] leading-relaxed max-w-2xl">
            Speak or type in your own language. Pharmer will listen, understand, and guide you with simple health information and precautions.
          </p>
        </div>

        {/* Exact Official Approved Pharmer Logo Lockup */}
        <div className="lg:col-span-4 flex justify-center lg:justify-end">
          <div className="bg-[#F3EFE6] border border-[#E2DCD0] rounded-2xl p-5 sm:p-6 flex items-center justify-center w-full max-w-[290px]">
            <img
              src="/assets/pharmer-logo-lockup.png"
              alt="Pharmer — Precision Guidance"
              className="w-44 sm:w-52 h-auto object-contain"
            />
          </div>
        </div>
      </section>

      {/* B. Main Voice-First AI Conversation Interface */}
      <section
        aria-label="Pharmer Easy Access Health Conversation"
        className="bg-white border border-[#E2DCD0] rounded-2xl p-4 sm:p-7 space-y-5 shadow-xs"
      >
        {/* Top Controls: Language & Automatic Read-Aloud */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#E2DCD0]">
          <div className="flex items-center gap-3">
            <img
              src="/assets/pharmer-favicon.png"
              alt="Pharmer icon"
              className="w-10 h-10 object-contain rounded-lg shrink-0"
            />
            <div>
              <h2 className="font-display text-lg sm:text-xl font-semibold text-[#1F1B18]">
                Pharmer Easy Access
              </h2>
              <p className="text-xs sm:text-sm text-[#5A564E]">
                English, हिन्दी, Hinglish, or any language · No registration needed
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Choose language"
              className="flex items-center gap-1 p-1 bg-[#F3EFE6] rounded-xl"
            >
              {(
                [
                  { id: 'auto', label: 'Any' },
                  { id: 'en', label: 'English' },
                  { id: 'hi', label: 'हिन्दी' },
                  { id: 'hinglish', label: 'Hinglish' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onLanguageChange(item.id)}
                  className={`px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap min-h-[36px] ${
                    language === item.id
                      ? 'bg-white text-[#2864A0] font-semibold shadow-xs'
                      : 'text-[#5A564E] hover:text-[#1F1B18]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={toggleAutoSpeak}
              aria-pressed={autoSpeak}
              aria-label={autoSpeak ? 'Mute automatic voice reply' : 'Unmute automatic voice reply'}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-colors whitespace-nowrap min-h-[40px] ${
                autoSpeak
                  ? 'bg-[#EDF4FB] border-[#2864A0] text-[#2864A0]'
                  : 'bg-[#FAF7F0] border-[#D5CCBC] text-[#5A564E] hover:text-[#1F1B18]'
              }`}
            >
              {autoSpeak ? (
                <Volume2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              ) : (
                <VolumeX className="w-4 h-4 shrink-0" aria-hidden="true" />
              )}
              <span>{autoSpeak ? 'Voice Reply: On' : 'Muted'}</span>
            </button>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleResetConversation}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-[#1F1B18] bg-[#FAF7F0] hover:bg-[#F3EFE6] border border-[#D5CCBC] rounded-xl transition-colors whitespace-nowrap min-h-[40px]"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                New Chat
              </button>
            )}
          </div>
        </div>

        {/* Conversation Area */}
        <div className="rounded-2xl bg-[#FAF7F0] border border-[#E2DCD0] p-4 sm:p-6 min-h-[300px] max-h-[600px] overflow-y-auto space-y-5">
          {/* Friendly Greeting Always Visible at Top */}
          <div className="flex items-start gap-3 max-w-3xl">
            <img
              src="/assets/pharmer-favicon.png"
              alt=""
              aria-hidden="true"
              className="w-9 h-9 rounded-lg object-contain shrink-0 mt-0.5"
            />
            <div className="bg-white border border-[#E2DCD0] rounded-2xl p-4 sm:p-5 text-[#1F1B18] space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#2864A0]">
                <HeartHandshake className="w-4 h-4 text-[#267D40]" aria-hidden="true" />
                <span>Pharmer Health Companion</span>
              </div>
              <p className="text-base sm:text-lg leading-relaxed">
                Hello! Tell me in your own words what you are feeling or what is troubling you. You do not need to know medical words — just type below or tap <strong>Speak</strong>.
              </p>
            </div>
          </div>

          {/* One-Tap Everyday Examples when starting */}
          {messages.length === 0 && (
            <div className="pl-0 sm:pl-12 space-y-2.5">
              <p className="text-xs sm:text-sm font-medium text-[#5A564E]">
                You can write naturally, or tap an example to try right away:
              </p>
              <div className="flex flex-wrap gap-2.5">
                {EXAMPLE_PROMPTS.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    disabled={isSending}
                    onClick={() => void handleSendMessage(sample)}
                    className="text-left text-sm font-medium text-[#1F1B18] bg-white hover:bg-[#EDF4FB] border border-[#D5CCBC] hover:border-[#2864A0] rounded-xl px-4 py-2.5 transition-colors min-h-[44px]"
                  >
                    &ldquo;{sample}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Conversation Messages */}
          {messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <div
                  key={msg.id}
                  className="flex justify-end transition-opacity duration-200"
                >
                  <div className="max-w-[90%] sm:max-w-[78%] rounded-2xl bg-[#2864A0] text-white px-5 py-3.5 space-y-1">
                    <div className="text-xs text-white/80">You · {msg.timestamp}</div>
                    <p className="text-base sm:text-lg leading-relaxed whitespace-pre-wrap">
                      {msg.text}
                    </p>
                  </div>
                </div>
              );
            }

            const speechText = buildSpeechSummary(msg);
            const tb = teachBackState[msg.id];

            return (
              <div
                key={msg.id}
                className="flex items-start gap-3 max-w-4xl transition-opacity duration-200"
              >
                <img
                  src="/assets/pharmer-favicon.png"
                  alt=""
                  aria-hidden="true"
                  className="w-9 h-9 rounded-lg object-contain shrink-0 mt-0.5 hidden sm:block"
                />
                <div className="flex-1 bg-white border border-[#E2DCD0] rounded-2xl p-4 sm:p-6 space-y-4 text-[#1F1B18]">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E2DCD0]">
                    <div className="text-xs font-semibold text-[#5A564E]">
                      Pharmer · {msg.timestamp}
                    </div>
                    <SpeakAloudButton
                      messageId={msg.id}
                      text={speechText}
                      language={language}
                      label="Play Answer"
                      showControls
                      autoPlay={autoSpeak && msg.id === latestAiId}
                    />
                  </div>

                  {/* Main conversational explanation */}
                  <p className="text-base sm:text-lg leading-relaxed whitespace-pre-wrap text-[#1F1B18]">
                    {msg.text}
                  </p>

                  {/* Adaptive Health Sections */}
                  {msg.sections && msg.sections.length > 0 && (
                    <div className="grid grid-cols-1 gap-3 pt-1">
                      {msg.sections.map((sec, idx) => {
                        const style = getSectionStyle(sec.id);
                        return (
                          <div
                            key={`${sec.id}-${idx}`}
                            className={`rounded-xl border p-4 space-y-2 ${style.container}`}
                          >
                            <div className={`flex items-center gap-2 font-display text-sm sm:text-base font-semibold ${style.titleColor}`}>
                              {style.icon}
                              <span>{sec.heading?.trim() || getDefaultSectionHeading(sec.id)}</span>
                            </div>
                            {sec.summary && (
                              <p className="text-sm sm:text-base text-[#1F1B18] leading-relaxed">
                                {sec.summary}
                              </p>
                            )}
                            {sec.bullets && sec.bullets.length > 0 && (
                              <ul className="list-disc list-inside space-y-1.5 text-sm sm:text-base text-[#1F1B18] leading-relaxed">
                                {sec.bullets.map((b, bIdx) => (
                                  <li key={bIdx}>{b}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Gentle Explain-It-Back Check */}
                  {msg.explainItBack && (
                    <div className="rounded-xl bg-[#FAF7F0] border border-[#E2DCD0] p-4 space-y-3">
                      <div className="text-xs font-semibold text-[#2864A0]">
                        Do you understand? · Quick check
                      </div>
                      <p className="text-sm sm:text-base font-medium text-[#1F1B18]">
                        {msg.explainItBack.question}
                      </p>
                      {msg.explainItBack.quickOptions.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {msg.explainItBack.quickOptions.map((choice) => {
                            const selected = tb?.selectedChoice === choice;
                            return (
                              <button
                                key={choice}
                                type="button"
                                disabled={tb?.loading}
                                onClick={() => void handleTeachBackChoice(msg, choice)}
                                className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-colors text-left min-h-[40px] ${
                                  selected
                                    ? 'bg-[#2864A0] text-white border-[#2864A0]'
                                    : 'bg-white text-[#1F1B18] border-[#D5CCBC] hover:border-[#2864A0]'
                                }`}
                              >
                                {choice}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {tb?.loading && (
                        <p className="text-xs text-[#5A564E]">Checking gently...</p>
                      )}
                      {tb?.error && (
                        <p role="alert" className="text-xs text-red-800">{tb.error}</p>
                      )}
                      {tb?.evaluation && (
                        <div
                          className={`p-3 rounded-lg border text-sm space-y-1 ${
                            tb.evaluation.understood
                              ? 'bg-[#ECF7EF] border-[#B8DFC3] text-[#174D27]'
                              : 'bg-[#FDF4E7] border-[#EED3AC] text-[#7C4408]'
                          }`}
                        >
                          <p className="font-semibold">{tb.evaluation.feedback}</p>
                          {tb.evaluation.simplerAnalogy && (
                            <p className="text-xs sm:text-sm text-[#1F1B18]">
                              {tb.evaluation.simplerAnalogy}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Optional Bridge to Hospital Doctor Rooms & Booking */}
                  {msg.showHospitalPortalHint && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => onOpenPortal('patient')}
                        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#2864A0] bg-[#EDF4FB] hover:bg-[#DFECFA] border border-[#BDD5EE] rounded-xl transition-colors min-h-[44px]"
                      >
                        <Stethoscope className="w-4 h-4" aria-hidden="true" />
                        <span>Open Patient Portal to Find Doctors &amp; Book</span>
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  )}

                  <p className="text-xs text-[#5A564E] pt-1">
                    Educational guidance only — not a medical diagnosis or prescription.
                  </p>
                </div>
              </div>
            );
          })}

          {/* Clear Loading State */}
          {isSending && (
            <div className="flex items-center gap-3 pl-0 sm:pl-12">
              <div className="bg-white border border-[#E2DCD0] rounded-2xl px-5 py-3.5 flex items-center gap-3">
                <div className="flex items-center gap-1" aria-hidden="true">
                  <span className="w-2 h-2 rounded-full bg-[#2864A0] animate-bounce" />
                  <span
                    className="w-2 h-2 rounded-full bg-[#D78728] animate-bounce"
                    style={{ animationDelay: '0.15s' }}
                  />
                  <span
                    className="w-2 h-2 rounded-full bg-[#267D40] animate-bounce"
                    style={{ animationDelay: '0.3s' }}
                  />
                </div>
                <span className="text-sm font-medium text-[#5A564E]">
                  Pharmer is listening and preparing clear guidance...
                </span>
              </div>
            </div>
          )}

          <div ref={threadEndRef} />
        </div>

        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900"
          >
            {error}
          </div>
        )}

        {/* Live Two-Way Voice Speaking Status Indicator */}
        {(speechSnapshot.status === 'loading' ||
          speechSnapshot.status === 'playing' ||
          speechSnapshot.status === 'paused' ||
          speechSnapshot.status === 'completed') && (
          <div
            role="status"
            aria-live="polite"
            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${
              speechSnapshot.status === 'completed'
                ? 'bg-[#ECF7EF] border-[#B8DFC3] text-[#174D27]'
                : 'bg-[#EDF4FB] border-[#BDD5EE] text-[#1E4F80]'
            }`}
          >
            <div className="flex items-center gap-2.5 font-medium">
              {speechSnapshot.status === 'playing' && (
                <>
                  <SoundWaveBars active />
                  <span>Pharmer is speaking aloud...</span>
                </>
              )}
              {speechSnapshot.status === 'loading' && (
                <>
                  <SoundWaveBars active={false} />
                  <span>Preparing spoken answer...</span>
                </>
              )}
              {speechSnapshot.status === 'paused' && (
                <>
                  <Volume2 className="w-4 h-4 shrink-0 text-[#2864A0]" aria-hidden="true" />
                  <span>Voice playback paused</span>
                </>
              )}
              {speechSnapshot.status === 'completed' && (
                <>
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#267D40]" aria-hidden="true" />
                  <span>Finished speaking · Ready for your reply</span>
                </>
              )}
            </div>

            {(speechSnapshot.status === 'loading' ||
              speechSnapshot.status === 'playing' ||
              speechSnapshot.status === 'paused') && (
              <button
                type="button"
                onClick={stopAllSpeech}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1F1B18] hover:bg-black rounded-lg transition-colors whitespace-nowrap min-h-[34px]"
              >
                <Square className="w-3 h-3 fill-current" aria-hidden="true" />
                Stop Speaking
              </button>
            )}
          </div>
        )}

        {/* Voice-First & Large Input Area */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSendMessage(input);
          }}
          className="space-y-3"
        >
          <label htmlFor="easy-access-input" className="sr-only">
            Tell me what you&apos;re feeling or what is troubling you
          </label>
          <textarea
            ref={textareaRef}
            id="easy-access-input"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSendMessage(input);
              }
            }}
            disabled={isSending}
            placeholder="Tell me what you're feeling or what is troubling you..."
            className="w-full rounded-xl border border-[#D5CCBC] bg-white px-4 py-3.5 text-base sm:text-lg text-[#1F1B18] placeholder:text-[#787266] focus:border-[#2864A0] focus:outline-none focus:ring-2 focus:ring-[#2864A0]/20 min-h-[76px]"
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <AudioTranscribeButton
                variant="prominent"
                language={language}
                label="Speak (Any Language)"
                disabled={isSending}
                onBeforeStart={() => stopAllSpeech()}
                onTranscript={(spoken) => {
                  setInput(spoken);
                  void handleSendMessage(spoken);
                }}
              />
              <span className="text-xs sm:text-sm text-[#5A564E]">
                {speechSnapshot.status === 'playing'
                  ? 'Pharmer is speaking — tap Speak anytime to interrupt and reply'
                  : 'Tap Speak to talk instead of typing · Press Enter to send'}
              </span>
            </div>

            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-base font-semibold text-white bg-[#2864A0] hover:bg-[#1E5082] disabled:bg-slate-300 rounded-xl transition-colors whitespace-nowrap shrink-0 min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#2864A0]"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span>Send</span>
            </button>
          </div>
        </form>
      </section>

      {/* C. Gentle Bridge to Pharmer Specialised Platform */}
      <section
        aria-label="Explore Specialised Pharmer Portals"
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <div className="bg-white border border-[#E2DCD0] rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#2864A0]">
              <UserCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Pharmer Patient Portal</span>
            </div>
            <h3 className="font-display text-lg font-semibold text-[#1F1B18]">
              Hospital wayfinding, doctor booking &amp; report decoder
            </h3>
            <p className="text-sm text-[#5A564E] leading-relaxed">
              Find exact doctor rooms inside partner hospitals, book free meeting times, scan lab reports or prescriptions, and use continuous live voice chat.
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => onOpenPortal('patient')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#2864A0] bg-[#EDF4FB] hover:bg-[#DFECFA] border border-[#BDD5EE] rounded-xl transition-colors whitespace-nowrap min-h-[44px]"
            >
              <span>Explore Patient Portal</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="bg-white border border-[#E2DCD0] rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#B86A14]">
              <Building2 className="w-4 h-4 text-[#D78728] shrink-0" aria-hidden="true" />
              <span>Pharmer Hospital Portal</span>
            </div>
            <h3 className="font-display text-lg font-semibold text-[#1F1B18]">
              Hospital teams: manage doctors, room locations &amp; slots
            </h3>
            <p className="text-sm text-[#5A564E] leading-relaxed">
              Register your hospital, publish doctor specialties with floor, wing, and room directions, and keep available appointment times updated for patients.
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => onOpenPortal('hospital')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#9A550C] bg-[#FDF4E7] hover:bg-[#F9E7CC] border border-[#EED3AC] rounded-xl transition-colors whitespace-nowrap min-h-[44px]"
            >
              <span>Explore Hospital Portal</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
