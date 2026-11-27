import React, { useEffect, useState } from 'react';
import { Building2, LogOut, UserCheck, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { LanguageMode, UserProfile, UserRole } from '../types/medmate';

interface AuthRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  firebaseUser: User | null;
  profile: UserProfile | null;
  defaultRole?: UserRole;
  onGoogleSignIn: () => Promise<void>;
  onSaveProfile: (data: {
    role: UserRole;
    displayName: string;
    preferredLanguage: LanguageMode;
    hospitalName?: string;
  }) => Promise<void>;
  onSignOut: () => Promise<void>;
}

export const AuthRoleModal: React.FC<AuthRoleModalProps> = ({
  isOpen,
  onClose,
  firebaseUser,
  profile,
  defaultRole = 'patient',
  onGoogleSignIn,
  onSaveProfile,
  onSignOut,
}) => {
  const [role, setRole] = useState<UserRole>(profile?.role || defaultRole);
  const [displayName, setDisplayName] = useState(
    profile?.displayName || firebaseUser?.displayName || ''
  );
  const [hospitalName, setHospitalName] = useState(profile?.hospitalName || '');
  const [preferredLanguage, setPreferredLanguage] = useState<LanguageMode>(
    profile?.preferredLanguage || 'auto'
  );
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRole(profile?.role || defaultRole);
      setDisplayName(profile?.displayName || firebaseUser?.displayName || '');
      setHospitalName(profile?.hospitalName || '');
      setPreferredLanguage(profile?.preferredLanguage || 'auto');
      setError(null);
    }
  }, [isOpen, profile, firebaseUser, defaultRole]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSignIn = async () => {
    setError(null);
    setIsBusy(true);
    try {
      await onGoogleSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Please enter your name.');
      return;
    }
    setError(null);
    setIsBusy(true);
    try {
      await onSaveProfile({
        role,
        displayName: displayName.trim(),
        preferredLanguage,
        hospitalName: role === 'hospital' ? hospitalName.trim() : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your registration.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 bg-[#1F1B18]/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-white border border-[#E2DCD0] rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E2DCD0]">
          <div className="flex items-center gap-3.5">
            <div className="bg-[#F3EFE6] border border-[#E2DCD0] rounded-xl p-2 shrink-0">
              <img
                src="/assets/pharmer-logo-lockup.png"
                alt="Pharmer — Precision Guidance"
                className="h-16 w-auto object-contain"
              />
            </div>
            <div>
              <h2 id="auth-modal-title" className="font-display text-xl font-semibold text-[#1F1B18]">
                {firebaseUser ? 'Choose Your Pharmer Role' : 'Register or Sign In to Pharmer'}
              </h2>
              <p className="text-xs text-[#5A564E] mt-1">
                Patient precautions &amp; booking, or Hospital doctor &amp; slot administration.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close registration modal"
            className="p-2 text-[#5A564E] hover:text-[#1F1B18] hover:bg-[#F3EFE6] rounded-lg min-w-[40px] min-h-[40px] flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!firebaseUser ? (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl border border-[#E2DCD0] bg-[#FAF7F0]">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#1F1B18]">
                  <UserCheck className="w-4 h-4 text-[#2864A0]" aria-hidden="true" />
                  Patient Companion
                </div>
                <p className="text-xs text-[#5A564E] mt-1">
                  Describe or speak symptoms, get precautions, find the right doctor room, and book free slots.
                </p>
              </div>
              <div className="p-3.5 rounded-xl border border-[#E2DCD0] bg-[#FAF7F0]">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#1F1B18]">
                  <Building2 className="w-4 h-4 text-[#D78728]" aria-hidden="true" />
                  Hospital Member
                </div>
                <p className="text-xs text-[#5A564E] mt-1">
                  Enter hospital info, upload doctor room directions, and manage free appointment times.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSignIn}
              disabled={isBusy}
              className="w-full py-3 px-4 text-sm font-semibold text-white bg-[#2864A0] hover:bg-[#1E5082] disabled:bg-slate-400 rounded-xl transition-colors min-h-[44px]"
            >
              {isBusy ? 'Connecting to Google...' : 'Continue with Google'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmitProfile} className="mt-5 space-y-4">
            <div>
              <span className="block text-xs font-medium text-[#5A564E] mb-2">
                Select account role
              </span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('patient')}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    role === 'patient'
                      ? 'border-[#2864A0] bg-[#EDF4FB] text-[#1F1B18]'
                      : 'border-[#E2DCD0] text-[#5A564E] hover:border-[#2864A0]/60'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <UserCheck className="w-4 h-4 text-[#2864A0]" aria-hidden="true" />
                    Patient
                  </div>
                  <div className="text-xs mt-0.5">Companion &amp; booking</div>
                </button>
                <button
                  type="button"
                  onClick={() => setRole('hospital')}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    role === 'hospital'
                      ? 'border-[#D78728] bg-[#FDF4E7] text-[#1F1B18]'
                      : 'border-[#E2DCD0] text-[#5A564E] hover:border-[#D78728]/70'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Building2 className="w-4 h-4 text-[#D78728]" aria-hidden="true" />
                    Hospital Member
                  </div>
                  <div className="text-xs mt-0.5">Upload doctors &amp; slots</div>
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="reg-display-name" className="block text-sm font-medium text-[#1F1B18] mb-1">
                Your Name
              </label>
              <input
                id="reg-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                maxLength={100}
                className="w-full rounded-lg border border-[#D5CCBC] px-3.5 py-2.5 text-sm text-[#1F1B18] focus:border-[#2864A0] focus:outline-none focus:ring-2 focus:ring-[#2864A0]/20"
              />
            </div>

            {role === 'hospital' && (
              <div>
                <label htmlFor="reg-hospital-name" className="block text-sm font-medium text-[#1F1B18] mb-1">
                  Hospital / Clinic Name (optional)
                </label>
                <input
                  id="reg-hospital-name"
                  type="text"
                  value={hospitalName}
                  onChange={(e) => setHospitalName(e.target.value)}
                  maxLength={120}
                  placeholder="e.g., CityCare Multi-Specialty Hospital"
                  className="w-full rounded-lg border border-[#D5CCBC] px-3.5 py-2.5 text-sm text-[#1F1B18] focus:border-[#2864A0] focus:outline-none focus:ring-2 focus:ring-[#2864A0]/20"
                />
              </div>
            )}

            <div>
              <label htmlFor="reg-language" className="block text-sm font-medium text-[#1F1B18] mb-1">
                Preferred Language
              </label>
              <select
                id="reg-language"
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value as LanguageMode)}
                className="w-full rounded-lg border border-[#D5CCBC] px-3.5 py-2.5 text-sm text-[#1F1B18] bg-white focus:border-[#2864A0] focus:outline-none focus:ring-2 focus:ring-[#2864A0]/20"
              >
                <option value="auto">Auto-detect Any Language</option>
                <option value="en">English</option>
                <option value="hi">हिन्दी (सरल)</option>
                <option value="hinglish">Hinglish</option>
              </select>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={async () => {
                  await onSignOut();
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#5A564E] hover:text-red-700 rounded-lg hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                Sign Out
              </button>

              <button
                type="submit"
                disabled={isBusy}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-[#2864A0] hover:bg-[#1E5082] disabled:bg-slate-400 rounded-lg transition-colors min-h-[42px]"
              >
                {isBusy ? 'Saving...' : 'Save Role & Continue'}
              </button>
            </div>
          </form>
        )}

        {error && (
          <div role="alert" className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
