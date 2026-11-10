/**
 * Inline SVG icon set (24 × 24 grid, 1.75 px stroke, currentColor). Drawn for NearPay — no icon
 * font, no remote assets. Icons are decorative (`aria-hidden`) unless a `title` is given.
 * The geometry lives in `shapes.ts`; `@nearpay-internal/ui/icons-svg` renders the same icons as
 * plain SVG strings without React.
 */
import { type SVGProps, useId } from "react";
import * as S from "./shapes.js";

export { ICON_SHAPES, type IconShape, type IconShapeName } from "./shapes.js";
export { ICON_NAMES, type IconSvgOptions, iconSvg, shapeToSvg } from "./svg.js";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** Pixel size (width = height). Default 20. */
  size?: number;
  /** Accessible name; when omitted the icon is hidden from assistive technology. */
  title?: string;
}

/** Renders one icon shape; the exported `*Icon` components are thin wrappers around it. */
export function IconBase({
  shape,
  size = shape.size ?? 20,
  title,
  className,
  ...rest
}: IconProps & { shape: S.IconShape }) {
  const id = useId();
  const labelled = title ? { role: "img", "aria-labelledby": id } : { "aria-hidden": true as const };
  const paint = shape.filled
    ? { fill: "currentColor" }
    : {
        fill: "none",
        stroke: "currentColor",
        strokeWidth: shape.strokeWidth ?? 1.75,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
      };
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: titled when `title` is given, otherwise aria-hidden
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...paint}
      focusable="false"
      className={className ? `np-icon ${className}` : "np-icon"}
      {...labelled}
      {...rest}
    >
      {title ? <title id={id}>{title}</title> : null}
      {shape.nodes.map(([Tag, attrs], i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static geometry
        <Tag key={i} {...attrs} />
      ))}
    </svg>
  );
}

export const ArrowLeftIcon = (p: IconProps) => <IconBase shape={S.ARROW_LEFT} {...p} />;
export const ArrowRightIcon = (p: IconProps) => <IconBase shape={S.ARROW_RIGHT} {...p} />;
export const CheckIcon = (p: IconProps) => <IconBase shape={S.CHECK} {...p} />;
export const ClockIcon = (p: IconProps) => <IconBase shape={S.CLOCK} {...p} />;
export const ShieldCheckIcon = (p: IconProps) => <IconBase shape={S.SHIELD_CHECK} {...p} />;
export const WalletIcon = (p: IconProps) => <IconBase shape={S.WALLET} {...p} />;
export const SearchIcon = (p: IconProps) => <IconBase shape={S.SEARCH} {...p} />;
export const ChevronDownIcon = (p: IconProps) => <IconBase shape={S.CHEVRON_DOWN} {...p} />;
export const ChevronRightIcon = (p: IconProps) => <IconBase shape={S.CHEVRON_RIGHT} {...p} />;
/** Up/down chevrons: a switcher that opens a list (workspace switcher). */
export const ChevronUpDownIcon = (p: IconProps) => <IconBase shape={S.CHEVRON_UP_DOWN} {...p} />;
export const CopyIcon = (p: IconProps) => <IconBase shape={S.COPY} {...p} />;
export const ExternalLinkIcon = (p: IconProps) => <IconBase shape={S.EXTERNAL_LINK} {...p} />;
export const CardIcon = (p: IconProps) => <IconBase shape={S.CARD} {...p} />;
export const BellIcon = (p: IconProps) => <IconBase shape={S.BELL} {...p} />;
export const MenuIcon = (p: IconProps) => <IconBase shape={S.MENU} {...p} />;
export const InfoIcon = (p: IconProps) => <IconBase shape={S.INFO} {...p} />;
export const WarningIcon = (p: IconProps) => <IconBase shape={S.WARNING} {...p} />;
export const CloseIcon = (p: IconProps) => <IconBase shape={S.CLOSE} {...p} />;
export const RefreshIcon = (p: IconProps) => <IconBase shape={S.REFRESH} {...p} />;
export const LogOutIcon = (p: IconProps) => <IconBase shape={S.LOG_OUT} {...p} />;
export const MoreIcon = (p: IconProps) => <IconBase shape={S.MORE} {...p} />;
/** Small filled caret used after select-like labels ("All payments ▾", workspace switcher). */
export const CaretDownIcon = (p: IconProps) => <IconBase shape={S.CARET_DOWN} {...p} />;
/** The NearPay mark as a one-colour icon (currentColor). For the brand colours use `NearPayMark`. */
export const NearPayMarkIcon = (p: IconProps) => <IconBase shape={S.NEARPAY_MARK} {...p} />;

export const icons = {
  "arrow-left": ArrowLeftIcon,
  "arrow-right": ArrowRightIcon,
  check: CheckIcon,
  clock: ClockIcon,
  "shield-check": ShieldCheckIcon,
  wallet: WalletIcon,
  search: SearchIcon,
  "chevron-down": ChevronDownIcon,
  "chevron-right": ChevronRightIcon,
  "chevron-up-down": ChevronUpDownIcon,
  copy: CopyIcon,
  "external-link": ExternalLinkIcon,
  card: CardIcon,
  bell: BellIcon,
  menu: MenuIcon,
  info: InfoIcon,
  warning: WarningIcon,
  close: CloseIcon,
  refresh: RefreshIcon,
  "log-out": LogOutIcon,
  more: MoreIcon,
  "caret-down": CaretDownIcon,
} as const;

export type IconName = keyof typeof icons;
