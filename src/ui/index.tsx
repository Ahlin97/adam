// Shared UI primitives. Mobile-first: min 48px touch targets, high contrast, one-hand use.
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'good';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg shadow-[0_8px_24px_-12px_rgb(212_255_58/0.6)] active:brightness-90',
  secondary: 'bg-surface-2 text-fg border border-border active:bg-border',
  ghost: 'bg-transparent text-fg active:bg-surface-2',
  danger: 'bg-bad/15 text-bad border border-bad/40 active:bg-bad/25',
  good: 'bg-accent text-accent-fg shadow-[0_8px_24px_-12px_rgb(212_255_58/0.6)] active:brightness-90',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sizes = {
    sm: 'min-h-10 rounded-xl px-3 text-sm',
    md: 'min-h-12 rounded-2xl px-4 text-base',
    lg: 'min-h-14 rounded-2xl px-5 text-lg',
    xl: 'min-h-20 rounded-3xl px-6 text-2xl tracking-tight',
  };
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'press inline-flex items-center justify-center gap-2 font-semibold select-none disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
    />
  );
}

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('card p-4', className)}>
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
  /** Where the back button goes: a path, true for history back, or a handler (e.g. a previous step). */
  back?: string | true | (() => void);
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-xl">
      <header className="pt-safe glass sticky top-0 z-20 border-b border-white/5">
        <div className={cx('flex items-center gap-2 px-2', back ? 'min-h-14' : 'min-h-16')}>
          {back ? (
            <button
              type="button"
              aria-label="Tillbaka"
              className="press flex min-h-11 min-w-11 items-center justify-center rounded-full bg-surface-2 active:bg-border"
              onClick={() => (typeof back === 'function' ? back() : back === true ? navigate(-1) : navigate(back))}
            >
              <ChevronLeft aria-hidden size={22} strokeWidth={2.5} />
            </button>
          ) : (
            <span className="w-2" />
          )}
          <h1 className={cx('flex-1 truncate font-extrabold', back ? 'text-xl' : 'text-3xl')}>{title}</h1>
          {actions}
        </div>
      </header>
      <main className={cx('px-4 py-5 pb-36', className)}>{children}</main>
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
  const btn = size === 'lg' ? 'min-h-16 min-w-16 rounded-2xl text-3xl' : 'min-h-12 min-w-12 rounded-xl text-2xl';
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <Button className={btn} aria-label={`Minska ${label}`} onClick={() => onChange(Math.max(min, round(value - step)))}>
        −
      </Button>
      <div className="flex-1 text-center">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</div>
        <div className={cx('tabular font-extrabold tracking-tight', size === 'lg' ? 'text-4xl' : 'text-xl')} aria-live="polite">
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
        'press min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold border',
        active ? 'bg-accent text-accent-fg border-accent' : 'bg-surface-2/70 text-fg border-border',
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
      className="m-0 mt-auto w-full max-w-none max-h-[90dvh] rounded-t-[2rem] border-t border-border bg-surface p-0 text-fg backdrop:bg-black/70 backdrop:backdrop-blur-sm sm:m-auto sm:max-w-lg sm:rounded-[2rem] sm:border"
    >
      <div className="pb-safe">
        <div className="sticky top-0 z-10 bg-surface px-4 pt-2 pb-3">
          <div aria-hidden className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-border" />
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Stäng"
              className="press flex min-h-10 min-w-10 items-center justify-center rounded-full bg-surface-2 text-muted"
            >
              <X aria-hidden size={18} strokeWidth={2.5} />
            </button>
          </div>
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
  'w-full min-h-12 rounded-2xl border border-border bg-surface-2 px-4 text-base text-fg placeholder:text-muted focus:border-accent/60 focus:outline-none';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card p-8 text-center">
      <div aria-hidden className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
        <Sparkles size={22} />
      </div>
      <p className="text-lg font-bold">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ListLink({ to, children, right }: { to: string; children: ReactNode; right?: ReactNode }) {
  return (
    <Link to={to} className="press flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 active:bg-surface-2">
      <div className="min-w-0 flex-1">{children}</div>
      {right}
      <ChevronRight aria-hidden size={18} className="shrink-0 text-muted" />
    </Link>
  );
}
