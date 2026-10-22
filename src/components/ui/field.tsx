import type { InputHTMLAttributes } from "react";

const inputClass =
  "h-11 w-full rounded-control border border-border bg-surface px-3 text-base text-text-primary transition-colors placeholder:text-text-secondary focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary aria-[invalid=true]:border-danger";

type Props = {
  id: string;
  label: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>;

export function Field({ id, label, error, ...input }: Props) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
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
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
