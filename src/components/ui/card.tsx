import { type HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", ...props }: Props) {
  return (
    <div
      className={`card-surface w-full max-w-sm rounded-2xl p-6 ${className}`}
      {...props}
    />
  );
}
