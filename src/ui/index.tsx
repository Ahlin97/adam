// Shared UI primitives. Mobile-first: min 48px touch targets, high contrast, one-hand use.
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'good';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg active:brightness-90',
  secondary: 'bg-surface-2 text-fg border border-border active:bg-border',
  ghost: 'bg-transparent text-fg active:bg-surface-2',
  danger: 'bg-bad text-white active:brightness-90',
  good: 'bg-good text-black active:brightness-90',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sizes = {
    sm: 'min-h-10 px-3 text-sm',
    md: 'min-h-12 px-4 text-base',
    lg: 'min-h-14 px-5 text-lg',
    xl: 'min-h-20 px-6 text-2xl',
  };
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold select-none disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
    />
  );
}

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('rounded-2xl bg-surface border border-border p-4', className)}>
      {children}
    </div>
  );
}

/** Page with sticky header. `back` = path or true for history back. */
export function Page({
  title,
  back,
  actions,
  children,
  className,
}: {
  title: string;
  back?: string | true;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-xl">
      <header className="pt-safe sticky top-0 z-20 bg-bg/95 backdrop-blur border-b border-border">
        <div className="flex min-h-14 items-center gap-2 px-2">
          {back ? (
            <button
              type="button"
              aria-label="Tillbaka"
              className="min-h-12 min-w-12 rounded-xl text-2xl active:bg-surface-2"
              onClick={() => (back === true ? navigate(-1) : navigate(back))}
            >
              ‹
            </button>
          ) : (
            <span className="w-2" />
          )}
          <h1 className="flex-1 truncate text-xl font-bold">{title}</h1>
          {actions}
        </div>
      </header>
      <main className={cx('px-4 py-4 pb-28', className)}>{children}</main>
    </div>
  );
}

/** − value + control. step in display units. */
export function Stepper({
  label,
  value,
  onChange,
  step,
  min = 0,
  format = (v) => String(v),
  size = 'lg',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min?: number;
  format?: (v: number) => string;
  size?: 'md' | 'lg';
}) {
  const btn = size === 'lg' ? 'min-h-16 min-w-16 text-3xl' : 'min-h-12 min-w-12 text-2xl';
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <Button className={btn} aria-label={`Minska ${label}`} onClick={() => onChange(Math.max(min, round(value - step)))}>
        −
      </Button>
      <div className="flex-1 text-center">
        <div className="text-xs text-muted">{label}</div>
        <div className={cx('tabular font-bold', size === 'lg' ? 'text-3xl' : 'text-xl')} aria-live="polite">
          {format(value)}
        </div>
      </div>
      <Button className={btn} aria-label={`Öka ${label}`} onClick={() => onChange(round(value + step))}>
        +
      </Button>
    </div>
  );
}

export function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'min-h-10 shrink-0 rounded-full px-4 text-sm font-medium border',
        active ? 'bg-accent text-accent-fg border-accent' : 'bg-surface-2 text-fg border-border',
      )}
    >
      {children}
    </button>
  );
}

/** Bottom sheet / modal dialog using native <dialog>. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto w-full max-w-none max-h-[90dvh] rounded-t-3xl bg-surface p-0 text-fg backdrop:bg-black/70 sm:m-auto sm:max-w-lg sm:rounded-3xl"
    >
      <div className="pb-safe">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Stäng">
            ✕
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </dialog>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full min-h-12 rounded-xl border border-border bg-surface-2 px-3 text-base text-fg placeholder:text-muted';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ListLink({ to, children, right }: { to: string; children: ReactNode; right?: ReactNode }) {
  return (
    <Link to={to} className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 active:bg-surface-2">
      <div className="min-w-0 flex-1">{children}</div>
      {right}
      <span aria-hidden className="text-muted">›</span>
    </Link>
  );
}
