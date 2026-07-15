import { type HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", ...props }: Props) {
  return (
    <div
      className={`w-full max-w-sm rounded-xl border border-gray-200 p-6 dark:border-gray-800 ${className}`}
      {...props}
    />
  );
}
