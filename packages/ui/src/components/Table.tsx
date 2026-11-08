import type { ReactNode } from "react";
import { cx } from "../cx.js";
import { ArrowLeftIcon, ArrowRightIcon } from "../icons/index.js";
import { Button } from "./Button.js";
import { Skeleton } from "./Display.js";
import { type LinkRenderer, renderAnchor } from "./Link.js";

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "start" | "end";
  /** Primary column: 14 px ink text, holds the row link when `rowHref` is set. */
  primary?: boolean;
  /** Use tabular numerals (amounts, times). */
  numeric?: boolean;
  /** Hide below 720 px container width. */
  hideOnNarrow?: boolean;
  className?: string;
}

export interface TableProps<T> {
  /** Accessible caption (visually hidden unless `showCaption`). */
  caption: string;
  showCaption?: boolean;
  columns: readonly TableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** Makes the primary cell a link that covers the whole row (hover + keyboard friendly). */
  rowHref?: (row: T) => string | undefined;
  /** Renders row links, e.g. with the app router's `<Link>` (client-side navigation). */
  renderLink?: LinkRenderer;
  loading?: boolean;
  /** Skeleton rows while loading. Default 3. */
  loadingRows?: number;
  /** Rendered in place of the body when there are no rows. */
  empty?: ReactNode;
  /** Footer (e.g. `<Pager>`). */
  footer?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

/** Dense data table: muted header, 56 px rows, row hover, loading and empty states. */
export function Table<T>({
  caption,
  showCaption,
  columns,
  rows,
  rowKey,
  rowHref,
  renderLink = renderAnchor,
  loading = false,
  loadingRows = 3,
  empty,
  footer,
  className,
  "data-testid": testId,
}: TableProps<T>) {
  const colClass = (c: TableColumn<T>) =>
    cx(
      c.align === "end" && "np-table__cell--end",
      c.primary && "np-table__cell--primary",
      c.numeric && "np-tabular",
      c.hideOnNarrow && "np-table__cell--wide-only",
      c.className,
    );
  const showEmpty = !loading && rows.length === 0;
  return (
    <div className={cx("np-table-wrap", className)} data-testid={testId}>
      <div className="np-table-scroll">
        <table className="np-table" aria-busy={loading || undefined}>
          <caption className={cx("np-table__caption", !showCaption && "np-sr-only")}>{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={colClass(c)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: loadingRows }, (_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows
                  <tr key={`sk${i}`} className="np-table__row np-table__row--loading">
                    {columns.map((c) => (
                      <td key={c.key} className={colClass(c)}>
                        <Skeleton width={c.primary ? "75" : "50"} />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => {
                  const href = rowHref?.(row);
                  return (
                    <tr key={rowKey(row)} className={cx("np-table__row", href && "np-table__row--link")}>
                      {columns.map((c) => (
                        <td key={c.key} className={colClass(c)}>
                          {href && c.primary
                            ? renderLink({ href, className: "np-table__link", children: c.cell(row) })
                            : c.cell(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
            {showEmpty ? (
              <tr>
                <td colSpan={columns.length} className="np-table__empty">
                  {empty ?? "Nothing here yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <span className="np-sr-only" role="status">
        {loading ? `Loading ${caption.toLowerCase()}…` : ""}
      </span>
      {footer}
    </div>
  );
}

export interface PagerProps {
  /** "Showing 1–20 payments". */
  summary?: ReactNode;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  className?: string;
}

/** Cursor pager (lists use cursors, not page numbers): summary + "Previous" / "Next page →". */
export function Pager({ summary, onPrevious, onNext, hasPrevious = false, hasNext = false, className }: PagerProps) {
  return (
    <nav className={cx("np-pager", className)} aria-label="Pagination">
      <p className="np-pager__summary">{summary}</p>
      <div className="np-pager__actions">
        {hasPrevious ? (
          <Button variant="secondary" onClick={onPrevious} leadingIcon={<ArrowLeftIcon size={16} />}>
            Previous
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onNext} disabled={!hasNext} trailingIcon={<ArrowRightIcon size={16} />}>
          Next page
        </Button>
      </div>
    </nav>
  );
}
