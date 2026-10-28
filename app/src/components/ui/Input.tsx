import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  loading?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, loading = false, className, id, type = 'text', ...props },
  ref,
) {
  const inputId = id ?? props.name;
  const isPassword = type === 'password';
  const [reveal, setReveal] = useState(false);
  const effectiveType = isPassword ? (reveal ? 'text' : 'password') : type;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-text-soft">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={effectiveType}
          aria-invalid={!!error}
          aria-busy={loading || undefined}
          className={cn(
            'h-11 w-full rounded-md border bg-surface-2 px-3.5 text-[15px] text-text placeholder:text-text-faint',
            'transition-colors focus:outline-none focus-visible:outline-none',
            (isPassword || loading) && 'pr-11',
            isPassword && loading && 'pr-20',
            error ? 'border-danger' : 'border-line focus:border-line-strong',
            className,
          )}
          {...props}
        />
        {loading && (
          <span role="status" aria-label="Buscando" className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-text-soft', isPassword ? 'right-12' : 'right-3')}>
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          </span>
        )}
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            title={reveal ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            tabIndex={-1}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-text-soft hover:text-text"
          >
            {reveal ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        )}
      </div>
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  );
});
