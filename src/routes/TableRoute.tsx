import { useNavigate, useParams } from "@solidjs/router";
import { createEffect, createMemo, Show } from "solid-js";
import { GridView } from "../grid/GridView";
import { openTable } from "../stores/ui";
import { conflicts, getSession, isTableLive, resolveConflict } from "../stores/workspace";

export function TableRoute() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const live = () => isTableLive(params.id);

  createEffect(() => {
    if (live()) openTable(params.id);
    else navigate("/", { replace: true });
  });

  const session = createMemo(() => (live() ? getSession(params.id) : null));

  return (
    <Show when={session()} keyed>
      {(s) => (
        <div class="flex h-full flex-col">
          <Show when={conflicts().has(s.id)}>
            <div class="flex items-center gap-3 border-b border-warn/40 bg-warn/15 px-3 py-1.5 text-xs">
              <span class="flex-1">This table was changed in another window.</span>
              <button type="button" class="btn btn-sm" onClick={() => resolveConflict(s.id, true)}>
                Reload
              </button>
              <button type="button" class="btn btn-sm" onClick={() => resolveConflict(s.id, false)}>
                Keep mine
              </button>
            </div>
          </Show>
          <div class="min-h-0 flex-1">
            <GridView session={s} />
          </div>
        </div>
      )}
    </Show>
  );
}
