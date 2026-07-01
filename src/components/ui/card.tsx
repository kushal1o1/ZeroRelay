import type { HTMLAttributes } from "react";

export function Card({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className}`} {...props}>
      {children}
    </div>
  );
}
