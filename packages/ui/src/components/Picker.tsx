import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import { cx } from "../cx.js";
import { ChevronDownIcon } from "../icons/index.js";
import { Avatar } from "./Choice.js";

/**
 * Picker styles (`np-picker*`): the "Pay with" network / token dropdowns. The class structure is
 * the checkout's `src/ui/Picker.tsx` one-for-one (`ck-picker__x` → `np-picker__x`), so the checkout
 * can switch its prefix and drop its own picker CSS:
 *
 *   np-pickers (two-up grid) › np-picker [--open] › np-picker__label, np-picker__trigger
 *   [--selected] › (avatar) np-picker__value › np-picker__title [np-picker__placeholder],
 *   np-picker__sub; np-picker__panel [--sheet] › np-picker__sheet-head › np-picker__sheet-title,
 *   np-picker__close; np-picker__search; np-picker__notice; np-picker__list › np-picker__group ›
 *   np-picker__group-label; np-picker__option [--active --selected --disabled] › (avatar)
 *   np-picker__text › np-picker__title, np-picker__sub; np-picker__trail; np-picker__check;
 *   np-picker__empty; np-picker__footer; np-picker__backdrop.
 *
 * v2 adds the trigger *card* (`np-picker__trigger--card`): the label sits inside the card above
 * the value ("Network / Base", "Token / USDC 4.52101"), and the chosen trigger gets a 2 px teal
 * border (`--selected`). `PickerTrigger` renders that markup.
 */

export interface PickerTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  /** Label inside the card ("Network", "Token"). Omit when the label sits above the trigger. */
  caption?: ReactNode;
  /** The chosen value ("Base", "USDC"); `null`/`undefined` shows `placeholder`. */
  value?: ReactNode;
  placeholder?: ReactNode;
  /** Avatar initial ("B") or a custom node (chain/token logo). */
  avatar?: ReactNode;
  /** Balance after the value, in secondary text with tabular numerals ("4.52101"). */
  balance?: ReactNode;
  /** Second line under the value. */
  description?: ReactNode;
  /** Emphasise as the chosen / active picker: 2 px teal border. */
  selected?: boolean;
  /** Panel open (sets `aria-expanded`, same border as selected). */
  open?: boolean;
}

/** The picker trigger card. Pair with your own panel (`aria-controls`) or the checkout's picker logic. */
export const PickerTrigger = forwardRef<HTMLButtonElement, PickerTriggerProps>(function PickerTrigger(
  {
    caption,
    value,
    placeholder = "Choose",
    avatar,
    balance,
    description,
    selected = false,
    open,
    className,
    type = "button",
    ...rest
  },
  ref,
) {
  const hasValue = value !== null && value !== undefined && value !== "";
  return (
    <button
      ref={ref}
      type={type}
      aria-expanded={open}
      className={cx(
        "np-picker__trigger",
        caption != null && "np-picker__trigger--card",
        selected && "np-picker__trigger--selected",
        className,
      )}
      {...rest}
    >
      {hasValue && avatar != null ? typeof avatar === "string" ? <Avatar initial={avatar} size="sm" /> : avatar : null}
      <span className="np-picker__value">
        {caption != null ? <span className="np-picker__caption">{caption}</span> : null}
        <span className={cx("np-picker__title", !hasValue && "np-picker__placeholder")}>
          {hasValue ? value : placeholder}
          {hasValue && balance != null ? (
            <>
              {" "}
              <span className="np-picker__balance">{balance}</span>
            </>
          ) : null}
        </span>
        {hasValue && description != null ? <span className="np-picker__sub">{description}</span> : null}
      </span>
      <ChevronDownIcon size={16} className="np-picker__chevron" />
    </button>
  );
});
