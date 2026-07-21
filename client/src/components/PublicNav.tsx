import { Link } from "react-router-dom";

export function PublicNav() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="group">
          <p className="text-[11px] tracking-[0.35em] text-[var(--gold)] uppercase">
            KitchenOS
          </p>
          <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--mist)] transition group-hover:text-[var(--gold-soft)]">
            Menus that feel premium
          </p>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/tenant/login"
            className="hidden rounded-full px-4 py-2 text-sm text-[var(--muted)] transition hover:text-white sm:inline-flex"
          >
            Restaurant login
          </Link>
          <Link
            to="/register"
            className="rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-semibold text-[var(--night)] transition hover:bg-[var(--gold-soft)]"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
