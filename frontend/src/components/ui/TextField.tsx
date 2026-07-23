import type { InputHTMLAttributes } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  wrapperClassName?: string;
};

export function TextField({ label, wrapperClassName = "", className = "", ...rest }: TextFieldProps) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm text-text-secondary ${wrapperClassName}`}>
      {label}
      <input
        {...rest}
        className={`rounded-sm border border-border-strong bg-white px-3 py-2.5 text-base text-text-primary outline-none focus:border-pl-cyan focus:shadow-focus ${className}`}
      />
    </label>
  );
}
