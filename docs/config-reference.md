<!-- Copyright 2026 Open LLM Orchestrator contributors. Licensed under the Apache License, Version 2.0; see LICENSE file. -->

# Engine configuration reference

All engine behaviour is driven by configuration. **Nothing is hardcoded in the engine.** For **Configuration UI** and **Capability Debugging UI** (capabilities, plugin types, activity names, context keys), see [**ui-reference.md**](ui-reference.md).

---

## Config examples (dedicated per use case)

Example configs live under [`config-examples/`](../config-examples/). Copy and adapt as needed. Each file targets one use case.

| File | Use case |
|------|----------|
| [`engine-config-minimal.json`](../config-examples/engine-config-minimal.json) | **Minimal** — Bare minimum: worker queue + one pipeline (`default`) with root (capability map). No temporal, redis, database, or activity. Template plugin names (`com.example.*`). Good for quick start or as a copy-paste base. |
| [`engine-config-full.json`](../config-examples/engine-config-full.json) | **Full** — All sections: worker, temporal, activity (timeouts + retry), redis, database, capabilityOrder/stageOrder, pipelines with root (capability map). Template plugin names. Use when you need every section in one file. |
| [`engine-config-capabilities.json`](../config/engine-config-capabilities.json) | **Capabilities format** — Same pipeline flow expressed with `pipelines.default.stages` (array of capability blocks). Each capability has groups; group `children` are activity names (plugin ids). Use when you prefer the stages-array style over root map. |
| [`engine-config-multi-pipeline.json`](../config-examples/engine-config-multi-pipeline.json) | **Multiple pipelines** — Two pipelines: `chat` and `document-extraction`. Workflow payload must set `pipelineName` to one of these. Shows mergePolicy and rootByCapability/rootByStage. Template plugin names. |
| [`engine-config-document-ingestion.json`](../config-examples/engine-config-document-ingestion.json) | **Document ingestion** — Single pipeline: FILTER (DocumentTokenizerPlugin) → RETRIEVAL (VectorStoreRetrievalPlugin). Uses real OLO plugin FQCNs. For indexing/digesting documents into a vector store. |
| [`engine-config-chat-only.json`](../config-examples/engine-config-chat-only.json) | **Chat only** — Single pipeline: MODEL (Llama32ChatPlugin) → POST_PROCESS (AnswerFormatPlugin). No retrieval. Uses real OLO plugins; requires Ollama (or compatible) for the model. |
| [`engine-config-rag.json`](../config-examples/engine-config-rag.json) | **RAG** — Single pipeline: RETRIEVAL (VectorStoreRetrievalPlugin) → MODEL (Llama32ModelPlugin) → POST_PROCESS (AnswerFormatPlugin). Uses real OLO plugins. For question-answer over indexed documents. |
| [`engine-config-production.json`](../config-examples/engine-config-production.json) | **Production-style** — Same shape as full: worker, temporal, activity, redis, database, capabilityOrder/stageOrder, pipelines. In production, set queue/Redis/DB via env (see [Production: environment variables (container)](#production-environment-variables-container)). |

---

## Production: environment variables (container)

In production, **queue name, Redis, and DB connection** come **only from environment** (or system properties). They are never read from the config file or from Redis/DB config storage.

| Env var | Default | Description |
|---------|---------|-------------|
| `TEMPORAL_TARGET` | `localhost:7233` | Temporal server address. Overrides config when set. |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace. Overrides config when set. |
| `QUEUE_NAME` | `core-task-queue` | Temporal task queue name. |
| `REDIS_HOST` | `localhost` | Redis host for config storage and cache. |
| `REDIS_PORT` | `6379` | Redis port. |
| `REDIS_PASSWORD` | (empty) | Redis password. |
| `DB_URL` | `jdbc:postgresql://localhost:5432/olo_config` | JDBC URL for config storage. |
| `DB_USERNAME` | `postgres` | DB user. |
| `DB_PASSWORD` | `postgres` | DB password. |
| `CONFIG_RETRY_SLEEP_SECONDS` | `30` | Seconds to sleep before retrying when config is not found anywhere. |
| `CONFIG_KEY` | `default` | Config key used in Redis key: `olo:engine:config:<CONFIG_KEY>:<version>`. Set via env; unset uses default. |
| `CONFIG_VERSION` | `1.0` | Config version used for Redis key on **read**: `olo:engine:config:<CONFIG_KEY>:<CONFIG_VERSION>`. |
| `CONFIG_FILE_PATH` | (none) | Optional. When set, this path is used for file fallback. When unset, file path is **`config/<CONFIG_KEY>.json`** (e.g. `config/default.json`). Multiple config files can live in `config/`; the one loaded is determined by `CONFIG_KEY`. |
| `MAX_CONCURRENT_WORKFLOW_TASK_POLLERS` | `5` | Max concurrent workflow task pollers (worker tuning). |
| `MAX_CONCURRENT_ACTIVITY_TASK_POLLERS` | `10` | Max concurrent activity task pollers (worker tuning). |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API base URL (used by Llama32ModelPlugin). |
| `OLLAMA_MODEL` | `llama3.2:latest` | Ollama model name for generate API. |
| `OLLAMA_TIMEOUT_SECONDS` | `300` | Request timeout (seconds) per Ollama `/api/generate` call. Increase for slow models or **query-all-models** (6 models in parallel). |

**Server configuration** (activity timeouts/retry, pipeline) is loaded from config; Temporal target/namespace and queue/Redis/DB are overridden from env when set.

---

## Config loading order (bootstrap)

Config is **retrieved once** at bootstrap, in this order:

1. **Redis** – key `olo:engine:config:<config_key>:<version>` (e.g. `olo:engine:config:default:1.0`) (JSON blob). `config_key` from env `CONFIG_KEY` (default `default`). Version for **read** from env `CONFIG_VERSION` (default `1.0`). When config is written (e.g. after loading from file), version is taken from the JSON `configVersion` field.
2. **DB** – table `olo_config` (created if missing): `config_key VARCHAR(255) PRIMARY KEY`, `config_value TEXT`. Engine config is stored with `config_key = 'engine_config'`.
3. **File** – path is **`config/<CONFIG_KEY>.json`** when `CONFIG_FILE_PATH` is unset (e.g. `config/default.json`). Multiple files can exist in `config/` (e.g. `config/default.json`, `config/production.json`); the file chosen is the one whose name matches `CONFIG_KEY`. Set `CONFIG_FILE_PATH` to override this path.

If **not found** in any of the three, the process **sleeps** for `CONFIG_RETRY_SLEEP_SECONDS`, then **retries** (Redis → DB → file) until config is found.

When config is **found in the file**, it is **written back to Redis and DB** so that other pods (or the next boot) can read it from Redis, replicating the same config across instances.

After config is loaded, **connection values** (queue name, Redis, DB) are **overridden from env**. Only then does the worker **connect to Temporal** and register. So Temporal registration happens **only after** a valid config is available.

### Execution hierarchy: build once, reuse for container lifecycle

The **execution hierarchy** (capability plan, resolver, and plugin/activity registries) is **built once** at bootstrap from config and **reused for the entire container lifecycle**. It is **immutable** and holds **no transactional or request-scoped data** (no workflow ID, request context, or per-execution state). This avoids memory leaks: per-run state is passed as execution context at run time and is never retained by the runtime or by capability handlers.

---

## Root sections (in stored / file config)

| Section      | Purpose |
|-------------|---------|
| `configVersion` | Schema version (e.g. `"1.0"`). |
| `worker`    | Task queue and worker behaviour. |
| `temporal`  | Temporal server connection. |
| `activity`  | Default activity timeouts and retry policy. |
| `redis`     | Redis connection (if used). |
| `database`  | DB connection (if used). |
| `stageOrder` | Optional. Order of stages when root is a stages map; only stages present there are included. If omitted, predefined order in code is used. |
| `mergePolicies` | Optional. Map of policy name → implementation. Value = built-in name (FIRST_WINS, LAST_WINS, PREFIX_BY_ACTIVITY) or fully qualified class name. Registered at bootstrap; reference by name in pipeline/group `asyncOutputMergePolicy`. |
| `dynamicPlugins` | Optional. Map of **plugin name** (activity id) → **path to JAR file**. At bootstrap the engine tries to load each JAR and register a `StageHandler`; if the file is missing or load fails, a no-op wrapper is registered and a log message is emitted. At runtime, if the plugin was not loaded, the wrapper logs and returns empty output so the workflow continues. JAR must provide `META-INF/services/com.openllmorchestrator.worker.engine.stage.StageHandler`. |
| `pipelines` | **Required.** Map of pipeline name → pipeline config (e.g. `default`, chat, document-extraction). At least one pipeline required. |

---

## `worker` (overridden by env in production)

| Key           | Type    | Description |
|---------------|---------|-------------|
| `queueName`   | string  | Temporal task queue name. In production, use env `QUEUE_NAME`. |
| `strictBoot`  | boolean | If true, fail startup on validation warnings. |

---

## `temporal`

| Key         | Type   | Default           | Description |
|-------------|--------|-------------------|-------------|
| `target`    | string | `localhost:7233`  | Temporal server address. |
| `namespace` | string | `default`         | Temporal namespace. |

---

## `activity`

Default timeouts and retry policy for all activities (overridable per stage in pipeline nodes).

### `activity.defaultTimeouts`

| Key                    | Type    | Default | Description |
|------------------------|--------|--------|-------------|
| `scheduleToStartSeconds` | int? | (none) | Max time from schedule to worker pickup. |
| `startToCloseSeconds`   | int  | 30     | Max time for activity execution. |
| `scheduleToCloseSeconds`| int? | (none) | Max time from schedule to completion. |

### `activity.retryPolicy`

| Key                     | Type     | Default | Description |
|-------------------------|----------|--------|-------------|
| `maximumAttempts`       | int      | 3      | Max retry attempts. |
| `initialIntervalSeconds`| int      | 1      | First retry delay. |
| `backoffCoefficient`    | double   | 2.0    | Exponential backoff factor. |
| `maximumIntervalSeconds`| int      | 60     | Cap on retry interval. |
| `nonRetryableErrors`    | string[] | []     | Error type names that must not be retried. |

---

## `pipelines` (multiple flows only)

Config must have **`pipelines`**: a map of **pipeline name** → pipeline config (e.g. `"default"`, `"chat"`, `"document-extraction"`). At least one pipeline is required. Workflow payload must set **`pipelineName`** to one of these names (use `"default"` for a single flow).

Each pipeline has **one root**. Root is **one or more stages**; each stage has **one group**; each group has **one or more** groups and/or stages (see *Pipeline nodes* below).

**Root** is polymorphic (same key `root` in JSON):

- **Stages map** — Object whose keys are stage names (e.g. `ACCESS`, `RETRIEVAL`) and values are **one GROUP** each. Execution order follows `stageOrder` (or predefined order). This is the recommended shape.
- **Legacy single tree** — Single GROUP node with `type`, `executionMode`, `children` (nested GROUP/PLUGIN nodes). Supported for backward compatibility.

| Key                         | Type   | Description |
|-----------------------------|--------|-------------|
| `defaultTimeoutSeconds`     | int    | Default start-to-close for stages. **Required.** |
| `defaultAsyncCompletionPolicy` | string | Default for ASYNC groups: see below. |
| `defaultMaxGroupDepth`     | int    | Max depth for nested GROUP recursion (default **5**). Exceeding throws at plan build. |
| `root`                      | object | **Required.** Either (1) stages map: stage name → GROUP config (one group per stage), or (2) legacy: single GROUP tree. |
| `stages`                    | array  | Alternative top-level flow (ordered stage blocks with activity names). Use when not using `root`. |

**Workflow payload:** `ExecutionCommand` (or workflow input) must include **`pipelineName`** set to one of the keys in `pipelines` (e.g. `"default"`, `"chat"`, `"document-extraction"`). If omitted or blank, `"default"` is used.

### Async completion policy

For ASYNC groups, how to complete:

| Value            | Behaviour |
|------------------|-----------|
| `ALL`            | Wait for all activities; fail if any fails. (Default.) |
| `FIRST_SUCCESS`  | Complete when the first activity succeeds. |
| `FIRST_FAILURE`  | Fail as soon as one activity fails. |
| `ALL_SETTLED`    | Wait for all to finish, then fail if any failed. |

Can be set at pipeline level (`defaultAsyncCompletionPolicy`) or per GROUP node (`asyncCompletionPolicy`).

### Pipeline data flow (original input, accumulated output, current plugin output)

On every workflow execution each plugin receives:

- **Original input** — read-only map from `ExecutionCommand.input` (same for all plugins in the run).
- **Accumulated output** — map of output from all **previous** stages (read-only in the activity).
- **Current plugin output** — map the plugin writes into via `context.putOutput(key, value)`; after the stage this is merged into accumulated output for the next stage.

After every **SYNC** plugin execution, its output map is merged into the accumulated output (putAll). For **ASYNC** groups, before exiting the group the engine **invokes a merge policy activity** (same pattern as other plugins). The merge policy is configured per group via `asyncOutputMergePolicy`.

### ASYNC merge policy (invoked as activity)

For ASYNC groups, configure the merge policy in one of two ways:

- **Hook (recommended):** Set `mergePolicy` to an object: `{ "type": "MERGE_POLICY", "pluginType": "MergePolicy", "name": "com.example.plugin.RankedMerge" }`. The `name` is the activity/plugin name or FQCN (e.g. `LAST_WINS`, or a custom class). Can be set at **pipeline** level (default for all ASYNC groups) or on each **GROUP** (override).
- **Legacy:** Set `asyncOutputMergePolicy` to a string (activity name). If `mergePolicy` is also set, the hook’s `name` takes precedence.

Before the group completes, this plugin is invoked as a Temporal activity with accumulated output and the list of async results; it returns the merged map. Built-in plugin names (registered in the activity registry):

| Value | Behaviour |
|-------|-----------|
| `LAST_WINS` (default) | Last writer overwrites; merge in definition order (putAll each). |
| `FIRST_WINS` | First finished plugin's output written first; later outputs do not overwrite keys (putIfAbsent). |
| `PREFIX_BY_ACTIVITY` | Each plugin's keys are prefixed by activity name (e.g. `MemoryPlugin.result`) so no overwrite. |

Custom merge strategies: implement a `StageHandler` that reads `context.getAccumulatedOutput()` and `context.get("asyncStageResults")`, merges them, and writes the merged map via `context.putOutput(key, value)`. Register it in the activity registry under a name (e.g. at bootstrap) and set `asyncOutputMergePolicy` to that name in the group config.

#### mergePolicies (engine-level)

Optional top-level key. Map of **policy name** (used in `asyncOutputMergePolicy`) → **implementation**. Value is either a **built-in name** (alias) or a **fully qualified class name** implementing `AsyncMergePolicy`. Applied at bootstrap before plans are built.

| Key (policy name) | Value | Meaning |
|------------------|-------|---------|
| any string        | `FIRST_WINS`, `LAST_WINS`, `PREFIX_BY_ACTIVITY` | Alias to built-in policy. |
| any string        | `com.example.MyMergePolicy` (contains dot)      | Instantiate this class and register. |

Example:

```json
"mergePolicies": {
  "DEFAULT_ASYNC": "LAST_WINS",
  "NO_OVERWRITE": "PREFIX_BY_ACTIVITY",
  "CUSTOM_MERGE": "com.mycompany.merge.CustomAsyncMergePolicy"
}
```

Then set `asyncOutputMergePolicy` to `"DEFAULT_ASYNC"`, `"NO_OVERWRITE"`, or `"CUSTOM_MERGE"` in pipeline or group config.

### Dynamic plugins (optional JAR loading)

Use **`dynamicPlugins`** to load plugins from JAR files at bootstrap. Each key is the **plugin name** (activity id used in pipeline `name`); each value is the **path to the JAR** (absolute or relative to the process working directory).

- **Load time:** The engine tries to load each JAR and register a `StageHandler`. If the file does not exist or loading fails (e.g. no SPI provider in the JAR), it **logs a message and continues** — it does not fail startup. A no-op wrapper is registered for that name.
- **Runtime:** When a stage uses that plugin name, the wrapper runs: if the plugin was loaded, it delegates to it; if not, it **logs and returns empty output** so the workflow continues.

The JAR must provide a service implementation via **`META-INF/services/com.openllmorchestrator.worker.engine.stage.StageHandler`** (one line: fully qualified class name of the implementation).

Example:

```json
"dynamicPlugins": {
  "MyOptionalPlugin": "/opt/plugins/my-plugin.jar",
  "DynamicAddress": "plugins/another.jar"
}
```

Reference the plugin in pipeline nodes by **`name`** (e.g. `"MyOptionalPlugin"`, `"DynamicAddress"`). If the JAR was missing at startup, that stage will no-op and log when executed.

### Pipeline mode: stages (top-level flow)

When `pipeline.stages` is set, the pipeline is defined as:

1. **Stages** = top-level flow (e.g. ACCESS → MEMORY → RETRIEVAL → MODEL).
2. **Within each stage**: one or more **groups**, with **SYNC** or **ASYNC** execution, **recursively** (groups can nest).
3. **Within each group**: **children** are **activity names** (plugin ids), e.g. `AccessControlPlugin`, `RateLimitPlugin`.
4. **Each child** is implemented by **one plugin** (a `StageHandler` registered in the activity registry).

Example shape:

```json
"stages": [
  { "stage": "ACCESS", "groups": [
    { "executionMode": "SYNC", "children": ["AccessControlPlugin", "TenantPolicyPlugin", "RateLimitPlugin"] }
  ]},
  { "stage": "MEMORY", "groups": [
    { "executionMode": "ASYNC", "asyncCompletionPolicy": "ALL", "children": ["MemoryPlugin", "VectorStorePlugin"] }
  ]},
  { "stage": "MODEL", "groups": [
    { "executionMode": "SYNC", "children": ["ModelPlugin"] }
  ]}
]
```

Group `children` entries can be **strings** (activity name) or **nested group objects** (same shape: `executionMode`, `children`, `maxDepth`, etc.). Every string must be a registered plugin/activity name (see *Predefined stages and plugins* and activity registry). Nested group depth is limited by pipeline **`defaultMaxGroupDepth`** (default 5) or per-group **`maxDepth`**; exceeding throws at plan build.

### Predefined stages and plugins

**Predefined stages** (when used in the pipeline, a handler must be registered):

| Stage           | Typical plugin(s) |
|-----------------|-------------------|
| `ACCESS`        | AccessControlPlugin, TenantPolicyPlugin, RateLimitPlugin |
| `MEMORY`        | MemoryPlugin, VectorStorePlugin |
| `RETRIEVAL`     | VectorStorePlugin, SearchPlugin |
| `MODEL`         | ModelPlugin |
| `MCP`           | MCPPlugin |
| `TOOL`          | ToolPlugin |
| `FILTER`        | FilterPlugin, GuardrailPlugin |
| `POST_PROCESS`  | RefinementPlugin, PromptBuilderPlugin |
| `OBSERVABILITY` | ObservabilityPlugin, TracingPlugin, BillingPlugin, FeatureFlagPlugin, AuditPlugin |
| `CUSTOM`        | CustomStagePlugin (or custom bucket handlers) |

**Available plugin identifiers** (config maps each stage to one plugin id; default implementation uses `"default"`): AccessControlPlugin, TenantPolicyPlugin, RateLimitPlugin, MemoryPlugin, VectorStorePlugin, ModelPlugin, MCPPlugin, ToolPlugin, FilterPlugin, GuardrailPlugin, RefinementPlugin, PromptBuilderPlugin, ObservabilityPlugin, TracingPlugin, BillingPlugin, FeatureFlagPlugin, AuditPlugin, SecurityScannerPlugin, CachingPlugin, SearchPlugin, LangChainAdapterPlugin, AgentOrchestratorPlugin, WorkflowExtensionPlugin, CustomStagePlugin.

---

## Pipeline nodes (when using `root` or `rootByStage`)

When using `pipeline.root` or `pipeline.rootByStage`, the tree is made of GROUP and STAGE nodes:

### PLUGIN node (leaf)

Every leaf node that invokes a plugin must have **`type`: `"PLUGIN"`**, **`pluginType`** (one of the allowed plugin types below), and **`name`** (the **class name to call** — fully qualified class name of the implementation). **`"PLUGIN"`** is accepted as a backward-compatible alias for `"PLUGIN"`.

| Key                     | Type    | Description |
|-------------------------|---------|-------------|
| `type`                  | string  | `"PLUGIN"`. **Required.** (Legacy: `"PLUGIN"` accepted.) |
| `pluginType`            | string  | **Required.** One of the allowed plugin types (see list below). |
| `name`                  | string  | **Required.** Class name to call (fully qualified class name, e.g. `com.example.plugin.AccessControlPluginImpl`). |
| `timeoutSeconds`        | int?    | Override start-to-close for this plugin. |
| `scheduleToStartSeconds`| int?    | Override schedule-to-start. |
| `scheduleToCloseSeconds`| int?    | Override schedule-to-close. |
| `retryPolicy`           | object? | Override retry policy (same shape as `activity.retryPolicy`). |

**Allowed `pluginType` values:** AccessControlPlugin, TenantPolicyPlugin, RateLimitPlugin, MemoryPlugin, VectorStorePlugin, ModelPlugin, MCPPlugin, ToolPlugin, FilterPlugin, GuardrailPlugin, RefinementPlugin, PromptBuilderPlugin, ObservabilityPlugin, TracingPlugin, BillingPlugin, FeatureFlagPlugin, AuditPlugin, SecurityScannerPlugin, CachingPlugin, SearchPlugin, LangChainAdapterPlugin, AgentOrchestratorPlugin, WorkflowExtensionPlugin, CustomStagePlugin.

### GROUP node

| Key                    | Type   | Description |
|------------------------|--------|-------------|
| `type`                 | string | `"GROUP"`. **Required.** |
| `executionMode`        | string | `"SYNC"` or `"ASYNC"`. **Required.** |
| `asyncCompletionPolicy`| string?| For ASYNC: `ALL`, `FIRST_SUCCESS`, `FIRST_FAILURE`, `ALL_SETTLED`. |
| `asyncOutputMergePolicy` | string?| For ASYNC: merge policy activity name (legacy). Prefer `mergePolicy` hook. |
| `mergePolicy`           | object?| For ASYNC: merge policy hook. `{ "type": "MERGE_POLICY", "pluginType": "MergePolicy", "name": "<activity or FQCN>" }`. |
| `maxDepth`             | int?   | Max recursion depth for nested groups at this node (overrides pipeline `defaultMaxGroupDepth`). |
| `timeoutSeconds`       | int?   | Default timeout for children (ASYNC group). |
| `children`             | array  | Child nodes. **Required.** |

---

## Example (minimal)

```json
{
  "configVersion": "1.0",
  "worker": { "queueName": "core-task-queue" },
  "pipelines": {
    "default": {
      "defaultTimeoutSeconds": 30,
      "defaultAsyncCompletionPolicy": "ALL",
      "root": {
        "ACCESS": { "type": "GROUP", "executionMode": "SYNC", "children": [{ "PLUGIN", "pluginType": "AccessControlPlugin", "name": "com.example.plugin.AccessControlPluginImpl", "timeoutSeconds": 10 }] },
        "MODEL": { "type": "GROUP", "executionMode": "SYNC", "children": [{ "PLUGIN", "pluginType": "ModelPlugin", "name": "com.example.plugin.ModelPluginImpl", "timeoutSeconds": 120 }] }
      }
    }
  }
}
```

`temporal` and `activity` are optional; defaults are used when omitted.

### Example using `stages` (top-level flow, activity names as children)

```json
{
  "configVersion": "1.0",
  "worker": { "queueName": "core-task-queue" },
  "pipeline": {
    "defaultTimeoutSeconds": 30,
    "defaultAsyncCompletionPolicy": "ALL",
    "stages": [
      { "stage": "ACCESS", "groups": [
        { "executionMode": "SYNC", "children": ["AccessControlPlugin", "TenantPolicyPlugin", "RateLimitPlugin"] }
      ]},
      { "stage": "MEMORY", "groups": [
        { "executionMode": "ASYNC", "asyncCompletionPolicy": "ALL", "children": ["MemoryPlugin", "VectorStorePlugin"] }
      ]},
      { "stage": "MODEL", "groups": [
        { "executionMode": "SYNC", "children": ["ModelPlugin"] }
      ]}
    ]
  }
}
```
