import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { cx } from "../cx.js";
import { CheckIcon, CloseIcon, CopyIcon, InfoIcon, WarningIcon } from "../icons/index.js";
import { formatCountdown, truncateMiddle } from "../money.js";
import { Button } from "./Button.js";
import type { Tone } from "./Display.js";
import { type LayerHandle, type LayerPriority, pushLayer } from "./layers.js";

/* ------------------------------------------------------------------------------------------ */
/* LiveRegion                                                                                   */
/* ------------------------------------------------------------------------------------------ */

export interface LiveRegionProps {
  /** Text to announce; changing it announces again. */
  children?: ReactNode;
  /** Keep the region visible (default: screen-reader only). */
  visible?: boolean;
  className?: string;
}

/** Polite status announcements that never move focus. Mount it before the first message. */
export function LiveRegion({ children, visible = false, className }: LiveRegionProps) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className={cx(!visible && "np-sr-only", className)}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* CopyField                                                                                    */
/* ------------------------------------------------------------------------------------------ */

export interface CopyFieldProps {
  label: ReactNode;
  /** Full value (address, reference). Always copied in full. */
  value: string;
  /** Characters kept at each end in the truncated display. Default 6 / 6. */
  head?: number;
  tail?: number;
  copyLabel?: string;
  copiedLabel?: string;
  /** Extra content under the button ("Expires in 14:32"). */
  footer?: ReactNode;
  /** Injected for tests / non-secure contexts. Default `navigator.clipboard.writeText`. */
  writeText?: (text: string) => Promise<void>;
  /** Start with the full value revealed. */
  defaultRevealed?: boolean;
  className?: string;
  "data-testid"?: string;
}

/**
 * Deposit address display: middle-truncated, with "Show full address" so the payer can verify every
 * character before sending, and "Copy full address". Copy results are announced politely.
 */
export function CopyField({
  label,
  value,
  head = 6,
  tail = 6,
  copyLabel = "Copy full address",
  copiedLabel = "Address copied",
  footer,
  writeText,
  defaultRevealed = false,
  className,
  "data-testid": testId,
}: CopyFieldProps) {
  const auto = useId();
  const valueId = `np-cf${auto}`;
  const [revealed, setRevealed] = useState(defaultRevealed);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const truncated = truncateMiddle(value, head, tail);
  const canTruncate = truncated !== value;

  const copy = async () => {
    clearTimeout(timer.current);
    try {
      const write = writeText ?? ((t: string) => navigator.clipboard.writeText(t));
      await write(value);
      setState("copied");
    } catch {
      setState("failed");
      setRevealed(true);
    }
    timer.current = setTimeout(() => setState("idle"), 4000);
  };

  return (
    <div className={cx("np-copy-field", className)} data-testid={testId}>
      <p className="np-copy-field__label" id={`${valueId}-label`}>
        {label}
      </p>
      <p id={valueId} className={cx("np-copy-field__value", revealed && "np-copy-field__value--full")}>
        {revealed || !canTruncate ? (
          value
        ) : (
          <>
            <span aria-hidden="true">{truncated}</span>
            <span className="np-sr-only">{value}</span>
          </>
        )}
      </p>
      {canTruncate ? (
        <button
          type="button"
          className="np-link-button np-copy-field__reveal"
          aria-expanded={revealed}
          aria-controls={valueId}
          onClick={() => setRevealed((r) => !r)}
        >
          {revealed ? "Show shortened address" : "Show full address"}
        </button>
      ) : null}
      <Button
        variant="secondary"
        fullWidth
        onClick={copy}
        aria-describedby={`${valueId}-label`}
        leadingIcon={state === "copied" ? <CheckIcon size={20} /> : <CopyIcon size={20} />}
      >
        {state === "copied" ? copiedLabel : copyLabel}
      </Button>
      <LiveRegion>
        {state === "copied" ? copiedLabel : state === "failed" ? "Couldn’t copy. Select the address to copy it." : ""}
      </LiveRegion>
      {footer ? <div className="np-copy-field__footer">{footer}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Countdown                                                                                    */
/* ------------------------------------------------------------------------------------------ */

function toMs(deadline: number | Date | string): number {
  return deadline instanceof Date ? deadline.getTime() : typeof deadline === "string" ? Date.parse(deadline) : deadline;
}

/** Whole seconds remaining until `deadline` (epoch ms, Date or ISO string), ticking every second. */
export function useCountdown(deadline: number | Date | string, now: () => number = Date.now): number {
  const target = toMs(deadline);
  const calc = useCallback(() => Math.max(0, Math.ceil((target - now()) / 1000)), [target, now]);
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    const t = setInterval(() => {
      const v = calc();
      setLeft(v);
      if (v <= 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [calc]);
  return left;
}

export interface CountdownProps {
  deadline: number | Date | string;
  /** Called once when the countdown reaches zero. */
  onExpire?: () => void;
  /** Clock source (tests). */
  now?: () => number;
  className?: string;
}

/**
 * `mm:ss` text ("Quote refreshes in 00:42"). `role="timer"` is not live — announce expiry yourself
 * (e.g. swap the address for "This address has expired — do not send").
 */
export function Countdown({ deadline, onExpire, now, className }: CountdownProps) {
  const left = useCountdown(deadline, now);
  const fired = useRef(false);
  useEffect(() => {
    if (left <= 0 && !fired.current) {
      fired.current = true;
      onExpire?.();
    }
    if (left > 0) fired.current = false;
  }, [left, onExpire]);
  const iso = useMemo(() => `PT${left}S`, [left]);
  return (
    <time role="timer" aria-live="off" dateTime={iso} className={cx("np-countdown np-tabular", className)}>
      {formatCountdown(left)}
    </time>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Modal / Dialog                                                                               */
/* ------------------------------------------------------------------------------------------ */

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Footer actions (put the primary action last). */
  footer?: ReactNode;
  size?: "sm" | "md";
  /** Close when the backdrop is clicked. Default true; set false for flows that must not be lost. */
  dismissible?: boolean;
  /** Element to focus first (default: first focusable in the body, else the dialog). */
  initialFocus?: () => HTMLElement | null;
  /**
   * Stacking priority. Nested modals stack in open order; `step-up` (re-authentication) always
   * sits above every other open modal, whenever it opens.
   */
  priority?: LayerPriority;
  className?: string;
  "data-testid"?: string;
}

/**
 * Modal dialog: `aria-modal`, labelled by its title, focus trapped while open, `Esc` closes,
 * focus returns to the opener on close, page scroll locked. Modals stack: only the topmost open
 * modal handles Esc/Tab, and the scroll lock lasts until the last one closes.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
  initialFocus,
  priority = "default",
  className,
  "data-testid": testId,
}: ModalProps) {
  const auto = useId();
  const titleId = `np-m${auto}-t`;
  const descId = `np-m${auto}-d`;
  const ref = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const layer = useRef<LayerHandle | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const initialFocusRef = useRef(initialFocus);
  initialFocusRef.current = initialFocus;
  const priorityRef = useRef(priority);
  priorityRef.current = priority;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const handle = pushLayer(priorityRef.current);
    layer.current = handle;
    backdropRef.current?.style.setProperty("--np-layer", String(handle.level()));
    const node = ref.current;
    const target =
      initialFocusRef.current?.() ??
      node?.querySelector<HTMLElement>(
        FOCUSABLE.split(", ")
          .flatMap((sel) => [`.np-modal__body ${sel}`, `.np-modal__footer ${sel}`])
          .join(", "),
      ) ??
      node;
    target?.focus();
    return () => {
      handle.release();
      layer.current = null;
      if (opener && typeof opener.focus === "function" && opener.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Nested dialogs: only the topmost layer reacts (events bubble through parent dialogs).
    if (layer.current && !layer.current.isTop()) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.closest(".np-modal") === ref.current,
    );
    if (items.length === 0) {
      e.preventDefault();
      ref.current.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === ref.current)) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first?.focus();
    }
  };

  return (
    <div
      ref={backdropRef}
      className={cx("np-modal-backdrop", priority === "step-up" && "np-modal-backdrop--step-up")}
      data-testid={testId}
    >
      <button
        type="button"
        className="np-modal-scrim"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => dismissible && onCloseRef.current()}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx("np-modal", `np-modal--${size}`, className)}
        onKeyDown={onKeyDown}
      >
        <div className="np-modal__header">
          <h2 id={titleId} className="np-modal__title">
            {title}
          </h2>
          <button type="button" className="np-modal__close" aria-label="Close" onClick={() => onCloseRef.current()}>
            <CloseIcon size={20} />
          </button>
        </div>
        {description ? (
          <p id={descId} className="np-modal__description">
            {description}
          </p>
        ) : null}
        {children ? <div className="np-modal__body">{children}</div> : null}
        {footer ? <div className="np-modal__footer">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Toasts                                                                                       */
/* ------------------------------------------------------------------------------------------ */

export interface ToastInput {
  title: string;
  body?: string;
  tone?: Extract<Tone, "success" | "warning" | "danger" | "info">;
  /** Auto-dismiss after ms; 0 keeps it until closed. Default 6000. */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastApi {
  show: (t: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const TOAST_ICON = { success: CheckIcon, warning: WarningIcon, danger: WarningIcon, info: InfoIcon };

/** Toast stack in a polite live region (always mounted, so the first toast is announced). */
export function ToastProvider({ children, label = "Notifications" }: { children: ReactNode; label?: string }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setItems((xs) => [...xs.slice(-2), { ...t, id }]);
      const duration = t.duration ?? 6000;
      if (duration > 0)
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
    };
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <section className="np-toasts" aria-label={label}>
        <ol role="status" aria-live="polite" className="np-toasts__list">
          {items.map((t) => {
            const tone = t.tone ?? "info";
            const Icon = TOAST_ICON[tone];
            return (
              <li key={t.id} className={cx("np-toast", `np-toast--${tone}`)}>
                <Icon size={20} className="np-toast__icon" />
                <div className="np-toast__content">
                  <p className="np-toast__title">{t.title}</p>
                  {t.body ? <p className="np-toast__body">{t.body}</p> : null}
                </div>
                <button
                  type="button"
                  className="np-toast__close"
                  aria-label="Dismiss notification"
                  onClick={() => dismiss(t.id)}
                >
                  <CloseIcon size={16} />
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    </ToastContext.Provider>
  );
}
