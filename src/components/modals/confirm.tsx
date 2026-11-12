import type { JSX } from "solid-js";
import { type DialogProps, openDialog } from "../../stores/dialogs";
import { Modal } from "../ui/Modal";

interface ConfirmOptions {
  title: string;
  message: JSX.Element | string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

function ConfirmDialog(props: ConfirmOptions & DialogProps<boolean>) {
  return (
    <Modal
      title={props.title}
      onClose={() => props.close(false)}
      footer={
        <>
          <button type="button" class="btn" onClick={() => props.close(false)}>
            {props.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            class="btn primary"
            classList={{ danger: props.danger }}
            onClick={() => props.close(true)}
          >
            {props.confirmLabel ?? "OK"}
          </button>
        </>
      }
    >
      <div class="space-y-2 leading-relaxed">{props.message}</div>
    </Modal>
  );
}

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return openDialog(ConfirmDialog, opts, false);
}

function PromptDialog(
  props: {
    title: string;
    label: string;
    initial: string;
    confirmLabel?: string;
    validate?: (v: string) => string | null;
  } & DialogProps<string | null>,
) {
  let input!: HTMLInputElement;
  const submit = () => {
    const err = props.validate?.(input.value) ?? null;
    if (err) {
      input.setCustomValidity(err);
      input.reportValidity();
      return;
    }
    props.close(input.value);
  };
  return (
    <Modal
      title={props.title}
      onClose={() => props.close(null)}
      footer={
        <>
          <button type="button" class="btn" onClick={() => props.close(null)}>
            Cancel
          </button>
          <button type="button" class="btn primary" onClick={submit}>
            {props.confirmLabel ?? "OK"}
          </button>
        </>
      }
    >
      <label class="field">
        <span>{props.label}</span>
        <input
          ref={input}
          class="input"
          value={props.initial}
          autofocus
          onInput={() => input.setCustomValidity("")}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </label>
    </Modal>
  );
}

export function prompt(opts: {
  title: string;
  label: string;
  initial?: string;
  confirmLabel?: string;
  validate?: (v: string) => string | null;
}): Promise<string | null> {
  return openDialog(PromptDialog, { initial: "", ...opts }, null);
}
