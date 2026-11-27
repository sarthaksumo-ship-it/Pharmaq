import React from 'react';
import { AlertTriangle, PhoneCall, X } from 'lucide-react';
import type { EmergencyCheckResult } from '../types/medmate';

interface EmergencyBannerProps {
  emergency: EmergencyCheckResult;
  onDismiss?: () => void;
}

export const EmergencyBanner: React.FC<EmergencyBannerProps> = ({ emergency, onDismiss }) => {
  if (!emergency.isEmergency) return null;

  return (
    <section
      role="alert"
      aria-live="assertive"
      className="bg-red-50 border border-red-300 rounded-xl p-5 sm:p-6 text-slate-900"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 p-2 rounded-lg bg-red-100 text-red-700 shrink-0">
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-semibold text-red-800">Urgent Care Alert</p>
            <h2 className="font-display text-lg font-semibold text-red-950 mt-0.5">
              {emergency.title}
            </h2>
            <p className="text-sm text-red-900 mt-2 leading-relaxed max-w-3xl">
              {emergency.guidance}
            </p>
            {emergency.matchedCategories.length > 0 && (
              <p className="text-xs text-red-800 mt-2">
                Detected concern: {emergency.matchedCategories.join(' · ')}
              </p>
            )}
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss urgent care alert"
            className="p-2 text-red-700 hover:bg-red-100 rounded-lg transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-red-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {emergency.helplines.map((line) => (
          <div
            key={`${line.region}-${line.number}`}
            className="bg-white/90 rounded-lg p-3 flex items-center gap-3"
          >
            <PhoneCall className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-xs text-slate-600 truncate">{line.region}</div>
              <div className="font-mono tabular-nums text-sm font-semibold text-red-900">
                {line.number}
              </div>
              <div className="text-xs text-slate-500 truncate">{line.label}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
