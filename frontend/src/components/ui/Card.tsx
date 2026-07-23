import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padded?: boolean;
  children: ReactNode;
};

export function Card({ padded = true, className = "", children, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={`rounded-lg border border-border bg-white shadow-sm ${padded ? "p-5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card padded={false} className="p-4">
      <p className="m-0 text-sm text-text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-text-primary">{value}</p>
    </Card>
  );
}
