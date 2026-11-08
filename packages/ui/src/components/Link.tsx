import type { AnchorHTMLAttributes, ReactNode } from "react";

/** Props a link renderer receives: always an `href`, plus class, current-page state, content and handlers. */
export interface LinkRenderProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  className?: string;
  children?: ReactNode;
}

/**
 * Renders a link. Pass one to components that render links (`Table`, `AppShell`, `Breadcrumb`,
 * `MenuButton`) so they use client-side routing, e.g. with React Router:
 * `renderLink={({ href, ...p }) => <RouterLink to={href} {...p} />}`. Spread every prop: the
 * component relies on `className`, `aria-current` and `onClick`.
 */
export type LinkRenderer = (props: LinkRenderProps) => ReactNode;

/** The default renderer: a plain `<a>`. */
export const renderAnchor: LinkRenderer = (props) => <a {...props} />;
