/**
 * The app may be served from a sub-path (e.g. `/sheets/`); Vite's `base` setting is the single
 * source of truth. Router paths stay base-relative (`/t/:id`); only full-page URLs need the base.
 */

/** Base path without trailing slash: `/sheets`, or `` when served from the root. */
export const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Base-relative route for a tab id. */
export function tabPath(id: string | null, settingsId: string): string {
  if (!id) return "/";
  return id === settingsId ? "/settings" : `/t/${id}`;
}

/** Full URL path including the base, for comparisons with `location.pathname` and hard reloads. */
export function absolutePath(path: string): string {
  return `${BASE_PATH}${path}`;
}

/** Hard-navigates to the app root (used after reset/restore so all state reloads from storage). */
export function reloadAtRoot(): void {
  location.replace(absolutePath("/"));
}
