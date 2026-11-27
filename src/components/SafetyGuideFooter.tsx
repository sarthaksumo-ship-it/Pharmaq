import React from 'react';
import { ShieldCheck } from 'lucide-react';

export const SafetyGuideFooter: React.FC = () => {
  return (
    <footer
      id="safety-guide"
      className="border-t border-[#E2DCD0] bg-[#FAF7F0] mt-12"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-9">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-sm text-[#5A564E]">
          <div className="flex flex-col items-start">
            <div className="bg-[#F3EFE6] border border-[#E2DCD0] rounded-xl p-2.5">
              <img
                src="/assets/pharmer-logo-lockup.png"
                alt="Pharmer — Precision Guidance"
                className="h-20 w-auto object-contain"
              />
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-[#5A564E]">
              Precision Guidance for patients, families, and hospital care teams.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 font-display font-semibold text-[#1F1B18]">
              <ShieldCheck className="w-4 h-4 text-[#267D40]" aria-hidden="true" />
              Responsible Health Education
            </div>
            <p className="mt-2 text-xs leading-relaxed">
              Pharmer translates medical jargon into plain language to help patients and caregivers make informed decisions with their doctors. It does not diagnose conditions, prescribe medicines, or replace licensed clinical judgment.
            </p>
          </div>

          <div>
            <div className="font-display font-semibold text-[#1F1B18]">
              Privacy-First Handling
            </div>
            <p className="mt-2 text-xs leading-relaxed">
              Detected patient names, phone numbers, emails, and medical IDs are masked before AI analysis. Uploaded images and report text are processed temporarily and never saved to permanent storage.
            </p>
          </div>

          <div>
            <div className="font-display font-semibold text-[#1F1B18]">
              Emergency Notice
            </div>
            <p className="mt-2 text-xs leading-relaxed">
              For chest pain, trouble breathing, sudden weakness, severe bleeding, or mental health crisis, contact local emergency services immediately (India: <span className="font-mono">112 / 108</span> · US/Canada: <span className="font-mono">911</span> · UK: <span className="font-mono">999</span>).
            </p>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-[#E2DCD0] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#5A564E]">
          <span>Pharmer · Precision Guidance</span>
          <span>Educational companion only · Confirm dosing with your doctor or pharmacist</span>
        </div>
      </div>
    </footer>
  );
};
