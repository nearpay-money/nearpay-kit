import {
  createContext,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useContext,
  useId,
} from "react";
import { cx } from "../cx.js";
import { ChevronDownIcon, SearchIcon, WarningIcon } from "../icons/index.js";

interface FieldContextValue {
  id: string;
  describedBy: string | undefined;
  /** Id of the error message when the field is invalid (for `aria-errormessage`). */
  errorId: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** Wiring for custom controls placed inside a `Field`. */
export function useField(): FieldContextValue | null {
  return useContext(FieldContext);
}

export interface FieldProps {
  label: ReactNode;
  /** Helper text under the control. */
  hint?: ReactNode;
  /**
   * Error message (field-level error state): marks the control `aria-invalid`, points
   * `aria-describedby` and `aria-errormessage` at the message, and colours the control border.
   * The hint stays visible. `true` marks the field invalid without a message of its own (e.g.
   * the message is shown elsewhere, such as an error summary).
   */
  error?: ReactNode | true;
  required?: boolean;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  /** Override the generated control id. */
  id?: string;
  className?: string;
  children: ReactNode;
}

/** Label + control + hint + error. Controls inside pick up id / aria wiring automatically. */
export function Field({ label, hint, error, required = false, hideLabel, id, className, children }: FieldProps) {
  const auto = useId();
  const controlId = id ?? `np-f${auto}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const hasMessage = error !== undefined && error !== null && error !== false && error !== true && error !== "";
  const invalid = hasMessage || error === true;
  const errorId = hasMessage ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <FieldContext.Provider value={{ id: controlId, describedBy, errorId, invalid, required }}>
      <div className={cx("np-field", invalid && "np-field--invalid", className)}>
        <label htmlFor={controlId} className={cx("np-field__label", hideLabel && "np-sr-only")}>
          {label}
          {required ? (
            <span className="np-field__required" aria-hidden="true">
              {" "}
              *
            </span>
          ) : null}
        </label>
        {children}
        {hint ? (
          <p id={hintId} className="np-field__hint">
            {hint}
          </p>
        ) : null}
        {hasMessage ? <FieldError id={errorId}>{error}</FieldError> : null}
      </div>
    </FieldContext.Provider>
  );
}

/**
 * Error message line (warning icon + text) for custom compositions; `Field` renders one for its
 * `error`. Inside a `Field`, the id defaults to the one its control already references.
 */
export function FieldError({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  const f = useContext(FieldContext);
  return (
    <p id={id ?? f?.errorId} className={cx("np-field__error", className)}>
      <WarningIcon size={16} />
      <span>{children}</span>
    </p>
  );
}

function useControlProps(props: {
  id?: string;
  "aria-describedby"?: string;
  "aria-errormessage"?: string;
  "aria-invalid"?: InputHTMLAttributes<HTMLInputElement>["aria-invalid"];
  required?: boolean;
}) {
  const f = useContext(FieldContext);
  const invalid = props["aria-invalid"] ?? (f?.invalid ? true : undefined);
  return {
    id: props.id ?? f?.id,
    "aria-describedby": cx(f?.describedBy, props["aria-describedby"]) || undefined,
    "aria-invalid": invalid,
    "aria-errormessage": props["aria-errormessage"] ?? (invalid ? f?.errorId : undefined),
    required: props.required ?? (f?.required || undefined),
  };
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Content before the text (icon, currency symbol). Decorative. */
  leading?: ReactNode;
  /** Content after the text (icon, unit). Decorative unless interactive. */
  trailing?: ReactNode;
  /** Use tabular numerals (amounts). */
  numeric?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leading, trailing, numeric, className, ...rest },
  ref,
) {
  const wiring = useControlProps(rest);
  return (
    <div
      className={cx(
        "np-input",
        Boolean(leading) && "np-input--leading",
        Boolean(trailing) && "np-input--trailing",
        className,
      )}
    >
      {leading ? <span className="np-input__adornment np-input__adornment--leading">{leading}</span> : null}
      <input ref={ref} className={cx("np-input__control", numeric && "np-tabular")} {...rest} {...wiring} />
      {trailing ? <span className="np-input__adornment np-input__adornment--trailing">{trailing}</span> : null}
    </div>
  );
});

export interface SearchInputProps extends Omit<InputProps, "type" | "trailing" | "leading"> {}

/** Search field with the trailing magnifier from the Figma ("Search token or network"). */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(props, ref) {
  return (
    <Input
      ref={ref}
      type="search"
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="search"
      trailing={<SearchIcon size={20} />}
      {...props}
    />
  );
});

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options?: readonly SelectOption[];
  placeholder?: string;
}

/** Native select styled as a 56 px field (Currency, Network, Theme, Corner style…). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, className, children, ...rest },
  ref,
) {
  const wiring = useControlProps(rest);
  return (
    <div className={cx("np-select", className)}>
      <select ref={ref} className="np-select__control" {...rest} {...wiring}>
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDownIcon size={20} className="np-select__chevron" />
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** `vertical` (default) lets people resize the height; `none` fixes it. */
  resize?: "vertical" | "none";
}

/** Multi-line text field (refund reason, notes, descriptions). Picks up `Field` wiring like `Input`. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { resize = "vertical", rows = 4, className, ...rest },
  ref,
) {
  const wiring = useControlProps(rest);
  return (
    <div className={cx("np-textarea", resize === "none" && "np-textarea--fixed", className)}>
      <textarea ref={ref} rows={rows} className="np-textarea__control" {...rest} {...wiring} />
    </div>
  );
});
