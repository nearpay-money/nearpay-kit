import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cx } from "../cx.js";
import { CaretDownIcon, CheckIcon } from "../icons/index.js";
import { type LinkRenderer, renderAnchor } from "./Link.js";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open state that is controlled when `open` is given, otherwise internal. */
function useOpenState(open: boolean | undefined, onOpenChange: ((open: boolean) => void) | undefined) {
  const [own, setOwn] = useState(false);
  const value = open ?? own;
  const set = useCallback(
    (next: boolean) => {
      if (open === undefined) setOwn(next);
      onOpenChange?.(next);
    },
    [open, onOpenChange],
  );
  return [value, set] as const;
}

/** Closes on a pointer press outside `root` and when focus leaves it. */
function useDismiss(open: boolean, root: RefObject<HTMLElement | null>, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: Event) => {
      if (root.current && !root.current.contains(e.target as Node)) closeRef.current();
    };
    const onFocus = (e: FocusEvent) => {
      if (root.current && e.target instanceof Node && !root.current.contains(e.target)) closeRef.current();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open, root]);
}

/* ------------------------------------------------------------------------------------------ */
/* Popover                                                                                      */
/* ------------------------------------------------------------------------------------------ */

export interface PopoverTriggerProps {
  ref: RefObject<HTMLButtonElement | null>;
  type: "button";
  "aria-expanded": boolean;
  "aria-controls": string;
  "aria-haspopup": "dialog";
  onClick: () => void;
}

export interface PopoverProps {
  /** Renders the trigger; spread the props onto a `<button>` (or `Button`). */
  trigger: (props: PopoverTriggerProps) => ReactNode;
  /** Panel content; a function receives `close`. */
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Accessible name of the panel. */
  label: string;
  align?: "start" | "end";
  side?: "bottom" | "top";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  "data-testid"?: string;
}

/**
 * Non-modal popover anchored to its trigger (positioned with CSS only — CSP-safe). Opening moves
 * focus into the panel; Esc, a click outside or tabbing away closes it; Esc returns focus to the
 * trigger.
 */
export function Popover({
  trigger,
  children,
  label,
  align = "start",
  side = "bottom",
  open: controlled,
  onOpenChange,
  className,
  "data-testid": testId,
}: PopoverProps) {
  const auto = useId();
  const panelId = `np-pop${auto}`;
  const [open, setOpen] = useOpenState(controlled, onOpenChange);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), [setOpen]);
  useDismiss(open, rootRef, close);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      close();
      triggerRef.current?.focus();
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Esc handling for the trigger and panel inside
    <div ref={rootRef} className={cx("np-popover-anchor", className)} onKeyDown={onKeyDown} data-testid={testId}>
      {trigger({
        ref: triggerRef,
        type: "button",
        "aria-expanded": open,
        "aria-controls": panelId,
        "aria-haspopup": "dialog",
        onClick: () => setOpen(!open),
      })}
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          className={cx("np-popover", `np-popover--${align}`, `np-popover--${side}`)}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Menu / MenuButton                                                                            */
/* ------------------------------------------------------------------------------------------ */

export interface MenuItem {
  id: string;
  label: ReactNode;
  /** Text used for type-ahead when `label` is not a string. */
  textValue?: string;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  /** Destructive action (danger colour; still states the action in words). */
  danger?: boolean;
  /** Link item (rendered through `renderLink`). */
  href?: string;
  /** Selection state for `selectable` menus. */
  checked?: boolean;
}

export type MenuEntry = MenuItem | { separator: true; id: string } | { heading: ReactNode; id: string };

export interface MenuProps {
  /** Accessible name of the menu. */
  label: string;
  items: readonly MenuEntry[];
  onSelect?: (id: string) => void;
  /** Called on Esc / Tab / after a selection (single-choice and action menus). */
  onClose?: () => void;
  /** `single` → menuitemradio, `multiple` → menuitemcheckbox (stays open), default plain actions. */
  selectable?: "single" | "multiple";
  renderLink?: LinkRenderer;
  /** Focus this item index when mounted (default 0; -1 = last). */
  initialIndex?: number;
  id?: string;
  className?: string;
}

/** WAI-ARIA menu: arrow keys, Home/End, type-ahead, Enter/Space select, Esc/Tab close. */
export function Menu({
  label,
  items,
  onSelect,
  onClose,
  selectable,
  renderLink = renderAnchor,
  initialIndex = 0,
  id,
  className,
}: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const enabled = () =>
    Array.from(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: focus once on mount
  useEffect(() => {
    const list = enabled();
    const target = initialIndex < 0 ? list[list.length + initialIndex] : list[initialIndex];
    target?.focus();
  }, []);

  const move = (to: (i: number, n: number) => number) => {
    const list = enabled();
    if (list.length === 0) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    list[to(i, list.length)]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move((i, n) => (i + 1) % n);
        return;
      case "ArrowUp":
        e.preventDefault();
        move((i, n) => (i <= 0 ? n - 1 : i - 1));
        return;
      case "Home":
        e.preventDefault();
        move(() => 0);
        return;
      case "End":
        e.preventDefault();
        move((_, n) => n - 1);
        return;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
        return;
      case "Tab":
        onClose?.();
        return;
    }
    if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const match = enabled().find((el) => (el.dataset.text ?? "").startsWith(typed.current.text));
      match?.focus();
    }
  };

  const choose = (item: MenuItem) => {
    if (item.disabled) return;
    onSelect?.(item.id);
    if (selectable !== "multiple") onClose?.();
  };

  const role = selectable === "single" ? "menuitemradio" : selectable === "multiple" ? "menuitemcheckbox" : "menuitem";

  return (
    <div ref={ref} id={id} role="menu" aria-label={label} className={cx("np-menu", className)} onKeyDown={onKeyDown}>
      {items.map((entry) => {
        if ("separator" in entry) return <hr key={entry.id} className="np-menu__separator" />;
        if ("heading" in entry)
          return (
            <div key={entry.id} role="presentation" className="np-menu__heading">
              {entry.heading}
            </div>
          );
        const item = entry;
        const text = (item.textValue ?? (typeof item.label === "string" ? item.label : "")).toLowerCase();
        const content = (
          <>
            {selectable ? (
              <span className="np-menu__check" aria-hidden="true">
                {item.checked ? <CheckIcon size={16} /> : null}
              </span>
            ) : item.icon ? (
              <span className="np-menu__icon">{item.icon}</span>
            ) : null}
            <span className="np-menu__text">
              <span className="np-menu__label">{item.label}</span>
              {item.description ? <span className="np-menu__description">{item.description}</span> : null}
            </span>
          </>
        );
        const common = {
          role,
          tabIndex: -1,
          "data-text": text,
          "aria-disabled": item.disabled || undefined,
          "aria-checked": selectable ? Boolean(item.checked) : undefined,
          className: cx(
            "np-menu__item",
            item.danger && "np-menu__item--danger",
            item.checked && "np-menu__item--checked",
          ),
        };
        if (item.href && !item.disabled) {
          return (
            <span key={item.id} className="np-menu__link-wrap" role="none">
              {renderLink({ href: item.href, ...common, onClick: () => choose(item), children: content })}
            </span>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            {...common}
            onClick={() => choose(item)}
            onKeyDown={(e) => {
              if (e.key === " ") {
                e.preventDefault();
                choose(item);
              }
            }}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

export interface MenuButtonProps {
  /** Trigger content. */
  children: ReactNode;
  /** Accessible name of the menu (and of the trigger when it shows only an icon, via `triggerLabel`). */
  label: string;
  /** Accessible name override for the trigger. */
  triggerLabel?: string;
  items: readonly MenuEntry[];
  onSelect?: (id: string) => void;
  selectable?: "single" | "multiple";
  /** `select` = bordered select-style button with a caret (filters); `ghost`; `plain` = unstyled. */
  variant?: "select" | "ghost" | "plain";
  /** Highlights a select-style trigger whose value differs from its default (an active filter). */
  active?: boolean;
  align?: "start" | "end";
  side?: "bottom" | "top";
  renderLink?: LinkRenderer;
  disabled?: boolean;
  triggerClassName?: string;
  className?: string;
  "data-testid"?: string;
}

/**
 * Menu button (WAI-ARIA): Enter/Space/↓ open on the first item, ↑ on the last; selecting or Esc
 * closes and returns focus to the trigger. Use for the workspace switcher, row actions and
 * filter pills.
 */
export function MenuButton({
  children,
  label,
  triggerLabel,
  items,
  onSelect,
  selectable,
  variant = "select",
  active = false,
  align = "start",
  side = "bottom",
  renderLink,
  disabled,
  triggerClassName,
  className,
  "data-testid": testId,
}: MenuButtonProps) {
  const auto = useId();
  const menuId = `np-menu${auto}`;
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);
  useDismiss(open, rootRef, () => close(false));
  const show = (index: number) => {
    setInitial(index);
    setOpen(true);
  };

  return (
    <div ref={rootRef} className={cx("np-popover-anchor", className)} data-testid={testId}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        className={cx(
          variant === "select" && "np-select-button",
          variant === "select" && active && "np-select-button--active",
          variant === "ghost" && "np-icon-button np-icon-button--ghost np-menu-trigger--ghost",
          triggerClassName,
        )}
        onClick={() => (open ? close(false) : show(0))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            show(0);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            show(-1);
          }
        }}
      >
        {children}
        {variant === "select" ? <CaretDownIcon size={12} className="np-select-button__caret" /> : null}
      </button>
      {open ? (
        <div className={cx("np-popover", "np-popover--menu", `np-popover--${align}`, `np-popover--${side}`)}>
          <Menu
            id={menuId}
            label={label}
            items={items}
            selectable={selectable}
            renderLink={renderLink}
            initialIndex={initial}
            onSelect={onSelect}
            onClose={() => close(true)}
          />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* FilterBar / FilterPill                                                                       */
/* ------------------------------------------------------------------------------------------ */

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterPillProps {
  /** Dimension name ("Status"). */
  label: string;
  options: readonly FilterOption[];
  value: string;
  onChange: (value: string) => void;
  /** Value that means "no filter" (shown without the active style). Default: the first option. */
  defaultValue?: string;
  align?: "start" | "end";
  className?: string;
  "data-testid"?: string;
}

/** Select-style filter button ("Status: All ▾") opening a single-choice menu. */
export function FilterPill({
  label,
  options,
  value,
  onChange,
  defaultValue = options[0]?.value,
  align,
  className,
  "data-testid": testId,
}: FilterPillProps) {
  const current = options.find((o) => o.value === value);
  return (
    <MenuButton
      label={label}
      triggerLabel={`${label}: ${current?.label ?? value}`}
      selectable="single"
      active={value !== defaultValue}
      align={align}
      className={className}
      data-testid={testId}
      items={options.map((o) => ({ id: o.value, label: o.label, checked: o.value === value }))}
      onSelect={onChange}
    >
      <span className="np-select-button__label">{label}:</span>
      <span className="np-select-button__value">{current?.label ?? value}</span>
    </MenuButton>
  );
}

export interface FilterBarProps {
  /** Accessible name of the group ("Payment filters"). */
  label: string;
  /** Filter pills, a search box, a date range… */
  children: ReactNode;
  /** Trailing actions, e.g. "Clear filters" or "Export". */
  actions?: ReactNode;
  className?: string;
}

/** One left-aligned row of filters above the content they scope; wraps on narrow screens. */
export function FilterBar({ label, children, actions, className }: FilterBarProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group of filter controls, not a form fieldset
    <div role="group" aria-label={label} className={cx("np-filter-bar", className)}>
      <div className="np-filter-bar__filters">{children}</div>
      {actions ? <div className="np-filter-bar__actions">{actions}</div> : null}
    </div>
  );
}
