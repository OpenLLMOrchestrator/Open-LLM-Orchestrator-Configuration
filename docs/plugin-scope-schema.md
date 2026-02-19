# Plugin scope and placement schema

This document describes the **schema** for the Open LLM Orchestrator plugin descriptor: how plugins declare **which capabilities** they belong to (so the UI can populate plugins under capabilities), and **scope** (structural role: normal stage, condition, iterator, fork, reducer).

---

## Capability assignment: `plugin.capability`

Plugins are **grouped by capability** in the UI. Each plugin declares the list of capabilities it can be used in via **`plugin.capability`** (array).

| Value | Meaning |
|-------|--------|
| **`[ "MODEL" ]`** | Plugin appears **only** under the MODEL capability. |
| **`[ "CACHING", "MEMORY" ]`** | Plugin appears under **multiple** capabilities (CACHING and MEMORY). |
| **`[ "ALL" ]`** | Plugin is available in **all** capabilities; show it under every capability section. |
| **Omitted, empty, or `null`** | Plugin does not match any configured capability → show under the **Undefined** capability (see below). |

- **Single value**: YAML may use `capability: MODEL` (singular); consumers normalize to array `[ "MODEL" ]`.
- Capability names must match engine/config names (e.g. `ACCESS`, `MODEL`, `CACHING`, `RETRIEVAL`, `TOOL`, `MEMORY`, or custom IDs).

### Undefined capability

- The UI must support a special **"Undefined"** capability section.
- **When to use**: Plugins whose `capability` is omitted, empty, or contains only names that are not in the pipeline’s capability list are **not** tied to a known capability; they should still be available somewhere.
- **Behavior**: List such plugins under **Undefined**. They remain available for use (e.g. in groups or when a new capability is added) even when they don’t match any current capability.

---

## Structural role: `scope.role`

Optional **`scope`** under `plugin:` describes **structural** usage (where in the flow the plugin can be placed).

| Role | Meaning | Engine / UI |
|------|--------|-------------|
| `CAPABILITY_STAGE` | Normal stage plugin under a capability (default) | Can be a child of a capability group; appears in capability flow. |
| `CONDITION` | Used as group IF (condition) | At most one per group; `condition` field on GROUP. Maps to `ConditionPlugin` / PLUGIN_IF. |
| `ITERATOR` | Used as group loop driver | At most one per group; `iterator` field on GROUP. Maps to `IteratorPlugin` / PLUGIN_ITERATOR. |
| `FORK` | Used as ASYNC group fork | One per ASYNC group; forkPlugin. Maps to `ForkPlugin`. |
| `JOIN` | Used as ASYNC group join (reducer) | One per ASYNC group; joinPlugin. Maps to `JoinPlugin`. |

- **Default** if `scope` or `scope.role` omitted: `CAPABILITY_STAGE`.
- Plugins with role `CONDITION`, `ITERATOR`, `FORK`, or `JOIN` are used only in the corresponding structural slot, not as normal stage nodes.

### `scope.capabilities` (optional, legacy)

- If present, can override or complement **`plugin.capability`** for “which capabilities can use this plugin” when role is `CAPABILITY_STAGE`.
- **Preferred**: Use **`plugin.capability`** as the single source of truth for capability assignment; `scope.capabilities` can be `null` or omitted.

### `scope.onlyInsideGroup` (optional)

- `true`: This plugin can **only** be used as a direct child of a GROUP (not at capability root).
- `false` or omitted: No restriction.

---

## Schema shape (YAML)

```yaml
schemaVersion: "1.0"

plugin:
  id: ...
  name: ...
  version: 1.0.0
  description: ...
  license: Apache-2.0
  # --------------- Capability assignment (plugins grouped under capabilities) ---------------
  capability: [ "MODEL" ]   # or [ "CACHING", "MEMORY" ], or [ "ALL" ], or omit → Undefined
  className: ...
  # --------------- Optional scope (structural role) ---------------
  scope:
    role: CAPABILITY_STAGE   # or CONDITION | ITERATOR | FORK | JOIN
    capabilities: null        # optional; prefer plugin.capability
    onlyInsideGroup: false
  inputs: [ ... ]
  outputs: [ ... ]
  icons: { ... }
```

**Example: Gemma2 (Ollama) — single capability**

```yaml
# Generated from @OloPlugin - Open LLM Orchestrator plugin descriptor
schemaVersion: "1.0"

plugin:
  id: com.openllm.plugin.llm.gemma2
  name: Gemma2 2B (Ollama)
  version: 1.0.0
  description: "Fixed-model Gemma2:2b chat via Ollama; for query-all-models ASYNC pipeline."
  license: Apache-2.0
  capability:
    - MODEL
  className: com.openllmorchestrator.worker.plugin.llm.Gemma2_2bChatPlugin
  scope:
    role: CAPABILITY_STAGE
    capabilities: null
  inputs:
    - name: messages
      type: array
      required: false
      description: Chat messages
    - name: question
      type: string
      required: false
      description: Question
  outputs:
    - name: result
      type: string
      description: Model response
    - name: modelLabel
      type: string
      description: Model label for merge
  icons:
    smallSvg: icons/Gemma2_2bChatPlugin-icon-64.svg
    largeSvg: icons/Gemma2_2bChatPlugin-icon-256.svg
    bannerSvg: icons/Gemma2_2bChatPlugin-banner.svg
    defaultSmallSvg: icons/default-icon-64.svg
    defaultLargeSvg: icons/default-icon-256.svg
    defaultBannerSvg: icons/default-banner.svg
```

---

## Examples

### Single capability (e.g. MODEL)

Plugin appears only under MODEL; `scope.capabilities` can be null when `capability` is set.

```yaml
plugin:
  id: com.openllm.plugin.llm.gemma2
  name: Gemma2 2B (Ollama)
  capability: [ "MODEL" ]
  className: ...
  scope:
    role: CAPABILITY_STAGE
    capabilities: null
  inputs: [ ... ]
  outputs: [ ... ]
```

### Single capability (CACHING)

```yaml
plugin:
  id: com.openllm.plugin.caching.memory
  name: In-Memory Caching
  capability: [ "CACHING" ]
  className: com.openllmorchestrator.worker.plugin.caching.InMemoryCachingPlugin
  scope:
    role: CAPABILITY_STAGE
  inputs: [ ... ]
  outputs: [ ... ]
```

### Plugin in multiple capabilities

E.g. guardrail in both ACCESS and MODEL:

```yaml
plugin:
  id: com.openllm.plugin.guardrail.simple
  name: Simple Guardrail
  capability: [ "ACCESS", "MODEL" ]
  scope:
    role: CAPABILITY_STAGE
```

### Plugin available in ALL capabilities

Use literal **`ALL`** so the plugin appears under every capability section:

```yaml
plugin:
  id: com.openllm.plugin.observability.passthrough
  name: Pass-Through Observability
  capability: [ "ALL" ]
  scope:
    role: CAPABILITY_STAGE
```

### Undefined capability

No `capability` (or empty list) → plugin appears under **Undefined** only:

```yaml
plugin:
  id: com.openllm.plugin.experimental.unknown
  name: Experimental Plugin
  # capability omitted or [] → show under Undefined
  className: ...
  scope:
    role: CAPABILITY_STAGE
```

### Condition plugin (IF)

Only as group condition; capability list is irrelevant:

```yaml
plugin:
  id: com.openllm.plugin.condition.simple
  name: Simple Condition
  scope:
    role: CONDITION
```

### Iterator / Fork / Join

Same as before: use `scope.role` only.

```yaml
plugin:
  id: com.openllm.plugin.iterator.batch
  name: Batch Iterator
  scope:
    role: ITERATOR
---
plugin:
  id: com.openllm.plugin.fork.default
  name: Default Fork
  scope:
    role: FORK
---
plugin:
  id: com.openllm.plugin.join.default
  name: Default Join (Reducer)
  scope:
    role: JOIN
```

---

## Backward compatibility

- **`plugin.capability`** omitted or empty → treat as **Undefined** (plugin appears only under the Undefined capability section).
- **`scope`** omitted → `role: CAPABILITY_STAGE`, `onlyInsideGroup: false`.
- **`scope.role`** omitted → `CAPABILITY_STAGE`.
- **`scope.capabilities`** — optional; **`plugin.capability`** is the source of truth for “which capabilities”. If only `scope.capabilities` is set (legacy), use it like `plugin.capability` (including `ALL` and Undefined when empty/null).

---

## How UI and engine should use this

1. **Populate plugins under capabilities**
   - Group plugins by **`plugin.capability`**:
     - If list contains **`ALL`** → show this plugin under **every** capability section.
     - If list is non-empty and no `ALL` → show under each listed capability (e.g. MODEL, CACHING).
     - If list is omitted or empty → show only under **Undefined** capability.
   - Support a dedicated **Undefined** section so plugins without a matching capability are still available.

2. **Component palette**
   - When editing a given capability (e.g. MODEL), show plugins whose `capability` includes `"MODEL"` or `"ALL"`, and show Flow/Control (condition, iterator, fork, join) separately by `scope.role`.
   - In “Flow” / “Control”, show only components with `role` CONDITION, ITERATOR, or structural (fork/join) if you separate them.

3. **Drop / connect validation**
   - For `scope.role` CONDITION / ITERATOR / FORK / JOIN: allow only in the corresponding structural slot.
   - For `scope.role` CAPABILITY_STAGE: allow only if the current capability is in `plugin.capability` or `plugin.capability` contains `ALL`.

4. **Engine**
   - At plan-build or config load, optionally validate that each PLUGIN node’s `pluginType`/name is allowed in the current capability and role (e.g. CachingPlugin only under CACHING). Use `plugin.capability` (or Undefined) for validation.

---

## Summary table

| Field | Optional | Values | Default / behavior |
|-------|----------|--------|---------------------|
| **`plugin.capability`** | Yes | `[ "MODEL" ]`, `[ "CACHING", "MEMORY" ]`, `[ "ALL" ]`, or omit/empty | Omit/empty → **Undefined** capability only |
| `scope` | Yes | object | omitted → CAPABILITY_STAGE, no onlyInsideGroup |
| `scope.role` | Yes | `CAPABILITY_STAGE` \| `CONDITION` \| `ITERATOR` \| `FORK` \| `JOIN` | `CAPABILITY_STAGE` |
| `scope.capabilities` | Yes | `null` / omit or list | Prefer **plugin.capability** for capability assignment |
| `scope.onlyInsideGroup` | Yes | boolean | `false` |

- **Plugins are populated under capabilities** using **`plugin.capability`**.
- **Multiple capabilities**: list them (e.g. `[ "ACCESS", "MODEL" ]`).
- **ALL**: use **`[ "ALL" ]`** so the plugin is available in every capability.
- **Undefined**: plugins with no or empty `capability` appear under the **Undefined** capability so they remain available.
