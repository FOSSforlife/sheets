import { onMount } from "solid-js";
import { SettingsPage } from "../components/settings/SettingsPage";
import { openSettings } from "../stores/ui";

export function SettingsRoute() {
  onMount(openSettings);
  return <SettingsPage />;
}
