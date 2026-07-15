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
        className={`rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent ${className}`}
        {...props}
      />
    </div>
  );
}
