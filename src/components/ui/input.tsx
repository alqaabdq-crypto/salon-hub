import { type InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string };

export function Input({ label, id, className = "", ...props }: Props) {
  return (
    <div className="flex flex-col gap-1.5 text-start">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        className={`rounded-lg border border-hairline bg-surface/60 px-3 py-2 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30 ${className}`}
        {...props}
      />
    </div>
  );
}
