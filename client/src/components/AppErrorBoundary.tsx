import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

/**
 * Catches unexpected render errors so the whole SPA does not go blank.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("KitchenOS UI error", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-dvh items-center justify-center bg-[var(--night)] px-4 text-[var(--mist)]">
          <div className="w-full max-w-md rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-8 text-center">
            <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
              KitchenOS
            </p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl text-white">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              An unexpected error occurred. Reload the page to continue.
            </p>
            <button
              type="button"
              className="mt-6 rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)]"
              onClick={() => window.location.assign("/")}
            >
              Reload
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
