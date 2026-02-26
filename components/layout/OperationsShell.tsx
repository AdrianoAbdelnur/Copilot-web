import Link from "next/link";
import type { ReactNode } from "react";

type NavItem = { href: string; label: string; current?: boolean };

export default function OperationsShell({
  title,
  subtitle,
  nav,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  nav: NavItem[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[calc(100vh-58px)] bg-background">
      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-4 p-4 lg:grid-cols-[220px_1fr]">
        <aside className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Copiloto Virtual</div>
          <nav className="grid gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  item.current ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="grid gap-4">
          <header className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
                {subtitle ? <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p> : null}
              </div>
              {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
