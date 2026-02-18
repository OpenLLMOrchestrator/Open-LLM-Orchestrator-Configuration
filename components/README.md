# UI component configs

All pipeline builder nodes are defined here. The backend loads this folder at startup and serves them via `/api/components`. Everything is derived from this folder except plugin binaries, which are mounted from **components/plugins/**.

## Layout

- **components/flows/** — Flow components (start, end, fork, join, condition, reducer). One `.json` per component.
- **components/control/** — Control (container) components (group, async, loop). One `.json` per component.
- **components/capability/** — Capability definitions (template-driven); one `.json` per capability. These appear in the **Capability** section of the left panel.
- **components/plugins/** — Plugins: place plugin zips or extracted plugin folders (with `plugin.yaml` / `plugin.yml`) here. They appear in the **Plugins** section.

## Flow (components/flows/*.json)

| File | Description |
|------|-------------|
| **start.json** | Pipeline entry point. |
| **end.json** | Pipeline exit point. |
| **condition.json** | If / Else / Elseif — condition plugin + then/elseif/else branches. |
| **fork.json** | Start of parallel branches; wire multiple out-edges, then join. |
| **join.json** | Sync point: wait for all branches from a Fork. |
| **reducer.json** | Merge/reduce outputs (e.g. after async or fork/join); merge policy. |

## Control (components/control/*.json)

| File | Description |
|------|-------------|
| **group.json** | Group — SYNC or ASYNC execution of children. |
| **async.json** | Async group — run children in parallel; completion policy + output merge. |
| **loop.json** | Loop — iterative block (max iterations, optional condition). |

## Capability (components/capability/*.json)

Template-driven: add one JSON file per capability (e.g. `ACCESS.json`, `MODEL.json`). Each capability should have a **properties** template so users can define:

- **Execution mode** — `SYNC` or `ASYNC`
- **Completion mode (when Async)** — `ALL`, `FIRST_SUCCESS`, `FIRST_FAILURE`, `ALL_SETTLED`
- **Async merge policy** — `LAST_WINS`, `FIRST_WINS`, `PREFIX_BY_ACTIVITY` (when Async)
- **Label** — display label for the capability

Required fields: **id**, **name**, **description**, **icon**, **type**: `"capability"`, **category**: `"capability"`. New capabilities created via the UI also include **plugins** and **groups** arrays (one or more each) in the properties schema.

## Plugins (components/plugins/)

Place plugin archives (`.zip`) or extracted plugin directories containing `plugin.yaml` / `plugin.yml` here. They appear in the **Plugins** section of the left panel.

## Format (flows, control, capability, and plugin JSON)

- **id**, **name**, **description**, **icon**, **type** (`control` | `container` | `capability` | `plugin`), **category**
- **properties** — optional JSON Schema for the property panel

Icons: `play_arrow`, `stop`, `call_split`, `loop`, `fork_right`, `merge`, `parallel`, `compress`, `account_tree`, etc.
