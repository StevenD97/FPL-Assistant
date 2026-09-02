import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-pl-purple text-white border border-transparent hover:bg-pl-purple-light",
  accent: "bg-pl-green text-pl-purple border border-transparent hover:brightness-95",
  secondary: "bg-white text-text-primary border border-border-strong hover:bg-slate-50",
  ghost: "bg-transparent text-text-primary border border-transparent hover:bg-slate-50",
  danger: "bg-danger text-white border border-transparent hover:brightness-95",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4.5 py-2.5 text-base",
  lg: "px-6 py-3.5 text-md",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({ variant = "primary", size = "md", className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`tap-target inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md font-semibold transition-all duration-fast ease-standard active:scale-[0.98] active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
    >
      {children}
    </button>
  );
}
