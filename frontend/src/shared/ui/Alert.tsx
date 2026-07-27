import type { ReactNode } from "react";

type Kind = "info" | "warning" | "success" | "danger";

const KIND_CLASSES: Record<Kind, string> = {
  info: "bg-info-bg text-info border-info/20",
  warning: "bg-warning-bg text-warning border-warning/20",
  success: "bg-success-bg text-success border-success/20",
  danger: "bg-danger-bg text-danger border-danger/20",
};

export function Alert({ kind = "info", children }: { kind?: Kind; children: ReactNode }) {
  return (
    <div className={`rounded-md border px-3.5 py-2.5 text-sm font-medium ${KIND_CLASSES[kind]}`}>
      {children}
    </div>
  );
}
