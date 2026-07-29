import type { InputHTMLAttributes } from "react";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import type { StatGlossaryKey } from "@/shared/lib/statGlossary";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  wrapperClassName?: string;
  /** Key into STAT_GLOSSARY - shows an "i" info trigger next to the label. */
  hint?: StatGlossaryKey;
};

export function TextField({ label, wrapperClassName = "", className = "", hint, ...rest }: TextFieldProps) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm text-text-secondary ${wrapperClassName}`}>
      {label && (
        <span className="inline-flex items-center gap-1">
          {label}
          {hint && <InfoTooltip term={hint} />}
        </span>
      )}
      <input
        {...rest}
        className={`rounded-sm border border-border-strong bg-white px-3 py-2.5 text-base text-text-primary outline-none focus:border-pl-cyan focus:shadow-focus ${className}`}
      />
    </label>
  );
}
