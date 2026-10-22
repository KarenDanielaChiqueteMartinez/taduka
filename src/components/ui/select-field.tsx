import type { ReactNode, SelectHTMLAttributes } from "react";
import { inputClass } from "@/components/ui/field";

type Props = {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>;

export function SelectField({ id, label, error, hint, children, ...select }: Props) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        name={id}
        className={inputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...select}
      >
        {children}
      </select>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-text-secondary">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
