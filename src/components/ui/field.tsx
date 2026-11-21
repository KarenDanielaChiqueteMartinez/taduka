import type { InputHTMLAttributes } from "react";

export const inputClass =
  "h-12 w-full rounded-control border border-border bg-surface-muted/60 px-4 text-base text-text-primary transition-colors placeholder:text-text-secondary/80 hover:border-[#cfd8d1] focus-visible:border-action focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-action/40 aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-soft/40";

type Props = {
  id: string;
  label: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>;

export function Field({ id, label, error, ...input }: Props) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-text-primary">
        {label}
      </label>
      <input
        id={id}
        name={id}
        className={inputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
