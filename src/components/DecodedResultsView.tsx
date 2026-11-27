import React, { useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  ExternalLink,
  HelpCircle,
  Mic,
  Moon,
  Sun,
  Sunset,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  DecodedDocument,
  FoodTiming,
  LabStatus,
  LanguageMode,
  TeachBackEvaluation,
} from '../types/medmate';

interface DecodedResultsViewProps {
  decoded: DecodedDocument;
  language: LanguageMode;
  onAskByVoice: () => void;
  onEvaluateTeachBack: (answer: string) => Promise<TeachBackEvaluation | null>;
}

const FOOD_TIMING_LABELS: Record<FoodTiming, string> = {
  before_food: '30 mins before food',
  after_food: 'After food',
  empty_stomach: 'Empty stomach (morning)',
  with_food: 'With a meal',
  as_needed: 'Only when needed (SOS)',
};

function getLabStatusStyle(status: LabStatus): {
  label: string;
  textClass: string;
  barClass: string;
  bgClass: string;
} {
  switch (status) {
    case 'normal':
      return {
        label: 'Normal range',
        textClass: 'text-emerald-800',
        barClass: 'bg-emerald-600',
        bgClass: 'bg-emerald-50 border-emerald-200',
      };
    case 'borderline':
      return {
        label: 'Borderline — review with doctor',
        textClass: 'text-amber-800',
        barClass: 'bg-amber-600',
        bgClass: 'bg-amber-50 border-amber-200',
      };
    case 'attention':
      return {
        label: 'Outside reference — discuss with doctor',
        textClass: 'text-red-800',
        barClass: 'bg-red-600',
        bgClass: 'bg-red-50 border-red-200',
      };
    default:
      return {
        label: 'Unclear — confirm with lab',
        textClass: 'text-slate-700',
        barClass: 'bg-slate-500',
        bgClass: 'bg-slate-50 border-slate-200',
      };
  }
}

export const DecodedResultsView: React.FC<DecodedResultsViewProps> = ({
  decoded,
  language,
  onAskByVoice,
  onEvaluateTeachBack,
}) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [teachBackInput, setTeachBackInput] = useState('');
  const [isGrading, setIsGrading] = useState(false);
  const [evaluation, setEvaluation] = useState<TeachBackEvaluation | null>(null);
  const [teachBackError, setTeachBackError] = useState<string | null>(null);
  const [copiedChecklist, setCopiedChecklist] = useState(false);

  const handleToggleSpeech = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const spokenText = `${decoded.title}. ${decoded.plainSummary} ${decoded.analogy ? `Think of it like this: ${decoded.analogy}` : ''}`;
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.95;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleSubmitTeachBack = async (answerToCheck: string) => {
    const trimmed = answerToCheck.trim();
    if (!trimmed) {
      setTeachBackError('Please pick a choice or type a short answer first.');
      return;
    }
    setTeachBackError(null);
    setIsGrading(true);
    try {
      const res = await onEvaluateTeachBack(trimmed);
      if (res) {
        setEvaluation(res);
      }
    } catch (err) {
      setTeachBackError(err instanceof Error ? err.message : 'Unable to check answer right now.');
    } finally {
      setIsGrading(false);
    }
  };

  const handleCopyDoctorChecklist = async () => {
    const lines = [
      `${decoded.title} — Questions for My Doctor`,
      '',
      ...decoded.doctorQuestions.map((q, i) => `${i + 1}. ${q}`),
      '',
      `Note: ${decoded.safetyNotice}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(lines);
      setCopiedChecklist(true);
      setTimeout(() => setCopiedChecklist(false), 2500);
    } catch {
      // Fallback ignored gracefully
    }
  };

  return (
    <div className="space-y-6">
      {/* Plain-Language Summary Card */}
      <section className="bg-white border border-[#E2DCD0] rounded-2xl p-5 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="text-xs text-[#5A564E]">
              <span>2. Plain-Language Explanation</span>
              <span aria-hidden="true"> · </span>
              <span>
                {decoded.redactionInfo.redactionCount > 0
                  ? `${decoded.redactionInfo.redactionCount} personal detail(s) masked`
                  : 'Educational guide only'}
              </span>
            </div>
            <h2 className="font-display text-2xl font-semibold text-[#1F1B18] mt-1">
              {decoded.title}
            </h2>
            <p className="text-base text-[#5A564E] mt-3 leading-relaxed">
              {decoded.plainSummary}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleToggleSpeech}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#1F1B18] bg-[#FAF7F0] hover:bg-[#F3EFE6] border border-[#E2DCD0] rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[42px]"
            >
              {isSpeaking ? (
                <>
                  <VolumeX className="w-4 h-4 text-[#2864A0]" aria-hidden="true" />
                  Stop Reading
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 text-[#2864A0]" aria-hidden="true" />
                  Listen Aloud
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onAskByVoice}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#2864A0] hover:bg-[#1E5082] rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[42px]"
            >
              <Mic className="w-4 h-4" aria-hidden="true" />
              Discuss by Voice
            </button>
          </div>
        </div>

        {decoded.analogy && (
          <div className="mt-5 p-4 rounded-xl bg-[#EDF4FB]/70 border border-[#BDD5EE]">
            <div className="text-xs font-semibold text-[#2864A0]">Everyday Comparison</div>
            <p className="text-sm text-[#1F1B18] mt-1 leading-relaxed">{decoded.analogy}</p>
          </div>
        )}
      </section>

      {/* Lab Biomarkers Visual Breakdown */}
      {decoded.labItems.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-4 border-b border-slate-200">
            <h3 className="font-display text-lg font-semibold text-slate-900">
              Lab Numbers Explained
            </h3>
            <p className="text-xs text-slate-500">
              Reference intervals vary by laboratory, age, and medical history.
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {decoded.labItems.map((item, idx) => {
              const style = getLabStatusStyle(item.status);
              const markerPos = Math.max(4, Math.min(96, item.rangePositionPercent ?? 50));

              return (
                <div key={`${item.name}-${idx}`} className="py-5 first:pt-4 last:pb-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-display text-base font-semibold text-slate-900">
                        {item.name}
                      </h4>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Printed lab range:{' '}
                        <span className="font-mono tabular-nums text-slate-700">
                          {item.referenceRange || 'Check printed sheet'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono tabular-nums text-lg font-semibold text-slate-900">
                        {item.value} {item.unit}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border ${style.bgClass} ${style.textClass}`}
                      >
                        {item.status === 'normal' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        )}
                        {style.label}
                      </span>
                    </div>
                  </div>

                  {/* Visual Reference Bar */}
                  <div className="mt-3" aria-hidden="true">
                    <div className="relative h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className="absolute inset-y-0 left-[15%] right-[15%] bg-emerald-100" />
                      <div
                        className={`absolute top-0 bottom-0 w-2.5 -ml-1.25 rounded-full ${style.barClass}`}
                        style={{ left: `${markerPos}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-sm text-slate-700 mt-3 leading-relaxed">
                    {item.simpleExplanation}
                  </p>
                  {item.whyItMatters && (
                    <p className="text-xs text-slate-600 mt-1.5">
                      <strong className="font-semibold text-slate-800">Why doctors check it:</strong>{' '}
                      {item.whyItMatters}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Medicine Schedule Timeline */}
      {decoded.medicines.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-4 border-b border-slate-200">
            <h3 className="font-display text-lg font-semibold text-slate-900">
              Daily Medicine Schedule & Precautions
            </h3>
            <p className="text-xs text-slate-500">
              Always match medicine name and strength on the physical strip before taking.
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {decoded.medicines.map((med, idx) => (
              <div key={`${med.name}-${idx}`} className="py-5 first:pt-4 last:pb-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-xs text-slate-500">
                      {med.drugClass} · {FOOD_TIMING_LABELS[med.foodTiming] || med.foodTiming}
                    </div>
                    <h4 className="font-display text-base font-semibold text-slate-900 mt-0.5">
                      {med.name}{' '}
                      {med.strength && (
                        <span className="font-mono tabular-nums text-sm font-medium text-slate-700">
                          {med.strength}
                        </span>
                      )}
                    </h4>
                  </div>

                  {med.confidence === 'check_label' && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      Verify spelling with pharmacist
                    </span>
                  )}
                </div>

                {/* Morning / Afternoon / Night Visual Timeline */}
                <div className="mt-3 grid grid-cols-3 gap-2.5">
                  {[
                    { key: 'morning', label: 'Morning', value: med.schedule.morning, Icon: Sun },
                    { key: 'afternoon', label: 'Afternoon', value: med.schedule.afternoon, Icon: Sunset },
                    { key: 'night', label: 'Night', value: med.schedule.night, Icon: Moon },
                  ].map(({ key, label, value, Icon }) => {
                    const isActive = value && value.toLowerCase() !== 'none' && value !== '0';
                    return (
                      <div
                        key={key}
                        className={`p-2.5 rounded-lg border text-xs ${
                          isActive
                            ? 'bg-teal-50/50 border-teal-200 text-slate-900'
                            : 'bg-slate-50 border-slate-200 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-medium">
                          <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          {label}
                        </div>
                        <div className="font-mono tabular-nums font-semibold mt-1">
                          {value || 'None'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-sm text-slate-700 mt-3 leading-relaxed">{med.purpose}</p>

                {med.keyPrecautions.length > 0 && (
                  <ul className="mt-2.5 space-y-1 text-xs text-slate-700 list-disc list-inside">
                    {med.keyPrecautions.map((precaution, pIdx) => (
                      <li key={pIdx}>{precaution}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Signature Differentiator: Closed-Loop Explain-It-Back Check */}
      <section
        aria-labelledby="teachback-heading"
        className="bg-white border border-[#BDD5EE] rounded-2xl p-5 sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#2864A0]">
              3. Explain-It-Back Check · {decoded.teachBack.targetConcept}
            </div>
            <h3 id="teachback-heading" className="font-display text-lg font-semibold text-[#1F1B18] mt-1">
              Let’s make sure this key safety point feels clear
            </h3>
          </div>
          {evaluation?.understood && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#174D27] bg-[#ECF7EF] border border-[#B8DFC3] px-3 py-1 rounded-md shrink-0">
              <CheckCircle2 className="w-4 h-4 text-[#267D40]" aria-hidden="true" />
              Understood
            </span>
          )}
        </div>

        <p className="text-base text-[#1F1B18] mt-3 font-medium">
          {decoded.teachBack.question}
        </p>

        {decoded.teachBack.quickOptions.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-2">
            {decoded.teachBack.quickOptions.map((option, idx) => (
              <button
                key={idx}
                type="button"
                disabled={isGrading}
                onClick={() => {
                  setTeachBackInput(option);
                  handleSubmitTeachBack(option);
                }}
                className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors min-h-[44px] ${
                  teachBackInput === option
                    ? 'border-[#2864A0] bg-[#EDF4FB] text-[#1F1B18] font-medium'
                    : 'border-[#E2DCD0] hover:border-[#2864A0] hover:bg-[#FAF7F0] text-[#5A564E]'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        <form
          className="mt-4 flex flex-col sm:flex-row gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmitTeachBack(teachBackInput);
          }}
        >
          <label htmlFor="teachback-input" className="sr-only">
            Explain it back in your own words
          </label>
          <input
            id="teachback-input"
            type="text"
            value={teachBackInput}
            onChange={(e) => setTeachBackInput(e.target.value)}
            placeholder="Or type in your own words how you plan to follow this..."
            className="flex-1 rounded-lg border border-[#D5CCBC] px-3.5 py-2.5 text-sm text-[#1F1B18] focus:border-[#2864A0] focus:outline-none focus:ring-2 focus:ring-[#2864A0]/20 min-h-[42px]"
          />
          <button
            type="submit"
            disabled={isGrading || !teachBackInput.trim()}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-[#2864A0] hover:bg-[#1E5082] disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[42px]"
          >
            {isGrading ? 'Checking...' : 'Check Understanding'}
          </button>
        </form>

        {decoded.teachBack.hint && !evaluation && (
          <p className="text-xs text-[#5A564E] mt-2.5 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            Hint: {decoded.teachBack.hint}
          </p>
        )}

        {teachBackError && (
          <p role="alert" className="text-sm text-red-700 mt-3">
            {teachBackError}
          </p>
        )}

        {evaluation && (
          <div
            className={`mt-4 p-4 rounded-xl border ${
              evaluation.understood
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                : 'bg-amber-50/80 border-amber-200 text-amber-950'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              {evaluation.understood ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                  Great job — you’ve got the safe takeaway!
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-700" aria-hidden="true" />
                  Let’s look at that one more time together
                </>
              )}
            </div>
            <p className="text-sm mt-1.5 leading-relaxed">{evaluation.feedback}</p>
            {evaluation.simplerAnalogy && (
              <p className="text-sm mt-2 leading-relaxed">
                <strong>Simpler picture:</strong> {evaluation.simplerAnalogy}
              </p>
            )}
            {evaluation.followUpPrompt && (
              <p className="text-xs mt-2 opacity-85">{evaluation.followUpPrompt}</p>
            )}
          </div>
        )}
      </section>

      {/* Questions for My Doctor + Verified Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Questions to Ask Your Doctor
            </h3>
            <button
              type="button"
              onClick={handleCopyDoctorChecklist}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[34px]"
            >
              {copiedChecklist ? (
                <>
                  <ClipboardCheck className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  Copy List
                </>
              )}
            </button>
          </div>
          <ol className="space-y-2 text-sm text-slate-700 list-decimal list-inside">
            {decoded.doctorQuestions.map((q, idx) => (
              <li key={idx} className="leading-relaxed">
                {q}
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-teal-700" aria-hidden="true" />
            <h3 className="font-display text-base font-semibold text-slate-900">
              Trusted Educational References
            </h3>
          </div>
          <ul className="space-y-2.5 text-sm">
            {decoded.sources.map((src) => (
              <li key={src.url}>
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start justify-between gap-2 text-slate-700 hover:text-teal-800"
                >
                  <div>
                    <div className="font-medium group-hover:underline">{src.title}</div>
                    <div className="text-xs text-slate-500">{src.organization}</div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 mt-1 shrink-0 text-slate-400 group-hover:text-teal-700" />
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500 mt-4 pt-3 border-t border-slate-200">
            {decoded.safetyNotice}
          </p>
        </section>
      </div>
    </div>
  );
};
