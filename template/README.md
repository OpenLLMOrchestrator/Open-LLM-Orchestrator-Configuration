<!-- Copyright 2026 Open LLM Orchestrator contributors. Licensed under the Apache License, Version 2.0; see LICENSE file. -->

# Engine config

Config is loaded at startup in order **Redis → DB → file**. The file path is **`config/<CONFIG_KEY>.json`** when `CONFIG_FILE_PATH` is unset (e.g. `config/default.json` for `CONFIG_KEY=default`). Multiple files can exist (e.g. `config/default.json`, `config/production.json`); set **`CONFIG_KEY`** to select which one to load.

For **full schema, every field, allowed values, and UI/drag-and-drop guidance**, see **[Configuration Reference](../docs/configuration-reference.md)**. It covers the engine config JSON top-to-bottom (feature flags, pipelines, activity, queue topology, validation) so you can build config editors or pipeline builders from it.

For **designing a config or pipeline UI in another project**, use the sections below: **Capability flow**, **Condition flow**, **Configurable features at a glance**, and the **UI design reference** links. Together they give you capabilities (predefined + custom), plugin types, condition (if/elseif/else) shape, merge policies, feature flags, and pipeline structure without reading the full schema.

---

## Capability flow: predefined vs custom

- **Predefined capabilities** (e.g. ACCESS, MEMORY, RETRIEVAL, MODEL, OBSERVABILITY) have a **fixed flow order** defined by **`capabilityOrder`** (or legacy **`stageOrder`**). Only capabilities that appear in the pipeline root are run, in that order.
- **Custom capabilities** can be defined in config under **`capabilities`**: a map of capability name → `{ "pluginType": "...", "name": "<activity id>" }`. They can be **called anywhere in the capability flow**: in the pipeline root (add the name to `capabilityOrder` and to the root map) or inside any GROUP as a child STAGE with `name` = the capability name.
- Resolution order: predefined capability → config-defined capability → activity/plugin by id → custom bucket.

**Example (custom capability used in flow):**
```json
"capabilityOrder": ["ACCESS", "MODEL", "MY_SUMMARY", "POST_PROCESS"],
"capabilities": {
  "MY_SUMMARY": { "pluginType": "ModelPlugin", "name": "com.openllmorchestrator.worker.plugin.llm.Llama32ChatPlugin" }
},
"pipelines": {
  "default": {
    "defaultTimeoutSeconds": 60,
    "root": {
      "ACCESS": { "type": "GROUP", "executionMode": "SYNC", "children": [ ... ] },
      "MODEL": { ... },
      "MY_SUMMARY": { "type": "GROUP", "executionMode": "SYNC", "children": [ { "type": "PLUGIN", "name": "MY_SUMMARY", "pluginType": "ModelPlugin" } ] },
      "POST_PROCESS": { ... }
    }
  }
}
```

---

## Configurable features for UI design

The following is a concise reference for building a **configuration UI** or **pipeline editor** in a separate project. Use it for form fields, dropdowns, and validation.

### Top-level config sections

| Section | Type | Required | UI control |
|--------|------|----------|------------|
| `configVersion` | string | No | Text or readonly. |
| `enabledFeatures` | string[] | No | Multi-select; values = feature flags (see **Feature flags** below). |
| `worker` | object | Yes | Form: `queueName` (text), `strictBoot` (checkbox). |
| `temporal` | object | No | Form: `target`, `namespace`. |
| `activity` | object | No | Nested: `payload` (numbers), `defaultTimeouts` (seconds), `retryPolicy`. |
| `capabilityOrder` | string[] | No | **Ordered list** for the fixed capability flow; options = predefined capabilities (see [ui-reference §1](../docs/ui-reference.md#1-predefined-stages-for-config-and-debugging)). Prefer over `stageOrder`. |
| `stageOrder` | string[] | No | Legacy alias for `capabilityOrder`. |
| `capabilities` | object | No | **Custom capabilities**: name → `{ "pluginType": "...", "name": "<activity id>" }`. Can be referenced anywhere in the flow. |
| `mergePolicies` | object | No | Key-value; value = `LAST_WINS` \| `FIRST_WINS` \| `PREFIX_BY_ACTIVITY` \| FQCN. |
| `pipelines` | object | **Yes** | Pipeline list; each pipeline = canvas or form (see **Pipeline structure** and **Condition flow**). |
| `plugins` | string[] | No | Multi-select; allowed plugin names (FQCN or activity id). |
| `dynamicPlugins` | object | No | Key = plugin name, value = JAR path. |
| `queueTopology` | object | No | `strategy` dropdown + `stageToQueue`, `tenantToQueue` maps. |

### Pipeline structure (root-by-capability, recommended)

- **`pipelines.<id>.root`** or **`pipelines.<id>.rootByCapability`** — Object whose **keys are capability names** (e.g. `ACCESS`, `MODEL`, `RETRIEVAL`, or custom names from **`capabilities`**). Value per key = **one GROUP**.
- **Group node:** `type: "GROUP"`, `executionMode: "SYNC"` or `"ASYNC"`, `children: [ ... ]`.
- **Child:** Either a **STAGE** node `{ "type": "PLUGIN", "name": "<activity id or capability name>", "pluginType": "<plugin type>" }` or a nested **GROUP**. Use capability names in `name` to invoke predefined or config-defined capabilities anywhere.
- **Execution order** = order of capability names in **`capabilityOrder`** (or **`stageOrder`**); only capabilities present in the root map are run.
- **Async group options:** `asyncCompletionPolicy`: `ALL` \| `FIRST_SUCCESS` \| `FIRST_FAILURE` \| `ALL_SETTLED`; `asyncOutputMergePolicy`: name from `mergePolicies` or built-in (`LAST_WINS`, `FIRST_WINS`, `PREFIX_BY_ACTIVITY`).

### Condition flow (if / elseif / else)

At **group level** you can make a group **conditional**: run a **condition plugin** first; it returns which branch to run (then / elseif / else). Only that branch runs.

**Contract:** The condition plugin must write output key **`branch`** (Integer): **0** = then, **1** = first elseif, …, **n−1** = else.

**Preferred: group as children.** Use one GROUP per branch:

| Field | Type | Description |
|-------|------|-------------|
| `condition` | string | **Required** when using condition flow. Plugin name (activity id) of the condition plugin (e.g. `StubConditionPlugin`). |
| `thenGroup` | object | **One GROUP** for the “then” branch (preferred). Same shape as a group: `executionMode`, `children`, etc. |
| `elseGroup` | object | **One GROUP** for the “else” branch (preferred). |
| `elseifBranches` | array | List of **elseif** branches. Each item: `{ "condition": "<plugin>", "thenGroup": { GROUP } }` or `{ "condition": "<plugin>", "then": [ nodes ] }`. |

**Alternative (list of nodes per branch):** `thenChildren`, `elseChildren`, and `elseifBranches[].then` — arrays of STAGE/GROUP nodes or activity names. Use when you don’t need a single GROUP per branch.

**Example (root-by-capability, one capability with condition):**

```json
"MODEL": {
  "type": "GROUP",
  "condition": "com.openllmorchestrator.worker.sample.StubConditionPlugin",
  "thenGroup": {
    "type": "GROUP",
    "executionMode": "SYNC",
    "children": [
      { "type": "PLUGIN", "pluginType": "ModelPlugin", "name": "com.example.LlamaPlugin" }
    ]
  },
  "elseifBranches": [
    { "condition": "com.example.OtherCondition", "thenGroup": { "type": "GROUP", "executionMode": "SYNC", "children": [ ... ] } }
  ],
  "elseGroup": {
    "type": "GROUP",
    "executionMode": "SYNC",
    "children": [
      { "type": "PLUGIN", "pluginType": "ModelPlugin", "name": "com.example.FallbackPlugin" }
    ]
  }
}
```

**Stages-array format (GroupConfig):** Same idea with `condition`, `thenGroup`, `elseifBranches` (each with `condition` and `thenGroup` or `then`), `elseGroup`. Children in groups can be strings (activity names) or nested group objects.

**UI design:** Provide a “Conditional group” mode for a GROUP: condition plugin picker + “Then” (one group editor or list), “Elseif” (list of { condition, then group }), “Else” (one group editor or list). Use **ConditionPlugin** as plugin type for the condition plugin; stub FQCN: `com.openllmorchestrator.worker.sample.StubConditionPlugin`.

### Merge policy built-ins (for dropdown)

| Value | Description |
|-------|-------------|
| `LAST_WINS` | Last writer overwrites (default). |
| `FIRST_WINS` | First finished; later outputs do not overwrite. |
| `PREFIX_BY_ACTIVITY` | Keys prefixed by activity name. |
| `ALL_MODELS_RESPONSE_FORMAT` | Special format for multi-model ASYNC. |

Custom: add a key in `mergePolicies` with value = FQCN; reference that key in `asyncOutputMergePolicy`.

### Async completion policy (for GROUP dropdown)

| Value | Description |
|-------|-------------|
| `ALL` | Wait for all activities; fail if any fails. |
| `FIRST_SUCCESS` | Complete when first activity succeeds. |
| `FIRST_FAILURE` | Fail as soon as one fails. |
| `ALL_SETTLED` | Wait for all; then fail if any failed. |

### Feature flags (for `enabledFeatures` multi-select)

| Flag | Description |
|------|-------------|
| `HUMAN_SIGNAL` | Human-in-the-loop: suspend, signal, resume. |
| `STREAMING` | Streaming stage API. |
| `AGENT_CONTEXT` | Durable agent identity. |
| `DETERMINISM_POLICY` | Reproducible runs. |
| `CHECKPOINTABLE_STAGE` | Checkpointable stages. |
| `OUTPUT_CONTRACT` | Output schema validation. |
| `EXECUTION_GRAPH` | DAG execution. |
| `STAGE_RESULT_ENVELOPE` | StageMetadata, DependencyRef. |
| `VERSIONED_STATE` | stepId, executionId. |
| `INTERCEPTORS` | beforeStage, afterStage, onError. |
| `PLANNER_PLAN_EXECUTOR` | Dynamic plan. |
| `EXECUTION_SNAPSHOT` | snapshot(), ContextSnapshot. |
| `POLICY_ENGINE` | ExecutionPolicyResolver. |
| `BUDGET_GUARDRAIL` | Cost/token/iteration caps. |
| `CONCURRENCY_ISOLATION` | Queue topology. |
| `SECURITY_HARDENING` | Prompt injection, allowlist. |
| `PLAN_SAFETY_VALIDATION` | Validate dynamic plan. |
| `EXECUTION_GRAPH_EXPORT` | Export graph (DOT, Mermaid, JSON). |

### Plugin types (for STAGE `pluginType` dropdown)

Each STAGE node needs `pluginType` from the allowed list and `name` = activity/plugin id. Full table with typical stages: **[ui-reference §2](../docs/ui-reference.md#2-plugin-types-for-stage-node-plugintype)**. Examples: `AccessControlPlugin`, `ModelPlugin`, `VectorStorePlugin`, `ConditionPlugin`, `EvaluationPlugin`, `FeedbackPlugin`, `LearningPlugin`, `DatasetBuildPlugin`, `TrainTriggerPlugin`, `ModelRegistryPlugin`, `RefinementPlugin`, `ObservabilityPlugin`, …

### Predefined capabilities (for capabilityOrder and pipeline root keys)

Full table with order and descriptions: **[ui-reference §1](../docs/ui-reference.md#1-predefined-stages-for-config-and-debugging)**. Examples: `ACCESS`, `MEMORY`, `RETRIEVAL`, `RETRIEVE`, `MODEL`, `EVALUATE`, `FEEDBACK_CAPTURE`, `DATASET_BUILD`, `TRAIN_TRIGGER`, `MODEL_REGISTRY`, `POST_PROCESS`, `OBSERVABILITY`, `CUSTOM`. **Minimal learning flow preset:** `ACCESS`, `MEMORY`, `RETRIEVE`, `MODEL`, `EVALUATE`, `FEEDBACK_CAPTURE`, `DATASET_BUILD`, `TRAIN_TRIGGER`, `MODEL_REGISTRY`. Define additional capabilities in **`capabilities`** and reference them by name anywhere in the flow.

### UI design reference (other project)

- **[docs/ui-reference.md](../docs/ui-reference.md)** — Single reference for Configuration UI and Stage Debugging UI: predefined capabilities table, plugin types table, config schema at a glance, pipeline structure, **capability flow**, **condition flow**, activity naming, context keys.
- **[docs/configuration-reference.md](../docs/configuration-reference.md)** — Full schema, every field, validation, drag-and-drop mapping.

---

## Workflow

- **Workflow Type:** `CoreWorkflowImpl`
- **Task Queue:** from config (default `core-task-queue`)
- **Input:** Single JSON argument — an **ExecutionCommand** with `pipelineName` and `input`. The workflow returns a **Map** (accumulated output); model pipelines also set `output` (e.g. `ANS: "..."` or merged multi-model text).

---

## Pipelines reference

All pipelines are defined in the active config file (e.g. `config/default.json` or whatever `config/<CONFIG_KEY>.json` is loaded). Use `pipelineName` in the ExecutionCommand to select one.

| Pipeline ID | Input payload | Summary |
|-------------|----------------|---------|
| **document-ingestion** | `{ "document": "<text>" }` | Tokenize document and store chunks in the vector store (FILTER → RETRIEVAL). |
| **document-ingestion-folder** | `{ "folderPath": "<path>", "fileExtensions": ".txt,.md", "recursive": false }` | Read all files from a folder, tokenize, and store chunks (FILTER → RETRIEVAL). |
| **question-answer** | `{ "question": "<question>" }` | Retrieve chunks for the question, then run LLM (default model). Output in `result`, `response`, and formatted `output` (ANS: "..."). |
| **llama-oss** | `{ "question": "..." }` or `{ "messages": [...] }` | Chat only (no RAG). Single model (Llama). |
| **openai-oss** | `{ "question": "..." }` or `{ "messages": [...] }` | Chat only (no RAG). Single model (OpenAI placeholder / Ollama). |
| **both** | `{ "question": "..." }` or `{ "messages": [...] }` | Chat only (no RAG). Both models placeholder. |
| **rag-llama-oss** | `{ "question": "<question>" }` | RAG: retrieve chunks then LLM (Llama). Output formatted as ANS: "...". |
| **rag-openai-oss** | `{ "question": "<question>" }` | RAG: retrieve chunks then LLM (OpenAI placeholder). |
| **rag-both** | `{ "question": "<question>" }` | RAG: retrieve chunks then LLM (both placeholder). |
| **rag-mistral** | `{ "question": "<question>" }` | RAG: retrieve chunks then **mistral:latest**. Output ANS: "...". |
| **rag-llama3.2** | `{ "question": "<question>" }` | RAG: retrieve chunks then **llama3.2:latest**. Output ANS: "...". |
| **rag-phi3** | `{ "question": "<question>" }` | RAG: retrieve chunks then **phi3:latest**. Output ANS: "...". |
| **rag-gemma2-2b** | `{ "question": "<question>" }` | RAG: retrieve chunks then **gemma2:2b**. Output ANS: "...". |
| **rag-qwen2-1.5b** | `{ "question": "<question>" }` | RAG: retrieve chunks then **qwen2:1.5b**. Output ANS: "...". |
| **chat-mistral** | `{ "question": "..." }` or `{ "messages": [...] }` | Chat only with **mistral:latest**. Output ANS: "...". |
| **chat-llama3.2** | `{ "question": "..." }` or `{ "messages": [...] }` | Chat only with **llama3.2:latest**. Output ANS: "...". |
| **chat-phi3** | `{ "question": "..." }` or `{ "messages": [...] }` | Chat only with **phi3:latest**. Output ANS: "...". |
| **chat-gemma2-2b** | `{ "question": "..." }` or `{ "messages": [...] }` | Chat only with **gemma2:2b**. Output ANS: "...". |
| **chat-qwen2-1.5b** | `{ "question": "..." }` or `{ "messages": [...] }` | Chat only with **qwen2:1.5b**. Output ANS: "...". |
| **query-all-models** | `{ "question": "..." }` or `{ "messages": [...] }` | Query **all five models** (mistral, llama3.2, phi3, gemma2:2b, qwen2:1.5b) in **async parallel**; wait for all to finish; merge output as `response from mistral: "..."` \n `response from llama3.2: "..."` \n … in `output` and `result`. |

---

## Example ExecutionCommand payloads

**RAG (single model):**
```json
{
  "pipelineName": "rag-mistral",
  "input": { "question": "What is RAG?" }
}
```

**Chat (single model):**
```json
{
  "pipelineName": "chat-llama3.2",
  "input": { "question": "Explain async in one sentence." }
}
```

**Query all models (async, merged):**
```json
{
  "pipelineName": "query-all-models",
  "input": { "question": "What is 2 + 2?" }
}
```

**Document ingestion:**
```json
{
  "pipelineName": "document-ingestion",
  "input": { "document": "Your long text here..." }
}
```

---

## Debug: avoiding workflow and activity timeouts

When debugging, "Workflow timed out" can come from two places. You cannot literally remove timeouts (Temporal requires durations), but you can set them very high so they don't fire during debug.

### 1. Activity timeouts (config)

Activities (each capability run) use timeouts from config. If an activity exceeds them, that activity fails and the workflow can fail or retry.

**Where to set (all in your engine config, e.g. `config/default.json`):**

| Where | Key | Suggestion for debug |
|-------|-----|------------------------|
| **Default for all activities** | `activity.defaultTimeouts.startToCloseSeconds` | Set to a large value (e.g. `86400` = 24 hours). |
| | `activity.defaultTimeouts.scheduleToCloseSeconds` | Same (e.g. `86400`). |
| **Per pipeline** | `pipelines.<id>.defaultTimeoutSeconds` | Set to a large value (e.g. `86400`) for pipelines you debug. |
| **Per capability (root-by-capability)** | `pipelines.<id>.root.<capability>.children[].timeoutSeconds` or on the GROUP | Override with a large value for the capability that's slow (e.g. MODEL). |

**Example (debug-friendly defaults in config):**

```json
"activity": {
  "defaultTimeouts": {
    "scheduleToStartSeconds": 300,
    "startToCloseSeconds": 86400,
    "scheduleToCloseSeconds": 86400
  }
}
```

And for the pipeline you're debugging, set `defaultTimeoutSeconds` to e.g. `86400`. For a single slow capability (e.g. MODEL), you can set `timeoutSeconds` on that STAGE or GROUP node.

### 2. Workflow run timeout (set when starting the workflow)

The **workflow run timeout** is set by whoever **starts** the workflow (Temporal Web UI or a client). It applies to the whole run. If it fires, the workflow is closed as timed out even if activities would still be within their limits.

- **Temporal Web UI:** When you **Start Workflow**, check the form for **Workflow Run Timeout** (or similar). Set it to a very long value (e.g. 24 hours) or leave it empty if the UI treats that as "no timeout".
- **Client code:** When calling `startWorkflow` (or equivalent), set workflow run timeout to a long duration, e.g. `WorkflowOptions.setWorkflowRunTimeout(Duration.ofHours(24))`. In some SDKs, a zero or "unset" value means no timeout; check your Temporal client docs.

The worker does not start workflows; it only executes them. So workflow run timeout is always controlled at the **call site** (UI or client).

### Summary

| Timeout | Controlled by | How to relax for debug |
|---------|----------------|------------------------|
| **Activity** (per capability) | Engine config: `activity.defaultTimeouts`, pipeline `defaultTimeoutSeconds`, per-node `timeoutSeconds` | Set to large values (e.g. `86400` seconds) in config. |
| **Workflow run** | Workflow starter (Temporal UI or client) | Set a long run timeout (e.g. 24h) or "no timeout" when starting the workflow. |

---

Optional: you can pass `"modelId": "<model>"` in `input` to override the pipeline's default model for chat/RAG pipelines where the plugin supports it.
