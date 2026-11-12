import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { Check, ChevronRight } from "./icons";
import { closeMenu, type MenuItem, menu } from "./menu";

type Actionable = Exclude<MenuItem, { separator: true }>;
const isActionable = (i: MenuItem): i is Actionable => !("separator" in i);

/** Renders the single app-wide context/dropdown menu. Fully keyboard navigable. */
export function MenuHost() {
  return (
    <Show when={menu()} keyed>
      {(m) => <MenuPanel items={m.items} x={m.x} y={m.y} root />}
    </Show>
  );
}

function MenuPanel(props: { items: MenuItem[]; x: number; y: number; root?: boolean; onBack?: () => void }) {
  let ref!: HTMLDivElement;
  const [active, setActive] = createSignal(props.items.findIndex((i) => isActionable(i) && !i.disabled));
  const [submenu, setSubmenu] = createSignal<{ index: number; x: number; y: number } | null>(null);
  const [pos, setPos] = createSignal({ x: props.x, y: props.y });

  createEffect(() => {
    const r = ref.getBoundingClientRect();
    const x = Math.min(props.x, window.innerWidth - r.width - 8);
    const y =
      props.y + r.height > window.innerHeight - 8 ? Math.max(8, window.innerHeight - r.height - 8) : props.y;
    setPos({ x: Math.max(8, x), y });
    ref.focus({ preventScroll: true });
  });

  const run = (item: Actionable, index: number, el?: HTMLElement) => {
    if (item.disabled) return;
    if (item.submenu) {
      const r = (el ?? (ref.children[index] as HTMLElement)).getBoundingClientRect();
      setSubmenu({ index, x: r.right + 2, y: r.top - 4 });
      return;
    }
    closeMenu();
    item.action?.();
  };

  const move = (delta: number) => {
    const n = props.items.length;
    let i = active();
    for (let k = 0; k < n; k++) {
      i = (i + delta + n) % n;
      const it = props.items[i]!;
      if (isActionable(it) && !it.disabled) break;
    }
    setActive(i);
  };

  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    const item = props.items[active()];
    switch (e.key) {
      case "ArrowDown":
        move(1);
        break;
      case "ArrowUp":
        move(-1);
        break;
      case "ArrowRight":
        if (item && isActionable(item) && item.submenu) run(item, active());
        break;
      case "ArrowLeft":
        if (props.onBack) props.onBack();
        break;
      case "Enter":
      case " ":
        if (item && isActionable(item)) run(item, active());
        break;
      case "Escape":
        if (props.onBack) props.onBack();
        else closeMenu();
        break;
      case "Tab":
        closeMenu();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  if (props.root) {
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-menu]")) closeMenu();
    };
    const onBlurWin = () => closeMenu();
    setTimeout(() => document.addEventListener("mousedown", onDown, true));
    window.addEventListener("blur", onBlurWin);
    window.addEventListener("resize", onBlurWin);
    onCleanup(() => {
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("blur", onBlurWin);
      window.removeEventListener("resize", onBlurWin);
    });
  }

  return (
    <Portal>
      <div
        ref={ref}
        data-menu
        tabIndex={-1}
        role="menu"
        onKeyDown={onKey}
        onContextMenu={(e) => e.preventDefault()}
        class="fixed z-50 min-w-48 rounded-md border border-line bg-panel py-1 text-sm shadow-lg outline-none"
        style={{ left: `${pos().x}px`, top: `${pos().y}px` }}
      >
        <For each={props.items}>
          {(item, i) =>
            isActionable(item) ? (
              <div
                role="menuitem"
                class="mx-1 flex cursor-default items-center gap-2 rounded px-2 py-1.5"
                classList={{
                  "bg-accent/15": active() === i(),
                  "opacity-40": item.disabled,
                  "text-danger": item.danger,
                }}
                onMouseEnter={(e) => {
                  setActive(i());
                  if (item.submenu) run(item, i(), e.currentTarget);
                  else setSubmenu(null);
                }}
                onClick={(e) => run(item, i(), e.currentTarget)}
              >
                <span class="flex w-4 justify-center text-muted">
                  {item.checked ? <Check size={14} /> : item.icon?.()}
                </span>
                <span class="flex-1 truncate">{item.label}</span>
                <Show when={item.hint}>
                  <span class="pl-4 text-xs text-muted">{item.hint}</span>
                </Show>
                <Show when={item.submenu}>
                  <ChevronRight size={14} class="text-muted" />
                </Show>
              </div>
            ) : (
              <div class="my-1 border-t border-line" />
            )
          }
        </For>
      </div>
      <Show when={submenu()} keyed>
        {(s) => {
          const it = props.items[s.index] as Actionable;
          return (
            <MenuPanel
              items={it.submenu ?? []}
              x={s.x}
              y={s.y}
              onBack={() => {
                setSubmenu(null);
                ref.focus();
              }}
            />
          );
        }}
      </Show>
    </Portal>
  );
}
