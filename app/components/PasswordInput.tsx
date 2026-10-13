"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { Check, Eye, EyeOff, ShieldAlert } from "lucide-react";

type PasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  label?: string;
  showPolicy?: boolean;
  matchValue?: string;
};

export function PasswordInput({
  label,
  showPolicy = false,
  matchValue,
  id,
  value,
  defaultValue,
  onChange,
  ...props
}: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [localValue, setLocalValue] = useState(
    String(value ?? defaultValue ?? ""),
  );
  const currentValue = value === undefined ? localValue : String(value);
  const checks = [["At least 8 characters", currentValue.length >= 8]] as const;
  const describedBy =
    [
      props["aria-describedby"],
      showPolicy ? `${inputId}-policy` : "",
      capsLock ? `${inputId}-caps` : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  const control = (
    <>
      <span className="password-input">
        <input
          {...props}
          id={inputId}
          type={visible ? "text" : "password"}
          value={value}
          defaultValue={defaultValue}
          aria-describedby={describedBy}
          onChange={(event) => {
            setLocalValue(event.target.value);
            onChange?.(event);
          }}
          onKeyDown={(event) => setCapsLock(event.getModifierState("CapsLock"))}
          onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
          onBlur={() => setCapsLock(false)}
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </span>
      {capsLock && (
        <small id={`${inputId}-caps`} className="password-caps" role="status">
          <ShieldAlert size={14} /> Caps Lock is on
        </small>
      )}
      {showPolicy && (
        <ul
          id={`${inputId}-policy`}
          className="password-policy"
          aria-label="Password requirements"
        >
          {checks.map(([copy, passed]) => (
            <li className={passed ? "passed" : ""} key={copy}>
              <Check size={13} />
              {copy}
            </li>
          ))}
          {matchValue !== undefined && (
            <li
              className={
                currentValue && currentValue === matchValue ? "passed" : ""
              }
            >
              <Check size={13} />
              Passwords match
            </li>
          )}
        </ul>
      )}
    </>
  );

  return label ? (
    <label className="field" htmlFor={inputId}>
      <span>{label}</span>
      {control}
    </label>
  ) : (
    control
  );
}
