import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  isQuotaError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    message: '',
    isQuotaError: false,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const raw = error.message || 'An unexpected error occurred.';
    let friendly = raw;
    let isQuotaError = false;

    try {
      const parsed = JSON.parse(raw) as { error?: string; operationType?: string };
      if (parsed?.error) {
        friendly = parsed.error;
      }
    } catch {
      // plain string message
    }

    if (friendly.toLowerCase().includes('quota exceeded')) {
      isQuotaError = true;
      friendly =
        'Daily cloud sync quota reached. Your local study progress is still safe on this device, and cloud quota resets tomorrow.';
    }

    return {
      hasError: true,
      message: friendly,
      isQuotaError,
    };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Simpli ErrorBoundary caught:', error, info);
  }

  private handleRecover = () => {
    this.setState({ hasError: false, message: '', isQuotaError: false });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#09090B] p-6">
          <div className="max-w-md w-full rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h1 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {this.state.isQuotaError ? 'Cloud Sync Paused' : 'Something paused Simpli'}
                </h1>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Your local workspace remains intact.
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-700 dark:text-zinc-200 leading-relaxed">
              {this.state.message}
            </p>

            <button
              type="button"
              onClick={this.handleRecover}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 dark:bg-white px-4 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Return to Simpli</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
