import { onMount } from "solid-js";

/** Text input that replaces a label while renaming. Enter/blur commits, Escape cancels. */
export function InlineEdit(props: {
  value: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
  class?: string;
}) {
  let ref!: HTMLInputElement;
  let done = false;
  onMount(() => {
    ref.focus();
    ref.select();
  });
  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
    if (commit && ref.value.trim() !== props.value) props.onCommit(ref.value);
    else props.onCancel();
  };
  return (
    <input
      ref={ref}
      class={`input input-sm min-w-0 flex-1 ${props.class ?? ""}`}
      value={props.value}
      onClick={(e) => e.stopPropagation()}
      onDblClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
    />
  );
}
