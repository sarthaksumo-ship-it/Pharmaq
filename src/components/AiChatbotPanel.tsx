import React, { useEffect, useRef, useState } from 'react';
import { Calendar, MapPin, MessageSquare, RotateCcw, Send, Stethoscope } from 'lucide-react';
import { AudioTranscribeButton } from './AudioTranscribeButton';
import { SpeakAloudButton } from './SpeakAloudButton';
import { detectEmergencyRedFlags } from '../utils/safety';
import type {
  Appointment,
  ChatMessage,
  Doctor,
  EmergencyCheckResult,
  Hospital,
  LanguageMode,
  MeetingSlot,
  UserRole,
} from '../types/medmate';

interface AiChatbotPanelProps {
  roleMode: UserRole;
  language: LanguageMode;
  onLanguageChange: (lang: LanguageMode) => void;
  selectedHospital: Hospital | null;
  hospitalContext: string;
  doctors: Doctor[];
  slots: MeetingSlot[];
  onEmergencyDetected: (emergency: EmergencyCheckResult) => void;
  onBookSlot: (params: {
    hospital: Hospital;
    slot: MeetingSlot;
    symptomSummary: string;
  }) => Promise<Appointment | null>;
}

export const AiChatbotPanel: React.FC<AiChatbotPanelProps> = ({
  roleMode,
  language,
  onLanguageChange,
  selectedHospital,
  hospitalContext,
  doctors,
  slots,
  onEmergencyDetected,
  onBookSlot,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingFeedback, setBookingFeedback] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (messages.length > 0 && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const starterPrompts =
    roleMode === 'hospital'
      ? [
          'Write simple room directions for a first-time visitor',
          'Translate cardiology OPD instructions into simple Hindi',
          'How should we organize morning follow-up slots?',
        ]
      : [
          'I have fever and throat pain — what precautions and doctor should I see?',
          'Mujhe chakkar aa rahe hain, kaunse doctor ke paas jaun?',
          'Where is the doctor room and which slot is free today?',
        ];

  const handleSendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isSending) return;

    setError(null);
    setBookingFeedback(null);

    const localEmergency = detectEmergencyRedFlags(trimmed);
    if (localEmergency.isEmergency) {
      onEmergencyDetected(localEmergency);
      return;
    }

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
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
          roleMode,
          language,
          hospitalContext,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not reach Pharmer AI assistant right now.');
      }
      if (data.emergency?.isEmergency) {
        onEmergencyDetected(data.emergency);
        return;
      }

      const aiMsg: ChatMessage = {
        id: `m-${Date.now()}`,
        role: 'model',
        text: data.reply || 'I am here to help.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        precautions: Array.isArray(data.precautions) ? data.precautions : [],
        recommendedDoctorId: data.recommendedDoctorId || '',
        recommendedSlotId: data.recommendedSlotId || '',
        modelUsed: data.modelUsed || 'gemini-4-hydrogen',
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setIsSending(false);
    }
  };

  const handleInlineBook = async (slot: MeetingSlot) => {
    if (!selectedHospital) return;
    setError(null);
    try {
      const lastUserPrompt =
        [...messages].reverse().find((m) => m.role === 'user')?.text || 'Chatbot consultation';
      const appt = await onBookSlot({
        hospital: selectedHospital,
        slot,
        symptomSummary: lastUserPrompt,
      });
      if (appt) {
        setBookingFeedback(
          `Booked ${appt.doctorName} on ${appt.date} (${appt.timeLabel}). Go to: ${appt.roomLocation}.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2DCD0]">
        <div>
          <div className="text-xs text-[#5A564E]">
            <span>Pharmer AI Chatbot</span>
            <span aria-hidden="true"> · </span>
            <span>{roleMode === 'hospital' ? 'Hospital Staff Mode' : 'Patient Companion Mode'}</span>
            {selectedHospital && (
              <>
                <span aria-hidden="true"> · </span>
                <span>{selectedHospital.name}</span>
              </>
            )}
          </div>
          <h3 className="font-display text-lg font-semibold text-[#1F1B18] mt-0.5">
            Chat or speak in any language
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Chat language" className="flex items-center gap-1 p-1 bg-[#F3EFE6] rounded-lg">
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
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  language === item.id
                    ? 'bg-white text-[#1F1B18] shadow-xs'
                    : 'text-[#5A564E] hover:text-[#1F1B18]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setBookingFeedback(null);
                setError(null);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#5A564E] hover:text-[#1F1B18] bg-[#F3EFE6] hover:bg-[#E8E2D4] rounded-lg"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              New Chat
            </button>
          )}
        </div>
      </div>

      {/* Quick Starter Chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[#5A564E]">Try asking:</span>
        {starterPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={isSending}
            onClick={() => handleSendMessage(prompt)}
            className="text-xs font-medium text-[#2864A0] bg-[#EDF4FB] hover:bg-[#DFECFA] border border-[#BDD5EE] rounded-lg px-3 py-1.5 transition-colors text-left"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Scrollable Conversation Thread */}
      <div
        ref={scrollRef}
        className="rounded-xl border border-[#E2DCD0] bg-[#FAF7F0] p-4 min-h-[240px] max-h-[380px] overflow-y-auto space-y-3"
      >
        {messages.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-center px-4">
            <MessageSquare className="w-6 h-6 text-[#D78728] mb-2" aria-hidden="true" />
            <p className="text-sm font-medium text-[#1F1B18]">
              Ask about symptoms, safe precautions, medicines, or where to find your doctor
            </p>
            <p className="text-xs text-[#5A564E] mt-1 max-w-md">
              Tap the Speak button below if you prefer talking instead of typing. Every reply can also be read aloud.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const matchedDoc = msg.recommendedDoctorId
              ? doctors.find((d) => d.id === msg.recommendedDoctorId)
              : undefined;
            const matchedSlot = msg.recommendedSlotId
              ? slots.find((s) => s.id === msg.recommendedSlotId && s.status === 'available')
              : matchedDoc
              ? slots.find((s) => s.doctorId === matchedDoc.id && s.status === 'available')
              : undefined;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#2864A0] text-white'
                      : 'bg-white border border-[#E2DCD0] text-[#1F1B18] space-y-2.5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 text-[11px] opacity-80">
                    <span>
                      {msg.role === 'user' ? 'You' : 'Pharmer'} · {msg.timestamp}
                    </span>
                    {msg.role === 'model' && (
                      <SpeakAloudButton
                        compact
                        language={language}
                        label="Listen"
                        text={`${msg.text} ${msg.precautions?.length ? `Precautions: ${msg.precautions.join('. ')}` : ''}`}
                      />
                    )}
                  </div>

                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {msg.precautions && msg.precautions.length > 0 && (
                    <div className="p-2.5 rounded-lg bg-[#FAF7F0] border border-[#E2DCD0] text-xs text-[#5A564E]">
                      <div className="font-semibold text-[#1F1B18] mb-1">Safe precautions:</div>
                      <ul className="list-disc list-inside space-y-0.5">
                        {msg.precautions.map((p, idx) => (
                          <li key={idx}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {matchedDoc && (
                    <div className="p-3 rounded-lg bg-[#EDF4FB]/70 border border-[#BDD5EE] text-xs space-y-1.5">
                      <div className="font-semibold text-[#1F1B18] flex items-center gap-1.5">
                        <Stethoscope className="w-3.5 h-3.5 text-[#2864A0] shrink-0" aria-hidden="true" />
                        {matchedDoc.name} ({matchedDoc.specialty})
                      </div>
                      <div className="text-[#1F1B18] flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#D78728] shrink-0" aria-hidden="true" />
                        <span>
                          <strong>{matchedDoc.floorWing}</strong> · <strong>{matchedDoc.roomNumber}</strong>
                        </span>
                      </div>
                      <p className="text-[#5A564E]">{matchedDoc.directionsNote}</p>
                      {matchedSlot && (
                        <button
                          type="button"
                          onClick={() => handleInlineBook(matchedSlot)}
                          className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#2864A0] hover:bg-[#1E5082] rounded-md transition-colors"
                        >
                          <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                          Book Free Slot ({matchedSlot.date} · {matchedSlot.timeLabel})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {isSending && (
          <div className="text-xs text-[#5A564E] px-2">Pharmer is thinking...</div>
        )}
      </div>

      {bookingFeedback && (
        <div role="status" className="p-3 rounded-xl bg-[#ECF7EF] border border-[#B8DFC3] text-xs text-[#174D27]">
          {bookingFeedback}
        </div>
      )}

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900">
          {error}
        </div>
      )}

      {/* Input Row with Speech Transcription + Send */}
      <form
        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSendMessage(input);
        }}
      >
        <AudioTranscribeButton
          compact
          label="Speak"
          disabled={isSending}
          onTranscript={(spoken) => {
            setInput(spoken);
            void handleSendMessage(spoken);
          }}
        />
        <label htmlFor="chatbot-input" className="sr-only">
          Type a message to Pharmer AI chatbot
        </label>
        <input
          id="chatbot-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isSending}
          placeholder="Type your message to Pharmer in any language, or tap Speak..."
          className="flex-1 rounded-lg border border-[#D5CCBC] px-3.5 py-2.5 text-sm text-[#1F1B18] focus:border-[#2864A0] focus:outline-none focus:ring-2 focus:ring-[#2864A0]/20 min-h-[42px]"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#1F1B18] hover:bg-[#342E29] disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[42px]"
        >
          <Send className="w-4 h-4" aria-hidden="true" />
          Send
        </button>
      </form>
    </div>
  );
};
