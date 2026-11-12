import "tabulator-tables/dist/css/tabulator.min.css";
import "./index.css";
import { Route, Router } from "@solidjs/router";
import { render } from "solid-js/web";
import { App } from "./App";
import { HomeRoute } from "./routes/HomeRoute";
import { SettingsRoute } from "./routes/SettingsRoute";
import { TableRoute } from "./routes/TableRoute";
import "./stores/settings";
import { openTable, pruneTabs } from "./stores/ui";
import { seedIfEmpty } from "./stores/workspace";

const seeded = seedIfEmpty();
if (seeded) openTable(seeded);
pruneTabs();

render(
  () => (
    <Router root={App}>
      <Route path="/" component={HomeRoute} />
      <Route path="/t/:id" component={TableRoute} />
      <Route path="/settings" component={SettingsRoute} />
      <Route path="*" component={HomeRoute} />
    </Router>
  ),
  document.getElementById("root")!,
);
