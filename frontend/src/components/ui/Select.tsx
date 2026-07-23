import type { SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  options: readonly string[];
  wrapperClassName?: string;
};

export function Select({ label, options, wrapperClassName = "", className = "", ...rest }: SelectProps) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm text-text-secondary ${wrapperClassName}`}>
      {label}
      <select
        {...rest}
        className={`rounded-sm border border-border-strong bg-white px-3 py-2.5 text-base text-text-primary outline-none focus:border-pl-cyan focus:shadow-focus ${className}`}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
