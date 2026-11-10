import type { ReactNode } from "react";

/** Compact admin form controls (the public site uses the pill-shaped site inputs). */
export const adminInputClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-body-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20";

export const adminTextareaClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-body-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20";

/** Label + control + error message. Pass `aria-describedby={errorId(id)}` to the control when there's an error. */
export function AdminField({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`space-y-1 text-body-sm ${className ?? ""}`}>
      <label htmlFor={id} className="font-semibold">
        {label}
        {required && <span aria-hidden> *</span>}
      </label>
      {hint && <p className="text-muted-foreground">{hint}</p>}
      {children}
      {error && (
        <p id={errorId(id)} role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export const errorId = (id: string) => `${id}-error`;
