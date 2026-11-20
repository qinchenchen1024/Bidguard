import type { Severity } from '@/lib/types';

export const SEVERITY_META: Record<Severity, { label: string; cls: string }> = {
  critical: { label: '严重', cls: 'bg-red-100 text-red-700 border-red-200' },
  high: { label: '高', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  medium: { label: '中', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  low: { label: '低', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  info: { label: '提示', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const meta = SEVERITY_META[severity] || SEVERITY_META.info;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

export function Card({
  title,
  action,
  children,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="text-base font-semibold text-slate-900">{title}</h2> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const base =
    'inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50';
  const styles = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700',
    ghost: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
  }[variant];
  return (
    <button className={`${base} ${styles}`} {...props}>
      {children}
    </button>
  );
}
