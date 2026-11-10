import {
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cx } from "../cx.js";
import { ChevronUpDownIcon, CloseIcon, MenuIcon, SearchIcon } from "../icons/index.js";
import { NearPayLogo } from "./Brand.js";
import { IconButton } from "./Button.js";
import { ModePill } from "./Display.js";
import { type LinkRenderer, renderAnchor } from "./Link.js";
import { type Mode, ModeSwitch } from "./Navigation.js";
import { MenuButton, type MenuEntry } from "./Overlay.js";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode;
  /** Marks the current page (soft-mint pill, `aria-current="page"`). */
  current?: boolean;
}

export interface NavGroup {
  /** Group heading ("Workspace", "Build"); names the group's list for assistive technology. */
  label?: string;
  /** Keep the heading for screen readers only (the v2 sidebar separates groups with a rule). */
  hideLabel?: boolean;
  items: readonly NavItem[];
}

export interface AppShellWorkspace {
  name: string;
  subtitle?: string;
  /** Avatar initial in the switcher; defaults to the name's first letter. Pass "" for no avatar. */
  initial?: string;
  /** Button mode: called when the switcher is pressed (e.g. to open a dialog). */
  onSwitch?: () => void;
  /** Menu mode: the switcher opens a menu of workspaces/actions. */
  menu?: { items: readonly MenuEntry[]; onSelect: (id: string) => void; label?: string };
}

export interface AppShellSearch {
  /** Accessible name. Default "Search". */
  label?: string;
  placeholder?: string;
  /** Controlled value (with `onChange`); omit for an uncontrolled field (`defaultValue`). */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Called on Enter with the current value. */
  onSubmit?: (value: string) => void;
  name?: string;
  "data-testid"?: string;
}

export interface AppShellProps {
  /** Brand block; defaults to the NearPay mark + wordmark (on navy). */
  brand?: ReactNode;
  /**
   * Workspace block: a menu (`menu`), a button (`onSwitch`), or — with neither — a static,
   * non-interactive label (single-workspace users, ops console).
   */
  workspace: AppShellWorkspace;
  nav: readonly NavGroup[];
  /** Links under the nav ("Help & support"). */
  footerLinks?: readonly { label: string; href: string }[];
  /** Actions at the bottom of the sidebar, e.g. a "Sign out" button. */
  footerActions?: ReactNode;
  user?: { name: string; role?: string };
  /** Usually a `<Breadcrumb>`. */
  breadcrumb?: ReactNode;
  /** Live/Test mode. With `onModeChange` the top bar shows the Live/Test switch, otherwise a static pill. */
  mode?: Mode;
  onModeChange?: (mode: Mode) => void;
  /** Custom mode control; replaces the built-in switch / pill. */
  modeSwitch?: ReactNode;
  /** Search field at the start of the top bar ("Search payments, customers, links"). */
  search?: AppShellSearch;
  /** Controlled mobile drawer state (omit for internal state). */
  navOpen?: boolean;
  onNavOpenChange?: (open: boolean) => void;
  /** Called when a nav item is activated; the mobile drawer closes afterwards. */
  onNavigate?: (item: NavItem, event: MouseEvent<HTMLAnchorElement>) => void;
  /** Renders nav and footer links (client-side routing). */
  renderLink?: LinkRenderer;
  notifications?: { unread?: number; onClick?: () => void };
  /** Extra top-bar content, right side. */
  topbarActions?: ReactNode;
  /** Accessible name of the main navigation. Default "Workspace". */
  navLabel?: string;
  children: ReactNode;
  className?: string;
}

function ShellSearch({ search }: { search: AppShellSearch }) {
  const id = useId();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem(search.name ?? "q");
    if (input instanceof HTMLInputElement) search.onSubmit?.(input.value);
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: <form role="search"> submits on Enter; <search> is not yet in every engine
    <form role="search" className="np-shell__search" onSubmit={onSubmit} data-testid={search["data-testid"]}>
      <label htmlFor={`np-q${id}`} className="np-sr-only">
        {search.label ?? "Search"}
      </label>
      <SearchIcon size={16} className="np-shell__search-icon" />
      <input
        id={`np-q${id}`}
        type="search"
        name={search.name ?? "q"}
        className="np-shell__search-input"
        placeholder={search.placeholder}
        autoComplete="off"
        value={search.value}
        defaultValue={search.value === undefined ? search.defaultValue : undefined}
        onChange={(e) => search.onChange?.(e.target.value)}
      />
    </form>
  );
}

/**
 * Workspace shell (v2): navy sidebar (brand, workspace switcher, nav groups, footer) + top bar
 * (search, Live/Test switch, notifications) + main region on the canvas. Below 960 px the layout
 * stacks: a navy bar with the brand and a menu button sits on top, and the sidebar opens as a
 * drawer. The sidebar colour runs the full page height however long the content is.
 */
export function AppShell({
  brand,
  workspace,
  nav,
  footerLinks = [],
  footerActions,
  user,
  breadcrumb,
  mode,
  onModeChange,
  modeSwitch,
  search,
  navOpen,
  onNavOpenChange,
  onNavigate,
  renderLink = renderAnchor,
  notifications,
  topbarActions,
  navLabel = "Workspace",
  children,
  className,
}: AppShellProps) {
  const auto = useId();
  const sidebarId = `np-s${auto}`;
  const mainId = `np-main${auto}`;
  const [ownOpen, setOwnOpen] = useState(false);
  const open = navOpen ?? ownOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (navOpen === undefined) setOwnOpen(next);
      onNavOpenChange?.(next);
    },
    [navOpen, onNavOpenChange],
  );
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
      // Return focus to the menu button only if focus was left inside the closed drawer.
      const active = document.activeElement;
      if (!active || active === document.body || active.closest(".np-shell__sidebar")) menuRef.current?.focus();
    }
  }, [open, setOpen]);

  const unread = notifications?.unread ?? 0;
  const initial = workspace.initial ?? workspace.name;
  const avatar = initial ? (
    <span className="np-workspace-switcher__avatar" aria-hidden="true">
      {initial.slice(0, 1).toUpperCase()}
    </span>
  ) : null;
  const switcherText = (
    <span className="np-workspace-switcher__text">
      <span className="np-workspace-switcher__name">{workspace.name}</span>
      {workspace.subtitle ? <span className="np-workspace-switcher__sub">{workspace.subtitle}</span> : null}
    </span>
  );
  const switcherContent = (
    <>
      {avatar}
      {switcherText}
      <ChevronUpDownIcon size={16} className="np-workspace-switcher__icon" />
    </>
  );
  const brandNode = brand ?? <NearPayLogo size="sm" />;
  const modeNode =
    modeSwitch ??
    (mode && onModeChange ? (
      <ModeSwitch value={mode} onChange={onModeChange} />
    ) : mode ? (
      <ModePill mode={mode} />
    ) : null);

  return (
    <div className={cx("np-shell", open && "np-shell--nav-open", className)}>
      <a href={`#${mainId}`} className="np-skip-link">
        Skip to content
      </a>
      <div className="np-shell__mobilebar np-surface-navy">
        <span className="np-shell__mobilebrand">{brandNode}</span>
        <IconButton
          ref={menuRef}
          className="np-shell__menu"
          label="Open menu"
          icon={<MenuIcon size={20} />}
          aria-expanded={open}
          aria-controls={sidebarId}
          onClick={() => setOpen(true)}
        />
      </div>
      <aside id={sidebarId} className="np-shell__sidebar np-surface-navy">
        <div className="np-shell__brand">
          {brandNode}
          <IconButton
            ref={closeRef}
            className="np-shell__close"
            label="Close menu"
            icon={<CloseIcon size={20} />}
            onClick={() => setOpen(false)}
          />
        </div>
        {workspace.menu ? (
          <MenuButton
            variant="plain"
            label={workspace.menu.label ?? "Workspaces"}
            triggerLabel={`Switch workspace, current: ${workspace.name}`}
            items={workspace.menu.items}
            onSelect={workspace.menu.onSelect}
            className="np-workspace-switcher__anchor"
            triggerClassName="np-workspace-switcher"
          >
            {switcherContent}
          </MenuButton>
        ) : workspace.onSwitch ? (
          <button
            type="button"
            className="np-workspace-switcher"
            onClick={workspace.onSwitch}
            aria-label={`Switch workspace, current: ${workspace.name}`}
          >
            {switcherContent}
          </button>
        ) : (
          <div className="np-workspace-switcher np-workspace-switcher--static">
            {avatar}
            {switcherText}
          </div>
        )}
        <nav aria-label={navLabel} className="np-shell__nav">
          {nav.map((g, gi) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: nav groups are static
            <div key={gi} className="np-nav-group">
              {g.label ? (
                <p className={cx("np-nav-group__label", g.hideLabel && "np-sr-only")} id={`${sidebarId}-g${gi}`}>
                  {g.label}
                </p>
              ) : null}
              <ul className="np-nav-group__list" aria-labelledby={g.label ? `${sidebarId}-g${gi}` : undefined}>
                {g.items.map((it) => (
                  <li key={it.id}>
                    {renderLink({
                      href: it.href,
                      className: cx("np-nav-item", it.current && "np-nav-item--current"),
                      "aria-current": it.current ? "page" : undefined,
                      onClick: (e) => {
                        onNavigate?.(it, e);
                        if (open) setOpen(false);
                      },
                      children: (
                        <>
                          {it.icon}
                          <span>{it.label}</span>
                        </>
                      ),
                    })}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="np-shell__footer">
          {footerLinks.map((l) => (
            <span key={l.href} className="np-shell__footer-item">
              {renderLink({ href: l.href, className: "np-shell__footer-link", children: l.label })}
            </span>
          ))}
          {user ? (
            <p className="np-shell__user">
              {user.name}
              {user.role ? ` · ${user.role}` : ""}
            </p>
          ) : null}
          {footerActions ? <div className="np-shell__footer-actions">{footerActions}</div> : null}
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
          {search ? <ShellSearch search={search} /> : null}
          {breadcrumb && !search ? <div className="np-shell__breadcrumb">{breadcrumb}</div> : null}
          <span className="np-shell__topbar-spacer" />
          <div className="np-shell__topbar-actions">
            {modeNode}
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
        {breadcrumb && search ? <div className="np-shell__crumbs">{breadcrumb}</div> : null}
        <main id={mainId} className="np-shell__main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
