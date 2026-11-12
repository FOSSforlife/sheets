import { type JSX, onMount, Show } from "solid-js";
import { X } from "./icons";

/** Visual shell for dialogs. Focus moves inside on open; Escape is handled by DialogHost. */
export function Modal(props: {
  title: string;
  children: JSX.Element;
  footer?: JSX.Element;
  width?: string;
  onClose: () => void;
}) {
  let ref!: HTMLDivElement;
  onMount(() => {
    const focusable = ref.querySelector<HTMLElement>("[autofocus], input, select, textarea, button.primary");
    (focusable ?? ref).focus();
  });
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
      class="flex max-h-[85vh] flex-col rounded-lg border border-line bg-panel shadow-2xl outline-none"
      style={{ width: props.width ?? "28rem" }}
    >
      <div class="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 class="font-semibold">{props.title}</h2>
        <button type="button" class="icon-btn" onClick={props.onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div class="overflow-auto px-4 py-3 text-sm">{props.children}</div>
      <Show when={props.footer}>
        <div class="flex justify-end gap-2 border-t border-line px-4 py-3">{props.footer}</div>
      </Show>
    </div>
  );
}
