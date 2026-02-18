# UI component configs

All pipeline builder nodes are defined here as JSON templates. The backend loads this folder at startup and serves them via `/api/components`.

## Flow

| File | Description |
|------|-------------|
| **start.json** | Pipeline entry point. |
| **end.json** | Pipeline exit point. |
| **condition.json** | If / Else / Elseif — condition plugin + then/elseif/else branches. |
| **fork.json** | Start of parallel branches; wire multiple out-edges, then join. |
| **join.json** | Sync point: wait for all branches from a Fork. |
| **reducer.json** | Merge/reduce outputs (e.g. after async or fork/join); merge policy. |

## Control (containers)

| File | Description |
|------|-------------|
| **group.json** | Group — SYNC or ASYNC execution of children. |
| **async.json** | Async group — run children in parallel; completion policy + output merge. |
| **loop.json** | Loop — iterative block (max iterations, optional condition). |

## Format

Each JSON has:

- **id**, **name**, **description**, **icon**, **type** (`control` | `container` | `plugin`), **category**
- **properties** — JSON Schema for the property panel (titles, enums, defaults)

Icons used in the UI: `play_arrow`, `stop`, `call_split`, `loop`, `fork_right`, `merge`, `parallel`, `compress`, `account_tree`, etc.

Plugins (LLM, Retriever, etc.) live in the **plugins/** folder with the same format; they appear in the **Plugins** section of the left panel.
