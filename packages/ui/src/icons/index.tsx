/**
 * Inline SVG icon set (24 × 24 grid, 1.75 px stroke, currentColor). Drawn for NearPay — no icon
 * font, no remote assets. Icons are decorative (`aria-hidden`) unless a `title` is given.
 */
import { type ReactNode, type SVGProps, useId } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** Pixel size (width = height). Default 20. */
  size?: number;
  /** Accessible name; when omitted the icon is hidden from assistive technology. */
  title?: string;
}

function Svg({ size = 20, title, className, children, ...rest }: IconProps & { children: ReactNode }) {
  const id = useId();
  const labelled = title ? { role: "img", "aria-labelledby": id } : { "aria-hidden": true as const };
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: titled when `title` is given, otherwise aria-hidden
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      className={className ? `np-icon ${className}` : "np-icon"}
      {...labelled}
      {...rest}
    >
      {title ? <title id={id}>{title}</title> : null}
      {children}
    </svg>
  );
}

export const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);
export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12.5l5 5 10-11" />
  </Svg>
);
export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const ShieldCheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6l7-3z" />
    <path d="M8.75 12.25l2.25 2.25 4.25-4.5" />
  </Svg>
);
export const WalletIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7.5A2.5 2.5 0 016.5 5H18v3" />
    <rect x="4" y="8" width="16" height="11" rx="2" />
    <path d="M16 13.5h1.5" />
  </Svg>
);
export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.25-4.25" />
  </Svg>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 10l5 5 5-5" />
  </Svg>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 7l5 5-5 5" />
  </Svg>
);
export const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 9V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7a2 2 0 002 2h3" />
  </Svg>
);
export const ExternalLinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 16L16.5 7.5M9.5 7.5h7v7" />
  </Svg>
);
export const CardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
    <path d="M3.5 10h17M7 14.5h4" />
  </Svg>
);
export const BellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 16.5V11a5.5 5.5 0 0111 0v5.5l1.5 1.5H5l1.5-1.5z" />
    <path d="M10 20.5h4" />
  </Svg>
);
export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);
export const WarningIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.3 4.6L3.1 17.2A2 2 0 004.8 20h14.4a2 2 0 001.7-2.8L13.7 4.6a2 2 0 00-3.4 0z" />
    <path d="M12 9.5v4M12 16.75h.01" />
  </Svg>
);
export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

/** Small filled caret used after select-like labels ("All payments ▾", workspace switcher). */
export const CaretDownIcon = (p: IconProps) => (
  <Svg size={12} {...p} stroke="none" fill="currentColor">
    <path d="M7 9.5h10l-5 6z" />
  </Svg>
);

/** The NearPay "N" mark (filled, brand teal by default via currentColor). */
export const NearPayMark = ({ size = 20, title, className, ...rest }: IconProps) => {
  const id = useId();
  const labelled = title ? { role: "img", "aria-labelledby": id } : { "aria-hidden": true as const };
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: titled when `title` is given, otherwise aria-hidden
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      focusable="false"
      className={className ? `np-icon ${className}` : "np-icon"}
      {...labelled}
      {...rest}
    >
      {title ? <title id={id}>{title}</title> : null}
      <path d="M3 4.5A1.5 1.5 0 014.5 3h2.2c.5 0 1 .26 1.27.7L15 15.2V4.5A1.5 1.5 0 0116.5 3h3A1.5 1.5 0 0121 4.5v15a1.5 1.5 0 01-1.5 1.5h-2.2c-.5 0-1-.26-1.27-.7L9 8.8v10.7A1.5 1.5 0 017.5 21h-3A1.5 1.5 0 013 19.5v-15z" />
    </svg>
  );
};

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
  copy: CopyIcon,
  "external-link": ExternalLinkIcon,
  card: CardIcon,
  bell: BellIcon,
  menu: MenuIcon,
  info: InfoIcon,
  warning: WarningIcon,
  close: CloseIcon,
  "caret-down": CaretDownIcon,
} as const;

export type IconName = keyof typeof icons;
