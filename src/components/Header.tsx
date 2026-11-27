import React from 'react';
import type { UserProfile, UserRole } from '../types/medmate';

interface HeaderProps {
  profile: UserProfile | null;
  activeView: 'easy' | 'platform';
  activePortal: UserRole;
  onSelectEasyAccess: () => void;
  onSelectPortal: (portal: UserRole) => void;
  onOpenAuthModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  profile,
  activeView,
  activePortal,
  onSelectEasyAccess,
  onSelectPortal,
  onOpenAuthModal,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#FAF7F0]/95 backdrop-blur-sm border-b border-[#E2DCD0]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Official Pharmer emblem + wordmark */}
        <button
          type="button"
          onClick={onSelectEasyAccess}
          className="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-[#1F1B18] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2864A0] rounded-md px-1"
        >
          <img
            src="/assets/pharmer-favicon.png"
            alt="Pharmer hexagonal sprout logo"
            className="w-8 h-8 object-contain rounded-md shrink-0"
          />
          <span>Pharmer</span>
        </button>

        {/* Zone 2: Clean single-line navigation links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-[#5A564E]"
        >
          <button
            type="button"
            onClick={onSelectEasyAccess}
            className={`transition-colors whitespace-nowrap shrink-0 hover:underline underline-offset-4 ${
              activeView === 'easy'
                ? 'text-[#2864A0] font-semibold underline'
                : 'hover:text-[#1F1B18]'
            }`}
          >
            Easy Access
          </button>
          <button
            type="button"
            onClick={() => onSelectPortal('patient')}
            className={`transition-colors whitespace-nowrap shrink-0 hover:underline underline-offset-4 ${
              activeView === 'platform' && activePortal === 'patient'
                ? 'text-[#2864A0] font-semibold underline'
                : 'hover:text-[#1F1B18]'
            }`}
          >
            Patient Portal
          </button>
          <button
            type="button"
            onClick={() => onSelectPortal('hospital')}
            className={`transition-colors whitespace-nowrap shrink-0 hover:underline underline-offset-4 ${
              activeView === 'platform' && activePortal === 'hospital'
                ? 'text-[#B86A14] font-semibold underline'
                : 'hover:text-[#1F1B18]'
            }`}
          >
            Hospital Portal
          </button>
          <a
            href="#safety-guide"
            className="hover:text-[#2864A0] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Safety Guide
          </a>
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#2864A0] hover:bg-[#1E5082] rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#2864A0] min-h-[40px]"
          >
            {profile
              ? `${profile.role === 'hospital' ? 'Hospital' : 'Patient'}: ${profile.displayName.split(' ')[0]}`
              : 'Login / Register'}
          </button>
        </div>
      </div>
    </header>
  );
};
