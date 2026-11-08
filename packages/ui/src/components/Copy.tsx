import { type ReactNode, useEffect, useRef, useState } from "react";
import { cx } from "../cx.js";
import { CheckIcon, CopyIcon } from "../icons/index.js";
import { truncateMiddle } from "../money.js";
import { LiveRegion } from "./Feedback.js";

export interface CopyTextProps {
  /** Value copied in full. */
  value: string;
  /** Visible text; defaults to `value`. */
  children?: ReactNode;
  /** What is being copied, for the button name ("Copy payment reference"). Default: the value. */
  label?: string;
  /** Announced politely after a successful copy. Default "Copied". */
  copiedLabel?: string;
  /** Monospace value (ids, hashes). */
  mono?: boolean;
  /** Injected for tests / non-secure contexts. Default `navigator.clipboard.writeText`. */
  writeText?: (text: string) => Promise<void>;
  className?: string;
  "data-testid"?: string;
}

/**
 * Short inline value with a small copy button (references, amounts, short ids). The result is
 * announced politely; on failure the text is selected so it can be copied by hand.
 */
export function CopyText({
  value,
  children,
  label,
  copiedLabel = "Copied",
  mono = false,
  writeText,
  className,
  "data-testid": testId,
}: CopyTextProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const valueRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    clearTimeout(timer.current);
    try {
      await (writeText ?? ((t: string) => navigator.clipboard.writeText(t)))(value);
      setState("copied");
    } catch {
      setState("failed");
      const node = valueRef.current;
      const sel = typeof window !== "undefined" ? window.getSelection() : null;
      if (node && sel) {
        const range = document.createRange();
        range.selectNodeContents(node);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    timer.current = setTimeout(() => setState("idle"), 3000);
  };

  return (
    <span className={cx("np-copy-text", mono && "np-copy-text--mono", className)} data-testid={testId}>
      <span ref={valueRef} className="np-copy-text__value">
        {children ?? value}
      </span>
      <button
        type="button"
        className="np-copy-text__button"
        aria-label={`Copy ${label ?? value}`}
        title={`Copy ${label ?? value}`}
        onClick={copy}
      >
        {state === "copied" ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
      </button>
      <LiveRegion>
        {state === "copied" ? copiedLabel : state === "failed" ? "Couldn’t copy. The text is selected." : ""}
      </LiveRegion>
    </span>
  );
}

export interface IdTextProps extends Omit<CopyTextProps, "children" | "mono"> {
  /** Shorten long ids in the middle (`pi_01J9…X4Q2`); the full id is still read out and copied. */
  head?: number;
  tail?: number;
}

/** Monospace identifier (payment id, tx hash) with copy. Long ids may be middle-truncated for display. */
export function IdText({ value, head, tail, label = "ID", ...rest }: IdTextProps) {
  const short = head !== undefined || tail !== undefined ? truncateMiddle(value, head ?? 8, tail ?? 6) : value;
  return (
    <CopyText value={value} label={label} mono {...rest}>
      {short === value ? (
        value
      ) : (
        <>
          <span aria-hidden="true" title={value}>
            {short}
          </span>
          <span className="np-sr-only">{value}</span>
        </>
      )}
    </CopyText>
  );
}
