import React, { useState } from 'react';
import { CalendarCheck2 } from 'lucide-react';
import type { DoctorPrepResult, EmergencyCheckResult, LanguageMode } from '../types/medmate';

interface DoctorPrepPanelProps {
  language: LanguageMode;
  onEmergencyDetected: (emergency: EmergencyCheckResult) => void;
}

export const DoctorPrepPanel: React.FC<DoctorPrepPanelProps> = ({
  language,
  onEmergencyDetected,
}) => {
  const [concern, setConcern] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prep, setPrep] = useState<DoctorPrepResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!concern.trim()) {
      setError('Please describe what you would like to ask your doctor about.');
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const response = await fetch('/api/doctor-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concern, language }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not prepare your doctor visit checklist.');
      }
      if (data.emergency?.isEmergency) {
        onEmergencyDetected(data.emergency);
        setPrep(null);
        return;
      }
      setPrep(data.prep);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect right now.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section
      id="doctor-prep"
      aria-labelledby="doctor-prep-heading"
      className="bg-white border border-[#E2DCD0] rounded-2xl p-5 sm:p-8"
    >
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 text-xs font-medium text-[#2864A0]">
          <CalendarCheck2 className="w-4 h-4" aria-hidden="true" />
          Doctor Visit Preparation
        </div>
        <h2 id="doctor-prep-heading" className="font-display text-xl sm:text-2xl font-semibold text-[#1F1B18] mt-1">
          Not sure what to ask at your appointment?
        </h2>
        <p className="text-sm text-[#5A564E] mt-1">
          Share a health concern or symptom note. Pharmer will never diagnose—instead, it organizes practical questions and records to bring to your clinician.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col sm:flex-row gap-3">
        <label htmlFor="doctor-prep-input" className="sr-only">
          Describe what you want to prepare for your doctor visit
        </label>
        <input
          id="doctor-prep-input"
          type="text"
          value={concern}
          onChange={(e) => setConcern(e.target.value)}
          placeholder="Example: Feeling tired for 2 weeks and my TSH report came back slightly high..."
          className="flex-1 rounded-lg border border-[#D5CCBC] px-4 py-2.5 text-sm text-[#1F1B18] focus:border-[#2864A0] focus:outline-none focus:ring-2 focus:ring-[#2864A0]/20 min-h-[44px]"
        />
        <button
          type="submit"
          disabled={isLoading || !concern.trim()}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-[#1F1B18] hover:bg-[#342E29] disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
        >
          {isLoading ? 'Preparing...' : 'Build Visit Checklist'}
        </button>
      </form>

      {error && (
        <div role="alert" className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900">
          {error}
        </div>
      )}

      {prep && (
        <div className="mt-6 pt-6 border-t border-[#E2DCD0] grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h3 className="font-display text-sm font-semibold text-[#1F1B18]">
              Questions to Ask
            </h3>
            <ul className="mt-2 space-y-2 text-sm text-[#5A564E] list-disc list-inside">
              {prep.questionsToAsk?.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-display text-sm font-semibold text-[#1F1B18]">
              What to Bring With You
            </h3>
            <ul className="mt-2 space-y-2 text-sm text-[#5A564E] list-disc list-inside">
              {prep.whatToBring?.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-display text-sm font-semibold text-red-900">
              Seek Care Sooner If You Notice
            </h3>
            <ul className="mt-2 space-y-2 text-sm text-red-900/90 list-disc list-inside">
              {prep.whenToSeekUrgentCare?.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
};
