import { For, Show } from "solid-js";
import type { ConversionPlan } from "../../domain/conversion";
import { TYPE_NAMES } from "../../domain/types";
import { type DialogProps, openDialog } from "../../stores/dialogs";
import { IS_MAC } from "../../stores/keymap";
import { Modal } from "../ui/Modal";

function ConversionDialog(props: { plan: ConversionPlan; columnName: string } & DialogProps<boolean>) {
  const p = props.plan;
  return (
    <Modal
      title={`Convert “${props.columnName}” to ${TYPE_NAMES[p.to]}?`}
      onClose={() => props.close(false)}
      footer={
        <>
          <button type="button" class="btn" onClick={() => props.close(false)}>
            Cancel
          </button>
          <button type="button" class="btn primary" onClick={() => props.close(true)}>
            Convert
          </button>
        </>
      }
    >
      <ul class="mb-3 list-disc space-y-1 pl-5">
        <Show when={p.changed > 0}>
          <li>
            <b>{p.changed}</b> value{p.changed === 1 ? "" : "s"} will change.
          </li>
        </Show>
        <Show when={p.nulled > 0}>
          <li>
            <b>{p.nulled}</b> value{p.nulled === 1 ? "" : "s"} can't be converted and will become empty.
          </li>
        </Show>
      </ul>
      <table class="w-full text-left text-xs">
        <thead class="text-muted">
          <tr>
            <th class="pb-1 font-medium">Before</th>
            <th class="pb-1 font-medium">After</th>
          </tr>
        </thead>
        <tbody>
          <For each={p.samples}>
            {(s) => (
              <tr class="border-t border-line">
                <td class="py-1 pr-2 font-mono">{s.before}</td>
                <td class="py-1 font-mono" classList={{ "text-muted italic": s.after === "null" }}>
                  {s.after === "null" ? "empty" : s.after}
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <p class="mt-3 text-xs text-muted">You can undo this with {IS_MAC ? "⌘Z" : "Ctrl+Z"}.</p>
    </Modal>
  );
}

export function confirmConversion(plan: ConversionPlan, columnName: string): Promise<boolean> {
  return openDialog(ConversionDialog, { plan, columnName }, false);
}
