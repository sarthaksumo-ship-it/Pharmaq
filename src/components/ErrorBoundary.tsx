import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F3EFE6] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-[#E2DCD0] rounded-2xl p-6 space-y-4">
            <img
              src="/assets/pharmer-logo-lockup.png"
              alt="Pharmer — Precision Guidance"
              className="h-20 w-auto object-contain"
            />
            <h1 className="font-display text-xl font-semibold text-[#1F1B18]">
              Something went wrong
            </h1>
            <p className="text-sm text-[#5A564E] leading-relaxed">
              We hit an unexpected issue while loading this view. Please reload the page to continue safely.
            </p>
            <p className="text-xs font-mono text-[#5A564E] bg-[#FAF7F0] border border-[#E2DCD0] p-3 rounded-lg break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#2864A0] hover:bg-[#1E5082] rounded-lg transition-colors"
            >
              Reload Pharmer
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
