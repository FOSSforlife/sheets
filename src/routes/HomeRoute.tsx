import { Navigate } from "@solidjs/router";
import { Show } from "solid-js";
import { Sheet } from "../components/ui/icons";
import { SETTINGS_TAB, ui } from "../stores/ui";
import { tabPath } from "./paths";

/** "/" → the active tab, or an empty state when nothing is open. */
export function HomeRoute() {
  return (
    <Show when={!ui.activeTab} fallback={<Navigate href={tabPath(ui.activeTab, SETTINGS_TAB)} />}>
      <div class="flex h-full flex-col items-center justify-center gap-2 text-muted">
        <Sheet size={32} class="opacity-40" />
        <p>Open a table from the sidebar, or drop a file anywhere to import it.</p>
      </div>
    </Show>
  );
}
