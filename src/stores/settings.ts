import { createEffect, createRoot, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { type AppSettings, DEFAULT_SETTINGS } from "../domain/settings";
import { settingsRepo } from "../storage/repositories";
import { reportErrors } from "./toasts";

function load(): AppSettings {
  const saved = settingsRepo.load();
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    format: { ...DEFAULT_SETTINGS.format, ...saved?.format },
    postgres: { ...DEFAULT_SETTINGS.postgres, ...saved?.postgres },
    exportDefaults: { ...DEFAULT_SETTINGS.exportDefaults, ...saved?.exportDefaults },
  };
}

const [settings, setSettings] = createStore<AppSettings>(load());

export { setSettings, settings };

export function reloadSettings(): void {
  setSettings(reconcile(load()));
}

export function resetSettings(): void {
  setSettings(reconcile(structuredClone(DEFAULT_SETTINGS)));
}

createRoot(() => {
  createEffect(() => {
    const snapshot = JSON.parse(JSON.stringify(settings)) as AppSettings;
    reportErrors(() => settingsRepo.save(snapshot));
  });

  // Theme + density are applied to <html> so both Tailwind and the grid stylesheet can react.
  createEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = settings.theme === "dark" || (settings.theme === "system" && media.matches);
      root.classList.toggle("dark", dark);
    };
    apply();
    media.addEventListener("change", apply);
    onCleanup(() => media.removeEventListener("change", apply));
    root.dataset.density = settings.density;
  });
});
