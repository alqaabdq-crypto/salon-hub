import { type ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ className = "", ...props }: Props) {
  return (
    <button
      className={`rounded-full bg-foreground px-6 py-2.5 text-background font-medium disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
