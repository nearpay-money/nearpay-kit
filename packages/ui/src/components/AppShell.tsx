import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { cx } from "../cx.js";
import { CaretDownIcon, CloseIcon, MenuIcon, NearPayMark } from "../icons/index.js";
import { IconButton } from "./Button.js";
import { ModePill } from "./Display.js";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode;
  /** Marks the current page (soft-mint pill, `aria-current="page"`). */
  current?: boolean;
}

export interface NavGroup {
  /** Group heading ("Workspace", "Operations"). */
  label?: string;
  items: readonly NavItem[];
}

export interface AppShellProps {
  /** Brand block; defaults to the NearPay mark + wordmark. */
  brand?: ReactNode;
  workspace: { name: string; subtitle?: string; onSwitch?: () => void };
  nav: readonly NavGroup[];
  /** Links under the nav ("Help & support"). */
  footerLinks?: readonly { label: string; href: string }[];
  user?: { name: string; role?: string };
  /** Usually a `<Breadcrumb>`. */
  breadcrumb?: ReactNode;
  /** Live/Test pill in the top bar. */
  mode?: "live" | "test";
  notifications?: { unread?: number; onClick?: () => void };
  /** Extra top-bar content, right side. */
  topbarActions?: ReactNode;
  /** Accessible name of the main navigation. Default "Workspace". */
  navLabel?: string;
  children: ReactNode;
  className?: string;
}

export function NearPayLogo({ className }: { className?: string }) {
  return (
    <span className={cx("np-logo", className)}>
      <NearPayMark size={20} className="np-logo__mark" />
      <span className="np-logo__word">NearPay</span>
    </span>
  );
}

/**
 * Workspace shell: left sidebar (switcher, nav groups, footer) + top bar (breadcrumb, mode pill,
 * notifications) + main region. Below 960 px the sidebar becomes a drawer behind a menu button.
 */
export function AppShell({
  brand,
  workspace,
  nav,
  footerLinks = [],
  user,
  breadcrumb,
  mode,
  notifications,
  topbarActions,
  navLabel = "Workspace",
  children,
  className,
}: AppShellProps) {
  const auto = useId();
  const sidebarId = `np-s${auto}`;
  const mainId = `np-main${auto}`;
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      closeRef.current?.focus();
      const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setOpen(false);
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      menuRef.current?.focus();
    }
  }, [open]);

  const unread = notifications?.unread ?? 0;

  return (
    <div className={cx("np-shell", open && "np-shell--nav-open", className)}>
      <a href={`#${mainId}`} className="np-skip-link">
        Skip to content
      </a>
      <aside id={sidebarId} className="np-shell__sidebar">
        <div className="np-shell__brand">
          {brand ?? <NearPayLogo />}
          <IconButton
            ref={closeRef}
            className="np-shell__close"
            label="Close menu"
            icon={<CloseIcon size={20} />}
            onClick={() => setOpen(false)}
          />
        </div>
        <button
          type="button"
          className="np-workspace-switcher"
          onClick={workspace.onSwitch}
          aria-label={`Switch workspace, current: ${workspace.name}`}
        >
          <span className="np-workspace-switcher__name">
            {workspace.name}
            <CaretDownIcon size={12} />
          </span>
          {workspace.subtitle ? <span className="np-workspace-switcher__sub">{workspace.subtitle}</span> : null}
        </button>
        <nav aria-label={navLabel} className="np-shell__nav">
          {nav.map((g, gi) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: nav groups are static
            <div key={gi} className="np-nav-group">
              {g.label ? (
                <p className="np-nav-group__label" id={`${sidebarId}-g${gi}`}>
                  {g.label}
                </p>
              ) : null}
              <ul className="np-nav-group__list" aria-labelledby={g.label ? `${sidebarId}-g${gi}` : undefined}>
                {g.items.map((it) => (
                  <li key={it.id}>
                    <a
                      href={it.href}
                      className={cx("np-nav-item", it.current && "np-nav-item--current")}
                      aria-current={it.current ? "page" : undefined}
                    >
                      {it.icon}
                      <span>{it.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="np-shell__footer">
          {footerLinks.map((l) => (
            <a key={l.href} href={l.href} className="np-shell__footer-link">
              {l.label}
            </a>
          ))}
          {user ? (
            <p className="np-shell__user">
              {user.name}
              {user.role ? ` · ${user.role}` : ""}
            </p>
          ) : null}
        </div>
      </aside>
      <button
        type="button"
        className="np-shell__scrim"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => setOpen(false)}
      />
      <div className="np-shell__body">
        <header className="np-shell__topbar">
          <IconButton
            ref={menuRef}
            className="np-shell__menu"
            label="Open menu"
            icon={<MenuIcon size={20} />}
            aria-expanded={open}
            aria-controls={sidebarId}
            onClick={() => setOpen(true)}
          />
          <div className="np-shell__breadcrumb">{breadcrumb}</div>
          <div className="np-shell__topbar-actions">
            {mode ? <ModePill mode={mode} /> : null}
            {topbarActions}
            {notifications ? (
              <button type="button" className="np-notifications" onClick={notifications.onClick}>
                <span>Notifications</span>
                <span
                  className={cx("np-notifications__dot", unread > 0 && "np-notifications__dot--unread")}
                  aria-hidden="true"
                />
                <span className="np-sr-only">{unread > 0 ? `, ${unread} unread` : ", none unread"}</span>
              </button>
            ) : null}
          </div>
        </header>
        <main id={mainId} className="np-shell__main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
