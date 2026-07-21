type Props = {
  secondsLeft: number;
  onStay: () => void;
  onLogout: () => void;
};

export function SessionTimeoutModal({
  secondsLeft,
  onStay,
  onLogout,
}: Props) {
  const secondsLabel = Math.max(0, secondsLeft);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
      aria-describedby="session-timeout-desc"
    >
      <div className="w-full max-w-md rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6 shadow-2xl">
        <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
          Session security
        </p>
        <h2
          id="session-timeout-title"
          className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white"
        >
          Still there?
        </h2>
        <p
          id="session-timeout-desc"
          className="mt-3 text-sm leading-relaxed text-[var(--muted)]"
        >
          Your session will expire in{" "}
          <span className="font-semibold text-[var(--gold-soft)]">
            {secondsLabel} second{secondsLabel === 1 ? "" : "s"}
          </span>{" "}
          due to inactivity. Stay signed in to continue, or sign out now.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onStay}
            className="min-h-11 flex-1 rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)] transition hover:bg-[var(--gold-soft)]"
          >
            Stay logged in
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="min-h-11 flex-1 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-[var(--gold)] hover:text-[var(--gold-soft)]"
          >
            Log out now
          </button>
        </div>
      </div>
    </div>
  );
}
