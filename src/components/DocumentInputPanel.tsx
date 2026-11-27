import React, { useMemo, useRef } from 'react';
import { FileText, ShieldCheck, Upload, X } from 'lucide-react';
import { ANONYMIZED_SAMPLE_CASES } from '../data/medicalData';
import { redactPii } from '../utils/safety';
import type { LanguageMode, ReadingLevel } from '../types/medmate';

interface DocumentInputPanelProps {
  text: string;
  onTextChange: (value: string) => void;
  imagePreviewUrl: string | null;
  imageName: string | null;
  onImageSelect: (file: File) => void;
  onClearImage: () => void;
  language: LanguageMode;
  onLanguageChange: (lang: LanguageMode) => void;
  readingLevel: ReadingLevel;
  onReadingLevelChange: (level: ReadingLevel) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  error: string | null;
}

export const DocumentInputPanel: React.FC<DocumentInputPanelProps> = ({
  text,
  onTextChange,
  imagePreviewUrl,
  imageName,
  onImageSelect,
  onClearImage,
  language,
  onLanguageChange,
  readingLevel,
  onReadingLevelChange,
  onAnalyze,
  isAnalyzing,
  error,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const privacyPreview = useMemo(() => redactPii(text), [text]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageSelect(file);
    }
    e.target.value = '';
  };

  return (
    <section
      id="decode-section"
      aria-labelledby="decode-heading"
      className="bg-white border border-[#E2DCD0] rounded-2xl p-5 sm:p-8"
    >
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-[#E2DCD0]">
        <div>
          <h2 id="decode-heading" className="font-display text-xl sm:text-2xl font-semibold text-[#1F1B18]">
            1. Share a report, prescription, or health note
          </h2>
          <p className="text-sm text-[#5A564E] mt-1 max-w-2xl">
            Pick a sample below, upload a clear photo, or paste text. Personal details like names and phone numbers are masked before analysis.
          </p>
        </div>

        {/* Language & Reading Style Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Explanation language" className="flex items-center gap-1 p-1 bg-[#F3EFE6] rounded-lg">
            {(
              [
                { id: 'auto', label: 'Any Language' },
                { id: 'en', label: 'English' },
                { id: 'hi', label: 'हिन्दी (सरल)' },
                { id: 'hinglish', label: 'Hinglish' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onLanguageChange(item.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 min-h-[34px] ${
                  language === item.id
                    ? 'bg-white text-[#1F1B18] shadow-xs'
                    : 'text-[#5A564E] hover:text-[#1F1B18]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div role="group" aria-label="Explanation style" className="flex items-center gap-1 p-1 bg-[#F3EFE6] rounded-lg">
            {(
              [
                { id: 'simple', label: 'Simple' },
                { id: 'caregiver', label: 'Caregiver' },
                { id: 'standard', label: 'Detailed' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onReadingLevelChange(item.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 min-h-[34px] ${
                  readingLevel === item.id
                    ? 'bg-white text-[#1F1B18] shadow-xs'
                    : 'text-[#5A564E] hover:text-[#1F1B18]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 1-Click Anonymized Sample Cases */}
      <div className="mt-5">
        <p className="text-xs font-medium text-[#5A564E] mb-2.5">
          Try a fictional sample in one click:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {ANONYMIZED_SAMPLE_CASES.map((sample) => {
            const isSelected = text.trim() === sample.text.trim();
            return (
              <button
                key={sample.id}
                type="button"
                onClick={() => {
                  onClearImage();
                  onTextChange(sample.text);
                }}
                aria-pressed={isSelected}
                className={`text-left p-3.5 rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2864A0] ${
                  isSelected
                    ? 'border-[#2864A0] bg-[#EDF4FB]/70'
                    : 'border-[#E2DCD0] hover:border-[#2864A0] hover:bg-[#FAF7F0]'
                }`}
              >
                <div className="text-xs text-[#2864A0] font-semibold">{sample.category}</div>
                <div className="text-sm font-semibold text-[#1F1B18] mt-0.5">{sample.label}</div>
                <div className="text-xs text-[#5A564E] mt-1 line-clamp-2">{sample.summaryHint}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Textarea + Image Upload */}
      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="medical-text-input" className="block text-sm font-medium text-[#1F1B18] mb-1.5">
            Report or prescription text
          </label>
          <textarea
            id="medical-text-input"
            rows={6}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Paste lab test numbers (e.g., HbA1c: 6.1%, Hemoglobin: 11.8 g/dL) or prescription instructions (e.g., Amoxicillin 625 mg 1-0-1 BD PC)..."
            className="w-full rounded-xl border border-[#D5CCBC] bg-[#FAF7F0]/60 px-4 py-3 text-sm text-[#1F1B18] placeholder:text-[#7A7469] focus:bg-white focus:border-[#2864A0] focus:outline-none focus:ring-2 focus:ring-[#2864A0]/20"
          />
        </div>

        {/* Upload & Privacy Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Upload report or prescription photo"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#1F1B18] bg-[#FAF7F0] hover:bg-[#F3EFE6] border border-[#E2DCD0] rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[42px]"
            >
              <Upload className="w-4 h-4 text-[#D78728]" aria-hidden="true" />
              Upload Photo (PNG/JPG)
            </button>

            {text.trim().length > 0 && (
              <button
                type="button"
                onClick={() => onTextChange('')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-[#5A564E] hover:text-[#1F1B18] rounded-lg hover:bg-[#FAF7F0] transition-colors min-h-[40px]"
              >
                <FileText className="w-4 h-4" aria-hidden="true" />
                Clear text
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onAnalyze}
            disabled={isAnalyzing || (!text.trim() && !imagePreviewUrl)}
            className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold text-white bg-[#2864A0] hover:bg-[#1E5082] disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
          >
            {isAnalyzing ? 'Explaining simply...' : 'Explain in Plain Language'}
          </button>
        </div>

        {/* Image Preview */}
        {imagePreviewUrl && (
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl border border-[#E2DCD0] bg-[#FAF7F0]">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={imagePreviewUrl}
                alt={imageName || 'Uploaded medical document preview'}
                className="w-14 h-14 object-cover rounded-lg border border-[#E2DCD0] shrink-0"
              />
              <div className="min-w-0">
                <div className="text-sm font-medium text-[#1F1B18] truncate">
                  {imageName || 'Uploaded image'}
                </div>
                <div className="text-xs text-[#5A564E]">
                  Processed temporarily in memory · never stored on disk
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClearImage}
              aria-label="Remove uploaded image"
              className="p-2 text-[#5A564E] hover:text-[#1F1B18] hover:bg-[#E2DCD0]/50 rounded-lg min-w-[40px] min-h-[40px] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Live Privacy Shield Readout (unboxed metadata) */}
        <div className="flex items-center gap-2 text-xs text-[#5A564E] pt-1">
          <ShieldCheck className="w-4 h-4 text-[#267D40] shrink-0" aria-hidden="true" />
          {privacyPreview.redactionCount > 0 ? (
            <span>
              Privacy protection active ·{' '}
              <strong className="font-semibold text-[#1F1B18]">
                {privacyPreview.redactionCount} personal detail{privacyPreview.redactionCount > 1 ? 's' : ''}
              </strong>{' '}
              ({privacyPreview.redactedFields.join(', ')}) automatically hidden before analysis
            </span>
          ) : (
            <span>
              Privacy protection ready · Names, phone numbers, emails, and IDs are masked automatically before AI processing
            </span>
          )}
        </div>

        {error && (
          <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900">
            {error}
          </div>
        )}
      </div>
    </section>
  );
};
