import { type ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ className = "", ...props }: Props) {
  return (
    <button
      className={`btn-brand rounded-full px-6 py-2.5 font-medium disabled:opacity-50 disabled:shadow-none ${className}`}
      {...props}
    />
  );
}
