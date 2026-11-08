import {
  type ButtonHTMLAttributes,
  type ChangeEvent,
  createContext,
  forwardRef,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useId,
  useMemo,
  useState,
} from "react";
import { cx } from "../cx.js";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, SearchIcon } from "../icons/index.js";

/* ------------------------------------------------------------------------------------------ */
/* Checkbox                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  description?: ReactNode;
  /**
   * `default` — box + label. `tile` — full-width 48 px bordered control, used for payer
   * confirmations such as "I'm sending on Base" (checkout manual path).
   */
  variant?: "default" | "tile";
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, variant = "default", className, id, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? `np-c${auto}`;
  const descId = description ? `${inputId}-desc` : undefined;
  const labelId = `${inputId}-label`;
  return (
    <label htmlFor={inputId} className={cx("np-checkbox", variant === "tile" && "np-checkbox--tile", className)}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="np-checkbox__input"
        aria-labelledby={labelId}
        aria-describedby={descId}
        {...rest}
      />
      <span className="np-checkbox__box" aria-hidden="true">
        <CheckIcon size={16} />
      </span>
      <span className="np-checkbox__text">
        <span id={labelId} className="np-checkbox__label">
          {label}
        </span>
        {description ? (
          <span id={descId} className="np-checkbox__description">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
});

/* ------------------------------------------------------------------------------------------ */
/* OptionCard / RadioCardGroup                                                                  */
/* ------------------------------------------------------------------------------------------ */

/** Round initial avatar used by token rows ("U" for USDC) and merchant headers. */
export function Avatar({
  initial,
  shape = "round",
  size = "md",
  className,
}: {
  initial: string;
  shape?: "round" | "square";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span className={cx("np-avatar", `np-avatar--${shape}`, `np-avatar--${size}`, className)} aria-hidden="true">
      {initial.slice(0, 1).toUpperCase()}
    </span>
  );
}

interface RadioGroupContextValue {
  name: string;
  value: string | undefined;
  onChange: (value: string) => void;
}
const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export interface RadioCardGroupProps {
  /** Group label (e.g. "Available for this payment"). */
  label: ReactNode;
  hideLabel?: boolean;
  value: string | undefined;
  onChange: (value: string) => void;
  name?: string;
  className?: string;
  children: ReactNode;
}

/** A radiogroup of `OptionCard`s. Arrow keys move selection (native radios). */
export function RadioCardGroup({ label, hideLabel, value, onChange, name, className, children }: RadioCardGroupProps) {
  const auto = useId();
  const labelId = `np-rg${auto}`;
  return (
    <RadioGroupContext.Provider value={{ name: name ?? `np-rg${auto}`, value, onChange }}>
      <div role="radiogroup" aria-labelledby={labelId} className={cx("np-option-group", className)}>
        <div id={labelId} className={cx("np-option-group__label", hideLabel && "np-sr-only")}>
          {label}
        </div>
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

export interface OptionCardProps {
  value: string;
  title: ReactNode;
  description?: ReactNode;
  /** Leading avatar initial ("U") or custom node. */
  avatar?: ReactNode;
  disabled?: boolean;
  /** Trailing indicator for unselected rows: chevron (Figma default) or none. */
  indicator?: "chevron" | "none";
  className?: string;
}

/** Selectable card (token row). Selected: accent border + check — never colour alone. */
export function OptionCard({
  value,
  title,
  description,
  avatar,
  disabled,
  indicator = "chevron",
  className,
}: OptionCardProps) {
  const group = useContext(RadioGroupContext);
  if (!group) throw new Error("OptionCard must be used inside RadioCardGroup");
  const checked = group.value === value;
  const auto = useId();
  const id = `np-o${auto}`;
  return (
    <label
      htmlFor={id}
      className={cx("np-option", checked && "np-option--selected", disabled && "np-option--disabled", className)}
    >
      <input
        id={id}
        type="radio"
        className="np-option__input"
        name={group.name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLInputElement>) => e.target.checked && group.onChange(value)}
        aria-describedby={description ? `${id}-d` : undefined}
      />
      {typeof avatar === "string" ? <Avatar initial={avatar} size="sm" /> : avatar}
      <span className="np-option__text">
        <span className="np-option__title">{title}</span>
        {description ? (
          <span id={`${id}-d`} className="np-option__description">
            {description}
          </span>
        ) : null}
      </span>
      <span className="np-option__indicator" aria-hidden="true">
        {checked ? <CheckIcon size={16} /> : indicator === "chevron" ? <ChevronDownIcon size={16} /> : null}
      </span>
    </label>
  );
}

export interface SelectionCardProps {
  title: ReactNode;
  description?: ReactNode;
  avatar?: ReactNode;
  /** Trailing action, e.g. a "Change" link button that reopens the picker. */
  action?: ReactNode;
  className?: string;
}

/**
 * The confirmed choice on review screens ("USDC · Base — Wallet 0x71…9A42 · Change"): looks like a
 * selected OptionCard but is static, with an optional action.
 */
export function SelectionCard({ title, description, avatar, action, className }: SelectionCardProps) {
  return (
    <div className={cx("np-option", "np-option--selected", "np-option--static", className)}>
      {typeof avatar === "string" ? <Avatar initial={avatar} size="sm" /> : avatar}
      <div className="np-option__text">
        <p className="np-option__title">{title}</p>
        {description || action ? (
          <p className="np-option__description">
            {description}
            {description && action ? <span aria-hidden="true"> · </span> : null}
            {action}
          </p>
        ) : null}
      </div>
      <span className="np-option__indicator">
        <CheckIcon size={16} title="Selected" />
      </span>
    </div>
  );
}

export interface OptionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  /** Leading avatar initial ("U") or custom node (icon). */
  avatar?: ReactNode;
  /** Trailing content; defaults to a chevron (the row navigates or opens something). */
  trailing?: ReactNode;
}

/**
 * Option-card row that is a button ("Connect a wallet", "Send from an exchange", a workspace in a
 * list): looks like an `OptionCard` but performs an action instead of selecting a radio value.
 */
export const OptionButton = forwardRef<HTMLButtonElement, OptionButtonProps>(function OptionButton(
  { title, description, avatar, trailing, className, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cx("np-option", "np-option--button", className)} {...rest}>
      {typeof avatar === "string" ? <Avatar initial={avatar} size="sm" /> : avatar}
      <span className="np-option__text">
        <span className="np-option__title">{title}</span>
        {description ? <span className="np-option__description">{description}</span> : null}
      </span>
      <span className="np-option__indicator np-option__indicator--center" aria-hidden="true">
        {trailing ?? <ChevronRightIcon size={16} />}
      </span>
    </button>
  );
});

/* ------------------------------------------------------------------------------------------ */
/* Combobox-lite: searchable inline listbox ("Pay with", "Choose a network")                   */
/* ------------------------------------------------------------------------------------------ */

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  /** Avatar initial; defaults to the label's first letter. */
  initial?: string;
  /** Extra search terms (chain names, ticker aliases). */
  keywords?: readonly string[];
  disabled?: boolean;
}

export interface ComboboxProps {
  /** Accessible label for the search box. */
  label: string;
  hideLabel?: boolean;
  options: readonly ComboboxOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Heading above the list (e.g. "Available for this payment"). */
  listLabel?: ReactNode;
  /** `cards` = token rows with avatars; `rows` = plain list with a check (network picker). */
  variant?: "cards" | "rows";
  /** Shown when nothing matches. */
  empty?: ReactNode;
  /** Controlled query (optional). */
  query?: string;
  onQueryChange?: (query: string) => void;
  /** Content between the search box and the list (e.g. network filter chips, a notice). */
  beforeList?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

/** Case- and accent-insensitive "every word matches" filter. */
export function filterOptions<T extends ComboboxOption>(options: readonly T[], query: string): T[] {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  const words = norm(query)
    .split(/[\s·,/]+/)
    .filter(Boolean);
  if (words.length === 0) return [...options];
  return options.filter((o) => {
    const hay = norm([o.label, o.description ?? "", ...(o.keywords ?? [])].join(" "));
    return words.every((w) => hay.includes(w));
  });
}

export function Combobox({
  label,
  hideLabel = true,
  options,
  value,
  onChange,
  placeholder = "Search token or network",
  listLabel,
  variant = "cards",
  empty,
  query: controlledQuery,
  onQueryChange,
  beforeList,
  className,
  "data-testid": testId,
}: ComboboxProps) {
  const auto = useId();
  const inputId = `np-cb${auto}`;
  const listId = `${inputId}-list`;
  const [ownQuery, setOwnQuery] = useState("");
  const query = controlledQuery ?? ownQuery;
  const setQuery = (q: string) => {
    if (controlledQuery === undefined) setOwnQuery(q);
    onQueryChange?.(q);
  };
  const visible = useMemo(() => filterOptions(options, query), [options, query]);
  const enabled = visible.filter((o) => !o.disabled);
  const [active, setActive] = useState<string | undefined>(undefined);
  const activeValue = enabled.some((o) => o.value === active) ? active : undefined;
  const optionId = (v: string) => `${listId}-${v.replace(/[^A-Za-z0-9_-]/g, "_")}`;

  const move = (delta: number) => {
    if (enabled.length === 0) return;
    const current = enabled.findIndex((o) => o.value === (activeValue ?? value));
    const next =
      current === -1 ? (delta > 0 ? 0 : enabled.length - 1) : (current + delta + enabled.length) % enabled.length;
    setActive(enabled[next]?.value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        if (enabled[0]) {
          e.preventDefault();
          setActive(enabled[0].value);
        }
        break;
      case "End": {
        const last = enabled[enabled.length - 1];
        if (last) {
          e.preventDefault();
          setActive(last.value);
        }
        break;
      }
      case "Enter":
        if (activeValue) {
          e.preventDefault();
          onChange(activeValue);
        }
        break;
      case "Escape":
        if (query) {
          e.preventDefault();
          setQuery("");
        }
        break;
    }
  };

  return (
    <div className={cx("np-combobox", `np-combobox--${variant}`, className)} data-testid={testId}>
      <label htmlFor={inputId} className={cx("np-field__label", hideLabel && "np-sr-only")}>
        {label}
      </label>
      <div className="np-input np-input--trailing">
        <input
          id={inputId}
          className="np-input__control"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeValue ? optionId(activeValue) : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(undefined);
          }}
          onKeyDown={onKeyDown}
        />
        <span className="np-input__adornment np-input__adornment--trailing">
          <SearchIcon size={20} />
        </span>
      </div>
      {beforeList ? <div className="np-combobox__slot">{beforeList}</div> : null}
      {listLabel ? (
        <div className="np-combobox__list-label" id={`${listId}-label`}>
          {listLabel}
        </div>
      ) : null}
      <div
        id={listId}
        role="listbox"
        aria-label={typeof listLabel === "string" ? listLabel : label}
        className="np-combobox__list"
      >
        {visible.map((o) => {
          const selected = o.value === value;
          return (
            // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard is handled on the combobox input (aria-activedescendant)
            // biome-ignore lint/a11y/useFocusableInteractive: options are reached via aria-activedescendant, not focus
            <div
              key={o.value}
              id={optionId(o.value)}
              role="option"
              aria-selected={selected}
              aria-disabled={o.disabled || undefined}
              className={cx(
                "np-option",
                variant === "rows" && "np-option--row",
                selected && "np-option--selected",
                o.value === activeValue && "np-option--active",
                o.disabled && "np-option--disabled",
              )}
              onClick={() => !o.disabled && onChange(o.value)}
            >
              {variant === "cards" ? <Avatar initial={o.initial ?? o.label} size="sm" /> : null}
              <span className="np-option__text">
                <span className="np-option__title">{o.label}</span>
                {o.description ? <span className="np-option__description">{o.description}</span> : null}
              </span>
              <span className="np-option__indicator" aria-hidden="true">
                {selected ? <CheckIcon size={16} /> : variant === "cards" ? <ChevronDownIcon size={16} /> : null}
              </span>
            </div>
          );
        })}
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" className="np-sr-only">
        {query ? `${visible.length} ${visible.length === 1 ? "option" : "options"} available` : ""}
      </div>
      {visible.length === 0 ? <div className="np-combobox__empty">{empty ?? "No matching options"}</div> : null}
    </div>
  );
}
