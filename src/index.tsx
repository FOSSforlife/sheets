import "tabulator-tables/dist/css/tabulator.min.css";
import "./index.css";
import { Route, Router } from "@solidjs/router";
import { render } from "solid-js/web";
import { App } from "./App";
import { HomeRoute } from "./routes/HomeRoute";
import { BASE_PATH, parseLocation } from "./routes/paths";
import { SettingsRoute } from "./routes/SettingsRoute";
import { TableRoute } from "./routes/TableRoute";
import "./stores/settings";
import { openSettings, openTable, pruneTabs } from "./stores/ui";
import { seedIfEmpty } from "./stores/workspace";

const seeded = seedIfEmpty();
if (seeded) openTable(seeded);
pruneTabs();

// The URL wins over the restored session: a link or refresh on /t/:id opens that table.
// Only when the URL names nothing (or a table that no longer exists) does the last active tab stay.
const target = parseLocation(location.pathname);
if (target?.kind === "table") openTable(target.tableId);
else if (target?.kind === "settings") openSettings();

render(
  () => (
    <Router root={App} base={BASE_PATH}>
      <Route path="/" component={HomeRoute} />
      <Route path="/t/:id" component={TableRoute} />
      <Route path="/settings" component={SettingsRoute} />
      <Route path="*" component={HomeRoute} />
    </Router>
  ),
  document.getElementById("root")!,
);
