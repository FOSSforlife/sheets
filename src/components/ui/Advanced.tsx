import type { JSX } from "solid-js";

/** Collapsed-by-default "Advanced options" section. */
export function Advanced(props: { children: JSX.Element; label?: string }) {
  return (
    <details class="advanced mt-3 rounded border border-line">
      <summary class="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted">
        {props.label ?? "Advanced options"}
      </summary>
      <div class="space-y-3 border-t border-line px-3 py-3">{props.children}</div>
    </details>
  );
}

export function Warnings(props: { items: string[] }) {
  return (
    <>
      {props.items.length > 0 && (
        <ul class="mt-3 space-y-1 rounded border border-warn/40 bg-warn/10 px-3 py-2 text-xs">
          {props.items.map((w) => (
            <li>⚠ {w}</li>
          ))}
        </ul>
      )}
    </>
  );
}
