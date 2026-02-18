# Features & Use Cases: Open LLM Orchestrator Worker

This document describes the **feature set** and **use cases** enabled by the Open LLM Orchestrator Worker’s capability-based pipeline, pluggable capabilities, and Temporal-backed execution for AI and enterprise solutions.

---

## Feature list (at a glance)

| Area | Features |
|------|----------|
| **Pipeline & capabilities** | Capability-based pipelines; sync/async groups; **group-level if/elseif/else** (condition plugin + thenGroup/elseGroup/elseif.thenGroup); DAG-capable execution graph; predefined capabilities (ACCESS, PLANNER, PLAN_EXECUTOR, MODEL, RETRIEVAL, RETRIEVE, TOOL, MCP, MEMORY, EVALUATE, FEEDBACK_CAPTURE, DATASET_BUILD, TRAIN_TRIGGER, MODEL_REGISTRY, etc.); custom and dynamic (JAR) plugins; iterative blocks and plan executor. |
| **Execution & kernel** | Execution-state driven kernel; deterministic ready set; versioned state (stepId, executionId); execution snapshots; interceptor layer (before/after/onError); execution modes (LIVE, REPLAY, DRY_RUN, EVALUATION, BRANCH). |
| **Capability result & contract** | Deterministic StageResult envelope (output, metadata, deterministic, dependencies); StageMetadata & DependencyRef; ExecutionGraph (linear list → graph, topological order); CheckpointableStage (resumeFrom, branchFrom); OutputContract (schema validation, enforceStrict). |
| **Human & signals** | Async pause: capability calls `requestSuspendForSignal()`; workflow awaits; `receiveSignal(ExecutionSignal)` (HUMAN_APPROVAL, MANUAL_OVERRIDE, COMPLIANCE_ACK); resume with payload. |
| **Pipeline break** | Any activity can request to stop the pipeline: return `StageResult` with `requestPipelineBreak=true` or call `context.requestPipelineBreak()`. **SYNC**: first capability that requests break stops the group and pipeline. **ASYNC**: pipeline breaks only when **all** activities in the group request break; until then execution continues. |
| **Streaming** | StreamingStageHandler and StreamObserver (onToken, onUpdate, onComplete, onError); kernel-native streaming for partial tokens and tool output. |
| **Agents & identity** | AgentContext (agentId, persona, AgentMemoryStore); durable agents across sessions; ExecutionContext references AgentContext; command can set agentId/persona. |
| **Determinism & replay** | DeterminismPolicy (freezeModelParams, persistToolOutputs, persistRetrievalResults); randomnessSeed; ContextSnapshot carries policy; NONE/FULL presets for enterprise audit and replay. |
| **Temporal** | Durable workflows and activities; exactly-once execution; retries and timeouts; visibility (UI, event history); long-running and async flows; workflow versioning; signal support for human-in-the-loop. |
| **Enterprise** | Access control, multi-tenancy, rate limits, audit, billing, observability, feature flags, security scanning, caching; guardrails, PII, compliance; human approval and compliance gates. |
| **Feature flags** | Every optional feature has a **FeatureFlag** enum; config lists **enabledFeatures**; only enabled features execute (no code paths for disabled features). Loaded at bootstrap for performance. |
| **Minimal activity state** | **activity.payload** config (maxAccumulatedOutputKeys, maxResultOutputKeys) and guidance to keep workflow/activity payloads small so Temporal history (DB/Elastic) stays minimal. |
| **Policy engine** | **ExecutionPolicyResolver**: central model selection by tenant tier, tool whitelist per user, budget/max-token/max-iteration caps (POLICY_ENGINE). |
| **Budget guardrail** | **BudgetGuardrailEnforcer** + **ExecutionCaps**: kernel stops execution when cost/tokens/iterations exceed caps (BUDGET_GUARDRAIL). |
| **Concurrency isolation** | **QueueTopologyConfig**: queue-per-stage, queue-per-tenant for isolating heavy models and high-cost tenants (CONCURRENCY_ISOLATION). |
| **Security hardening** | **SecurityHardeningGate**: prompt injection defense, tool allowlist, output scanning pre-persist, context poisoning detection (SECURITY_HARDENING). |
| **Plan safety validation** | **PlanValidator**: allowed stages only, max depth, no recursive infinite loops, no unauthorized injection before running dynamic plan (PLAN_SAFETY_VALIDATION). |
| **Graph export** | **ExecutionGraph** exports: toDot(), toMermaid(), toJsonForUi() for DOT, Mermaid, JSON (EXECUTION_GRAPH_EXPORT). |
| **Learning & training stages** | EVALUATE, FEEDBACK_CAPTURE, DATASET_BUILD, TRAIN_TRIGGER, MODEL_REGISTRY; future-ready for incremental learning and model lifecycle; stub plugins provided. |
| **Conditional groups** | At group level: **condition** plugin runs first (writes output key `branch`); then one of **then** / **elseif** / **else** runs; prefer **thenGroup**, **elseGroup**, **elseifBranches[].thenGroup** (group as children). |
| **Config & debugging UI** | **ui-reference.md**: single reference for Configuration UI and Capability Debugging UI (predefined capabilities table, plugin types, config schema, pipeline structure, activity naming, context keys). |

---

## Feature flags and minimal activity state

### Feature flags (config-driven)

All optional features are gated by a **FeatureFlag** enum. In the configuration file, set **enabledFeatures** to the list of feature names you want enabled (e.g. `["VERSIONED_STATE", "STAGE_RESULT_ENVELOPE", "HUMAN_SIGNAL"]`). Flags are loaded at **bootstrap**; only enabled features run—disabled features execute no code paths, which helps performance.

**Available flags:** `HUMAN_SIGNAL`, `STREAMING`, `AGENT_CONTEXT`, `DETERMINISM_POLICY`, `CHECKPOINTABLE_STAGE`, `OUTPUT_CONTRACT`, `EXECUTION_GRAPH`, `STAGE_RESULT_ENVELOPE`, `VERSIONED_STATE`, `INTERCEPTORS`, `PLANNER_PLAN_EXECUTOR`, `EXECUTION_SNAPSHOT`, `POLICY_ENGINE`, `BUDGET_GUARDRAIL`, `CONCURRENCY_ISOLATION`, `SECURITY_HARDENING`, `PLAN_SAFETY_VALIDATION`, `EXECUTION_GRAPH_EXPORT`.

When **enabledFeatures** is missing or empty, no optional features are enabled (core pipeline still runs). Add only the flags you need.

### Feature-flag design: bootstrap elimination and minimal runtime check

**Intended design:**

1. **Eliminate execution hierarchy during bootstrap** — For each feature flag, the execution hierarchy (plan shape, registered executors, interceptors, resolvers) should be built **only when the feature is enabled**. Disabled features must not register or build that code path at bootstrap, so they run no code and add no branches in the hot path. Example: if `EXECUTION_GRAPH` is off, the plan is built with linear capabilityOrder/stageOrder only (no graph topology); if `HUMAN_SIGNAL` is off, the workflow/kernel need not register suspend/signal handling in the built hierarchy.

2. **Minimal enum check at root when runtime is required** — If a feature genuinely requires a **runtime** decision (e.g. “after this group, should we suspend for signal?”), the check must be a **single, minimal enum check at root level** (e.g. at workflow entry or kernel loop head), not scattered `isEnabled(FeatureFlag.X)` calls in many executors or activities. That way the feature is eliminated in one place: one branch at the root, and the rest of the pipeline stays feature-agnostic.

**Current practice:** Flags are loaded from config at bootstrap and set on `EngineRuntime` in **SetRuntimeStep**. Plan building uses the flag **EXECUTION_GRAPH** at bootstrap to choose capability order (topological from graph vs linear from capabilityOrder/`stageOrder`), so that part of the hierarchy is already eliminated at bootstrap. Some features still use runtime checks in executors or workflow; the target state is to move those to bootstrap-time elimination or to a single root-level check where runtime is unavoidable.

### Minimal activity state (Temporal history)

Temporal records workflow and activity input/output in its store (DB/Elastic). To keep history small:

- **activity.payload** in config supports **maxAccumulatedOutputKeys** and **maxResultOutputKeys** (0 = no limit). Use to document or enforce size limits.
- Prefer storing large blobs (e.g. full documents, big model outputs) in external storage and passing only references (keys, URLs) in context.
- Keep **ExecutionCommand.input** and capability outputs lean when possible so activity invocations stay small.

---

## Use cases (at a glance)

- **RAG & Q&A** — Vector retrieval → model → post-process; internal docs, support bots, legal Q&A.  
- **Multi-model & A/B** — Parallel models (ASYNC), merge policies; cost/quality comparison, fallbacks.  
- **Dynamic planning** — PLANNER (LLM) writes plan → PLAN_EXECUTOR runs it; task decomposition, agentic flows.  
- **Tools & MCP** — TOOL/MCP stages; function calling, APIs, MCP servers; booking, CRM, search.  
- **Memory & chat** — MEMORY stage; multi-turn chat, personalization, session context.  
- **Human-in-the-loop** — Suspend for approval; signal to resume with payload; moderation, compliance gates.  
- **Streaming** — Token-by-token and intermediate updates via StreamObserver; kernel-native streaming.  
- **Durable agents** — AgentContext + memory store; agents persist across sessions.  
- **Replay & audit** — Versioned state, determinism policy, checkpoint/resume; enterprise audit and replay.  
- **Document ingest** — FILTER → RETRIEVAL; tokenize, chunk, index; wikis, contracts, searchable knowledge.  
- **Guardrails & safety** — Guardrail plugins; PII, toxicity, policy; compliance and brand safety.  
- **Observability & cost** — Interceptors, metrics, tracing, billing; SLOs, cost attribution.  
- **Incremental learning & model lifecycle** — EVALUATE → FEEDBACK_CAPTURE → DATASET_BUILD → TRAIN_TRIGGER → MODEL_REGISTRY; quality gates, feedback collection, dataset curation, training triggers, model promotion.  
- **Conditional branching** — Group-level if/elseif/else: condition plugin selects branch; thenGroup/elseGroup/elseif.thenGroup (group as children) for then/else/elseif.

**Possible use cases by capability:**

- **Streaming** — Real-time chat UX (token-by-token), streaming tool calls, progress updates to UI.  
- **Human signal** — Content moderation, approval workflows, manual override, compliance acknowledgment.  
- **Agent identity** — Personalized assistants, persistent bot personas, cross-session memory.  
- **Determinism** — Reproducible evaluation runs, compliance replay, locked tool/retrieval outputs.  
- **Checkpoint/resume** — Long runs, branch-from-step experimentation, replay from a step.  
- **Output contract** — Structured LLM output, API-safe responses, schema-validated results.  
- **Conditional groups** — If/elseif/else at group level; condition plugin selects branch; thenGroup/elseGroup (group as children).  
- **Learning capabilities** — EVALUATE, FEEDBACK_CAPTURE, DATASET_BUILD, TRAIN_TRIGGER, MODEL_REGISTRY for incremental learning and model lifecycle.

Details for each area are in the sections below.

---

## 1. AI / LLM Use Cases

### 1.1 Retrieval-Augmented Generation (RAG)
- **Vector-store retrieval** → **Model** → **Post-process**: answer from your data with citation.
- Pipelines: `question-answer`, `rag-llama-oss`, `rag-openai-oss`, `rag-both`, etc.
- Plugins: `VectorStorePlugin`, `ModelPlugin`, `RefinementPlugin` (e.g. answer formatting).
- **Enterprise**: internal docs, knowledge bases, support bots, legal/contract Q&A.

### 1.2 Multi-Model & Model Comparison
- Run **multiple models in parallel** (ASYNC MODEL group) and merge with a policy (e.g. `ALL_MODELS_RESPONSE_FORMAT`).
- Compare OSS vs hosted, A/B test models, ensemble or fallback.
- Pipelines: `both`, `rag-both`.
- **Enterprise**: cost/quality tradeoffs, vendor comparison, redundancy.

### 1.3 Dynamic Planning (LLM-as-Planner)
- **PLANNER** capability: plugin (e.g. LLM) designs a **dynamic execution plan** and stores it in context.
- **PLAN_EXECUTOR** capability: kernel runs that plan (no plugin); inside an iterator = **iterative plan executor**.
- Use cases: task decomposition, multi-step reasoning, adaptive pipelines, agentic workflows.
- **Enterprise**: complex decision flows, compliance steps, conditional sub-pipelines.

### 1.4 Tool Use & Function Calling
- **TOOL** capability with `ToolPlugin`: call APIs, DBs, calculators, internal services.
- Chain: **Model** (decides tool) → **TOOL** (executes) → **Model** (summarizes).
- **Enterprise**: booking, search, CRM, ERP, ticketing, data lookups.

### 1.5 MCP (Model Context Protocol)
- **MCP** stage with `MCPPlugin`: connect LLMs to MCP servers (files, DBs, APIs).
- Standard way to give models “tools” and context.
- **Enterprise**: unified tool layer, security and audit around tool access.

### 1.6 Memory & Conversation
- **MEMORY** stage with `MemoryPlugin`: read/write conversation or user memory.
- Enables multi-turn chat, personalization, session context.
- **Enterprise**: support bots, sales assistants, personalized recommendations.

### 1.7 Reflection & Self-Critique
- **REFLECTION** stage: plugins that score or critique model output and feed back.
- Use with **ITERATIVE_BLOCK** for improve-until-good flows.
- **Enterprise**: quality gates, consistency checks, safe answers.

### 1.8 Prompt Engineering & Assembly
- **PRE_CONTEXT_SETUP**, **PROMPT_BUILDER** (`PromptBuilderPlugin`): build prompts from templates, user input, and context.
- **Enterprise**: branded prompts, compliance text, locale-specific wording.

### 1.9 Document Ingestion & Indexing
- **FILTER** (e.g. tokenizer, chunker) → **RETRIEVAL** (vector store): ingest docs/folders into a vector DB.
- Pipelines: `document-ingestion`, `document-ingestion-folder`.
- **Enterprise**: internal wikis, contracts, manuals, searchable knowledge.

### 1.10 Guardrails & Safety
- **GUARDRAIL** (`GuardrailPlugin`): PII redaction, toxicity, policy checks, output filters.
- Place before/after **MODEL** or in **FILTER**.
- **Enterprise**: compliance, brand safety, data protection.

### 1.11 Search Beyond Vectors
- **SEARCH** (`SearchPlugin`): keyword, hybrid, or graph search alongside or instead of vector retrieval.
- **Enterprise**: exact match, structured search, graph-based reasoning.

### 1.12 Agent Orchestration
- **AGENT_ORCHESTRATOR** (`AgentOrchestratorPlugin`): delegate to sub-agents or tools.
- Combine with **PLANNER** + **PLAN_EXECUTOR** for plan-based agents.
- **Enterprise**: multi-skill assistants, routing, escalation.

### 1.13 LangChain / Framework Integration
- **LANG_CHAIN_ADAPTER** (`LangChainAdapterPlugin`): wrap LangChain chains or agents as a stage.
- **Enterprise**: reuse existing chains, gradual migration, hybrid orchestration.

---

## 2. Qualities of Using Temporal

The worker runs pipeline **workflows** and **activities** on [Temporal](https://temporal.io). That choice delivers the following qualities for AI and enterprise deployments.

### 2.1 Durability & Reliability
- **Durable execution**: Workflow and activity state are persisted in Temporal’s store. Worker or process restarts do not lose in-flight runs; execution resumes from the last decision point.
- **Exactly-once execution**: Activities are executed exactly once per workflow decision. Retries are handled by Temporal so you avoid duplicate LLM calls or duplicate writes when something fails mid-pipeline.
- **Enterprise**: Safe for production; no “lost” requests or double billing when failures occur.

### 2.2 Retries & Fault Tolerance
- **Configurable retries**: Per-activity timeouts and retry policies (max attempts, backoff, non-retryable errors) are set in config. Failed stages (e.g. model timeout, rate limit) can retry automatically without re-running the whole pipeline.
- **Failure isolation**: A failing activity does not corrupt workflow state. The workflow can retry the activity, skip it, or fail the run in a controlled way.
- **Enterprise**: Handles transient failures (network, provider limits) and keeps pipelines predictable.

### 2.3 Visibility & Observability
- **Temporal Web UI**: Every workflow and activity run is visible by workflow ID, pipeline, and task queue. You can inspect event history, inputs/outputs, and failure reasons without adding custom dashboards.
- **Activity types**: Stages are exposed as activity types (e.g. `RETRIEVAL::VectorStoreRetrievalPlugin`, `MODEL::Llama32ModelPlugin`), so you can see which stage ran, for how long, and with what result.
- **Enterprise**: Debugging, SLA monitoring, and audit trails are built into the platform.

### 2.4 Workflow Replay & History
- **Event-sourced history**: Workflows are replayed from a deterministic event history. You can trace exactly what happened in a run and reproduce issues.
- **No “black box”**: The full sequence of stage invocations, timeouts, and retries is stored and queryable.
- **Enterprise**: Compliance, forensics, and support benefit from a complete, replayable history.

### 2.5 Scalability & Decoupling
- **Scale workers independently**: Add or remove worker processes; Temporal distributes tasks via task queues. Pipeline throughput scales with the number of workers and activity pollers.
- **Decoupled workflow and activities**: The workflow (orchestrator) runs in one place; activities (plugins) run in workers. You can scale or isolate heavy stages (e.g. LLM, retrieval) by queue and worker pool.
- **Enterprise**: Horizontal scaling and clear separation between orchestration and execution.

### 2.6 Long-Running & Async Flows
- **Long-running workflows**: Workflows can run for hours or days (e.g. document ingestion, multi-step agentic flows). They do not need to stay in memory; Temporal persists and rehydrates them.
- **Async by design**: ASYNC stage groups run activities in parallel and merge results; the workflow coordinates without blocking.
- **Enterprise**: Batch jobs, approval flows, and human-in-the-loop patterns fit naturally.

### 2.7 Versioning & Safe Deployment
- **Workflow versioning**: Workflow code can be versioned so that in-flight runs continue on the old version while new runs use the new one, reducing deployment risk.
- **Activity versioning**: New plugin versions can be rolled out per task queue or worker pool.
- **Enterprise**: Zero-downtime deployments and controlled rollouts for pipeline and plugin changes.

### 2.8 Summary: Why Temporal Fits This Platform

| Quality            | Benefit for AI / Enterprise pipelines                          |
|--------------------|----------------------------------------------------------------|
| Durability         | No lost runs on restart; exactly-once activity execution      |
| Retries            | Automatic retry of failed stages with backoff                 |
| Visibility         | Full run history and stage-level visibility in Temporal UI    |
| Replay             | Deterministic replay and audit trail                           |
| Scalability        | Scale workers and queues; decouple orchestration from plugins  |
| Long-running       | Multi-step and batch pipelines without holding process state  |
| Versioning         | Safe rollout of workflow and plugin changes                    |

### 2.9 Kernel: Execution-State Driven, Deterministic, Graph-Capable, Snapshot-Aware

The pipeline kernel is designed so that execution is **state-driven**, **deterministic**, **graph-capable**, and **snapshot-aware**:

- **Execution-state driven**: Progression is driven by explicit **execution state** (plan + context + set of completed group indices). The kernel advances by computing the **ready set** (groups whose dependencies are all completed) and running one group at a time from that set.
- **Deterministic**: The next group is chosen only from the plan and the completed set (no `currentTimeMillis()`, `Random`, or other non-deterministic APIs in workflow code). This keeps Temporal replay correct and audit trails consistent.
- **Graph-capable**: Plans are not only linear: each stage group can declare **dependencies** on other group indices (`dependsOnGroupIndices`). The kernel runs a group when all its dependencies have completed, so DAG-shaped plans (e.g. run A, then B and C in parallel, then D) are supported.
- **Snapshot-aware**: Execution state can produce an **execution snapshot** (plan, completed indices, context copy) at any time for observability, debugging, or recovery tooling.
- **Immutable versioned state**: Context is **versioned** via `VersionedState` (`executionId`, `stepId`, `state` map, `metadata`). Every stage reads previous state; the kernel merges plugin output and produces **new** state (stepId increments). Sync: stepId + 1 per stage; async group: stepId advances by the number of parallel branches (highest among them). This enables **replay**, **diff**, **time-travel**, and **audit**.

### 2.10 Execution Snapshot Hook: Interceptor Layer (Non-Optional)

A **kernel-level interceptor** layer runs around every stage (not as a stage itself):

- **Before stage**: `beforeStage(StageContext ctx)` — state in `ctx` is the versioned state before this stage.
- **After stage**: `afterStage(StageContext ctx, StageResult result)` — called with the stage output (before merge).
- **On error**: `onError(StageContext ctx, Exception e)` — called when the stage throws.

`StageContext` exposes `executionId`, `stepId`, `groupIndex`, `stageDefinition`, `stateBefore`, `executionMode`, and `pipelineName` so interceptors can snapshot, audit, trace, evaluate, or meter. The chain is **non-optional**: when no interceptors are registered, a no-op chain is used. You can plug in:

- **SnapshotWriter** — persist versioned state for replay.
- **AuditWriter** — write audit log entries.
- **Tracer** — emit spans or metrics.
- **Evaluator** — score outputs (e.g. for evaluation runs).
- **CostMeter** — record token/cost per stage.

---

## 3. Enterprise & Governance Use Cases

### 3.1 Access Control & Authorization
- **ACCESS** + **AccessControlPlugin**: validate user, tenant, API key; enforce permissions before any AI step.
- **Enterprise**: SSO, RBAC, tenant isolation.

### 3.2 Multi-Tenancy & Tenant Policy
- **TENANT_POLICY** (`TenantPolicyPlugin`): tenant-specific models, limits, prompts, data scope.
- **Enterprise**: SaaS, B2B, per-tenant SLAs and features.

### 3.3 Rate Limiting & Quotas
- **RATE_LIMIT** (`RateLimitPlugin`): per-user, per-tenant, or per-model limits.
- **Enterprise**: cost control, fair use, abuse prevention.

### 3.4 Audit & Compliance
- **AUDIT** (`AuditPlugin`): log requests, responses, and decisions for compliance and forensics.
- **Enterprise**: SOC2, GDPR, HIPAA, internal audit trails.

### 3.5 Billing & Metering
- **BILLING** (`BillingPlugin`): token/model/usage metering, cost allocation, showback/chargeback.
- **Enterprise**: internal billing, tenant invoicing, cost attribution.

### 3.6 Observability & Tracing
- **OBSERVABILITY**, **SUB_OBSERVABILITY**, **TRACING** (`ObservabilityPlugin`, `TracingPlugin`): metrics, spans, logs across stages.
- **Enterprise**: SLOs, debugging, performance tuning, vendor SLAs.

### 3.7 Feature Flags & Gradual Rollout
- **FEATURE_FLAG** (`FeatureFlagPlugin`): turn pipelines or plugins on/off by user, tenant, or segment.
- **Enterprise**: A/B tests, canary, kill switches.

### 3.8 Security Scanning
- **SECURITY_SCANNER** (`SecurityScannerPlugin`): scan prompts/output for injection, jailbreaks, sensitive data.
- **Enterprise**: secure AI deployment, red-team checks.

### 3.9 Caching
- **CACHING** (`CachingPlugin`): cache model responses, embeddings, or retrieval by key.
- **Enterprise**: cost reduction, latency, repeat queries.

---

## 4. Pipeline Flexibility Use Cases

### 4.1 Per-Use-Case Pipelines
- Different pipelines per product: `document-ingestion`, `question-answer`, `rag-*`, `llama-oss`, `openai-oss`, `both`.
- Same engine, different stage graphs and plugins.
- **Enterprise**: one platform for ingest, chat, RAG, and internal tools.

### 4.2 Sync vs Async Stages
- **SYNC**: strict order (e.g. ACCESS → RETRIEVAL → MODEL → POST_PROCESS).
- **ASYNC**: parallel execution (e.g. multiple models) with configurable merge (LAST_WINS, PREFIX_BY_ACTIVITY, custom).
- **Enterprise**: latency vs throughput, parallel model comparison.

### 4.3 Custom Stages & Extensions
- **CUSTOM**, **SUB_CUSTOM**, **CustomStagePlugin**: arbitrary logic as a stage.
- **WORKFLOW_EXTENSION** (`WorkflowExtensionPlugin`): extend workflow behavior.
- **Enterprise**: proprietary steps, legacy system hooks, domain logic.

### 4.4 Dynamic Plugins (JAR)
- Load plugins from JARs via config (`dynamicPlugins`); no code change to core.
- **Enterprise**: partner or customer plugins, internal SDKs.
- **Plugin contract:** For a full, self-contained contract to implement and scale plugins (StageHandler, ExecutionContext, StageResult, registration, config, optional streaming/checkpoint/output contract, dynamic JAR), see **[Plugin Contract](plugin-contract.md)**.

### 4.5 Iterative Execution
- **ITERATIVE_BLOCK** + **ITERATIVE_BLOCK_END** with **PLAN_EXECUTOR** inside: run a dynamic plan repeatedly (e.g. refine until good, multi-step reasoning).
- **Enterprise**: loops, retries, adaptive flows.

### 4.6 Execution Control
- **EXECUTION_CONTROLLER**: central place for conditional branching, backoff, or policy (e.g. when to use cache vs live model).
- **Enterprise**: cost/latency policies, failover, fallbacks.

### 4.7 Conditional Groups (if/elseif/else)
- At **group level**: set **condition** to a plugin name (ConditionPlugin). That plugin runs first and must write output key **`branch`** (Integer: 0 = then, 1 = first elseif, …, n−1 = else). Only the selected branch runs.
- **Group as children**: prefer **thenGroup**, **elseGroup**, and **elseifBranches[].thenGroup** (one GROUP per branch); alternatively use thenChildren/elseChildren/elseif.then (lists of nodes).
- Use cases: model selection by context, tenant-specific branches, fallback paths, A/B by condition.
- **Enterprise**: conditional pipelines, cost routing, compliance branches. See [configuration-reference.md](configuration-reference.md) and [ui-reference.md](ui-reference.md).

### 4.8 Configuration UI & Stage Debugging UI
- **[ui-reference.md](ui-reference.md)** is the single reference for building Configuration UI and Stage Debugging UI: predefined stages table (with order and descriptions), plugin types table, config schema at a glance, pipeline structure, activity naming (`stageBucketName::activityName`), context keys (originalInput, accumulatedOutput), and execution flow for run inspection.

---

## 5. Other Possible Plugins (Iterator, Planner, and Business-Domain)

Beyond the plugin types already in config, the following **possible plugins** map to common business needs and can be implemented as custom or new plugin types in this domain.

### 5.1 Iterator / Iterative Plugins

| Plugin / concept        | Purpose | Business need |
|-------------------------|--------|----------------|
| **IteratorPlugin**      | Drives loop over items (e.g. chunks, pages, list of tasks). Produces one “current item” or batch per iteration; works with **ITERATIVE_BLOCK** and **PLAN_EXECUTOR** for multi-step or per-item plans. | Batch document processing, paginated APIs, “for each” workflows. |
| **BatchIteratorPlugin** | Splits input into batches (by size, token count, or key), runs downstream stages per batch, aggregates. | Large-doc ingestion, bulk embedding, batch inference. |
| **StreamIteratorPlugin** | Iterates over a stream (e.g. SSE, Kafka) and runs a sub-pipeline per event or window. | Real-time processing, event-driven RAG or classification. |
| **RetryUntilPlugin**     | Repeats a stage or sub-plan until a condition (e.g. REFLECTION score, validation) is met or max iterations reached. | Improve-until-good, self-correction loops. |

- **Stages**: Use **ITERATIVE_BLOCK** + **ITERATIVE_BLOCK_END**; iterator plugin in the block can set context (e.g. current batch, cursor); **PLAN_EXECUTOR** inside the block runs the plan per iteration.
- **Enterprise**: Batch ingest, bulk translation/summarization, per-record pipelines, retry-until-valid flows.

### 5.2 Planner Plugins

| Plugin / concept           | Purpose | Business need |
|----------------------------|--------|----------------|
| **PlannerPlugin**          | LLM (or rule engine) that outputs a **dynamic plan** (stages/steps) and stores it in context under `dynamicPlan` for **PLAN_EXECUTOR** to run. | Task decomposition, multi-step reasoning, adaptive workflows. |
| **TaskDecompositionPlugin**| Given a user goal, produces a list of sub-tasks or a plan DAG. | Project breakdown, research pipelines, agentic flows. |
| **WorkflowGeneratorPlugin**| From natural language or structured input, generates a pipeline spec (e.g. which stages, order) that the engine can run. | “Describe what you want” → run it. |
| **RoutePlannerPlugin**     | Decides which pipeline or branch to run (e.g. by intent, topic, or risk). | Intent routing, triage, escalation. |

- **Stages**: **PLANNER** (plugin runs, writes plan to context) → **PLAN_EXECUTOR** (kernel runs plan). In an iterator, this becomes an **iterative plan executor** (re-plan per iteration if needed).
- **Enterprise**: Complex decision trees, compliance workflows, adaptive agents, dynamic routing.

### 5.3 Content & NLP Plugins

| Plugin / concept           | Purpose | Business need |
|----------------------------|--------|----------------|
| **SummarizationPlugin**    | Short/long summaries, extractive or abstractive. | Reports, emails, tickets, meeting notes. |
| **TranslationPlugin**      | Translate text (or segments) with optional locale/glossary. | Multilingual support, localization. |
| **ClassificationPlugin**   | Label content (intent, topic, sentiment, priority, PII level). | Routing, triage, compliance tagging. |
| **ExtractionPlugin**       | NER, entities, key-value, structured fields from unstructured text. | Contracts, forms, invoices, resumes. |
| **EmbeddingPlugin**        | Compute embeddings for chunks or queries (separate from vector store write). | Reusable embeddings, multiple indexes, custom models. |
| **ChunkingPlugin**         | Split documents by strategy (semantic, token, section). | RAG quality, retrieval tuning. |

- **Enterprise**: Document understanding, contact center automation, content moderation, knowledge mining.

### 5.4 Routing, Validation & Control

| Plugin / concept           | Purpose | Business need |
|----------------------------|--------|----------------|
| **RouterPlugin**           | Route request to a pipeline or model by intent, tenant, or feature flag. | A/B, tenant-specific flows, cost routing. |
| **ValidationPlugin**       | Validate input or output (schema, policy, format); reject or correct. | API contracts, guardrails, data quality. |
| **ThrottlePlugin**         | Delay or throttle calls (e.g. to external APIs) per tenant or key. | Rate limits, cost control, fairness. |
| **FallbackPlugin**         | On failure or low confidence, switch model, pipeline, or return a safe default. | Resilience, graceful degradation. |

- **Enterprise**: Reliability, cost control, multi-tenant routing.

### 5.5 Human & Notifications

| Plugin / concept            | Purpose | Business need |
|-----------------------------|--------|----------------|
| **HumanInTheLoopPlugin**    | Pause workflow for approval, review, or correction; resume when human responds (e.g. via signal). | Moderation, approvals, high-stakes decisions. |
| **NotificationPlugin**     | Send alerts, emails, or Slack/Teams messages at a stage (e.g. on failure, on threshold). | Ops, escalation, user notifications. |
| **ConsentPlugin**           | Check or record user consent/preferences before processing. | GDPR, marketing, sensitive data. |
| **FeedbackPlugin**         | Collect or apply feedback (ratings, corrections) and optionally feed into memory or model tuning. | Learning, quality loops, personalization. |

- **Enterprise**: Compliance, approvals, support escalation, feedback loops.

### 5.6 Data & Privacy

| Plugin / concept           | Purpose | Business need |
|----------------------------|--------|----------------|
| **AnonymizationPlugin**   | Mask or pseudonymize PII/PHI before or after model/retrieval. | Privacy-by-design, HIPAA, anonymized analytics. |
| **RedactionPlugin**        | Redact sensitive spans in output (or input) with optional placeholders. | Safe logging, customer-facing output. |
| **DataResidencyPlugin**    | Ensure processing or storage stays in a given region (e.g. route to local worker/index). | Sovereignty, compliance. |
| **RetentionPlugin**        | Apply retention rules (delete or archive after TTL) for logs, cache, or memory. | GDPR, storage policy. |

- **Enterprise**: Privacy, compliance, data residency, retention.

### 5.7 Integration & Enrichment

| Plugin / concept           | Purpose | Business need |
|----------------------------|--------|----------------|
| **EnrichmentPlugin**      | Call external APIs to enrich context (CRM, calendar, inventory) before or after model. | Richer context, real-time data. |
| **WebhookPlugin**         | Invoke or wait for webhooks (outbound call, or wait for callback). | Third-party integrations, async callbacks. |
| **EventPublishPlugin**    | Publish pipeline events to Kafka, SQS, or event bus. | Event-driven downstream systems. |
| **SyncPlugin**            | Sync state to external system (e.g. CRM, ticketing) after a stage. | System of record updates. |

- **Enterprise**: CRM/ERP integration, event mesh, audit downstream.

---

## 6. Summary Table (Plugin Type → Typical Use)

**Existing / configured plugin types**

| Plugin Type              | Typical use case                          |
|---------------------------|-------------------------------------------|
| AccessControlPlugin       | Auth, permissions, tenant/user check      |
| TenantPolicyPlugin        | Per-tenant config, limits, models         |
| RateLimitPlugin           | Quotas, rate limits                       |
| MemoryPlugin              | Conversation memory, user state           |
| VectorStorePlugin         | RAG retrieval, embeddings                |
| ModelPlugin               | LLM calls (chat, completion)              |
| MCPPlugin                 | MCP tool/server integration               |
| ToolPlugin                | Function calling, APIs, tools             |
| FilterPlugin              | Chunking, tokenization, input filtering   |
| GuardrailPlugin           | Safety, PII, policy checks                 |
| RefinementPlugin          | Output formatting, normalization         |
| EvaluationPlugin          | Score/measure model output (quality gates) |
| FeedbackPlugin            | Collect user feedback (training signal)   |
| LearningPlugin            | Incremental learning / model update       |
| DatasetBuildPlugin        | Build/curate dataset from feedback        |
| TrainTriggerPlugin        | Trigger training job (fine-tune, LoRA)   |
| ModelRegistryPlugin       | Register/promote trained model for serving |
| ConditionPlugin           | Group if/elseif/else: return output key `branch` (0=then, 1=elseif, …, n-1=else) |
| PromptBuilderPlugin       | Dynamic prompt assembly                   |
| ObservabilityPlugin       | Metrics, monitoring                        |
| TracingPlugin             | Distributed tracing                       |
| BillingPlugin             | Metering, cost allocation                 |
| FeatureFlagPlugin         | Feature toggles, A/B                      |
| AuditPlugin               | Compliance logging                        |
| SecurityScannerPlugin     | Prompt/output security checks             |
| CachingPlugin             | Response/embedding cache                  |
| SearchPlugin              | Keyword/hybrid/graph search               |
| LangChainAdapterPlugin    | LangChain integration                     |
| AgentOrchestratorPlugin   | Multi-agent or tool orchestration         |
| WorkflowExtensionPlugin   | Custom workflow behavior                  |
| CustomStagePlugin         | Arbitrary custom logic                     |

**Other possible plugins (see §5)** — implement as custom or new plugin types

| Plugin / concept            | Typical use case                                    |
|-----------------------------|-----------------------------------------------------|
| IteratorPlugin / BatchIteratorPlugin | Loop over items/batches; drive ITERATIVE_BLOCK      |
| PlannerPlugin / TaskDecompositionPlugin | LLM plan → PLAN_EXECUTOR; task decomposition        |
| SummarizationPlugin         | Summaries (reports, emails, tickets)                 |
| TranslationPlugin          | Multilingual content, localization                  |
| ClassificationPlugin        | Intent, topic, sentiment, routing                   |
| ExtractionPlugin            | NER, entities, structured extraction                |
| RouterPlugin / ValidationPlugin | Route by intent; validate input/output              |
| HumanInTheLoopPlugin        | Approval, review, moderation                         |
| NotificationPlugin          | Alerts, escalation, user notifications             |
| AnonymizationPlugin / RedactionPlugin | PII/PHI masking, safe output                        |
| EnrichmentPlugin / WebhookPlugin | External context, webhooks, event publish            |

---

## 7. Stage Result Envelope, Graph, Checkpointing, and Output Contract

### 7.1 Deterministic StageResult Envelope

Stage execution returns a standardized **StageResult**:

- **output** (canonical): `Map<String, Object>` stage output; **data** is deprecated but supported for backward compatibility.
- **metadata**: `StageMetadata` (stageName, stepId, executionId, stageBucketName) for replay and audit.
- **deterministic**: whether the result is replay-safe.
- **dependencies**: `List<DependencyRef>` (executionId, stepId, stageName) for DAG and provenance.

The kernel enriches results with metadata when not set by the handler.

### 7.2 Execution Graph (Future DAG Support)

Execution order is represented by an **ExecutionGraph**:

- **nodes**: `Map<String, CapabilityNode>` (id → node; node has id and capabilityBucketName).
- **edges**: `Map<String, List<String>>` (node id → successor ids).

**Backward compatibility**: when only `stageOrder` is set in config, a linear graph is built automatically (nodes in order, edges A→B→C). Plan building uses `getExecutionGraphEffective().topologicalOrder()` so a future DAG config will work without code change.

### 7.3 CheckpointableStage (Checkpoint API)

Stages can optionally implement **CheckpointableStage** (in addition to `StageHandler`):

- **supportsReplay()**: whether the stage supports deterministic replay from checkpoint.
- **resumeFrom(stepId, context)**: resume from the given step; returns `StageResult`.
- **branchFrom(stepId, context)**: create a branch from the given step; returns `StageResult`.

**ExecutionCommand** supports **resumeFromStepId** and **branchFromStepId**; the kernel can use these to drive resume/branch and call checkpointable stages accordingly.

### 7.4 OutputContract (Schema Contract Layer)

Stages can optionally declare **OutputContract**:

- **getSchema()**: schema for this stage’s output (e.g. JSON Schema as String or JsonNode).
- **enforceStrict()**: if true, validation failure leads to failure or retry; if false, invalid output may be logged but accepted.

An **OutputContractValidator** can be registered at bootstrap (`EngineRuntime.setOutputContractValidator`). When a stage implements `OutputContract` and a validator is set, the activity layer validates the stage output after execution; if validation fails and `enforceStrict()` is true, an **OutputContractViolationException** is thrown. This enables structured outputs and API-safe LLM responses.

---

## 8. Human Interaction Signal (Async Pause / Resume)

The kernel supports **suspend workflow** and **resume with external signal** for human review, manual override, and compliance gates.

- **ExecutionSignal**: `type` (e.g. `HUMAN_APPROVAL`, `MANUAL_OVERRIDE`, `COMPLIANCE_ACK`) and `payload`.
- **ExecutionContext**: `requestSuspendForSignal()` (stage calls this when it needs human input); `getResumeSignal()` / `setResumeSignal(ExecutionSignal)` (workflow sets after receiving signal).
- **KernelOrchestrator.execute** returns **KernelExecutionOutcome**: `completed` or `suspended` with `suspendedAtStepId`.
- **CoreWorkflow**: `@SignalMethod void receiveSignal(ExecutionSignal signal)`. Workflow awaits signal when outcome is suspended, then injects signal into context and continues kernel (re-run so the stage can read the signal and proceed).

---

## 9. Streaming-Aware Stage API

Stages can optionally implement **StreamingStageHandler** (extends `StageHandler`):

- **execute(context, StreamObserver observer)**: observer may be null (non-streaming). When non-null, implementations call `observer.onToken(String)`, `observer.onUpdate(type, payload)`, `observer.onComplete()` / `onError(Throwable)`.
- **StreamObserver**: receives partial tokens, intermediate updates, and tool streaming output so streaming becomes kernel-native. Default `execute(context)` delegates to `execute(context, null)`.

---

## 10. Agent Identity Layer (Durable Agents)

**AgentContext** provides durable agent identity so agents persist across sessions:

- **agentId**, **persona**, **AgentMemoryStore** (load/save state keyed by agentId).
- **ExecutionContext** references **AgentContext** via `getAgentContext()` / `setAgentContext()`.
- **ExecutionCommand** may set **agentId** and **persona** so the workflow can build and attach AgentContext when creating the execution context.

---

## 11. Determinism Policy Toggle

**DeterminismPolicy** (on **ExecutionCommand** / **ExecutionContext.getDeterminismPolicy()**):

- **freezeModelParams**: when true, kernel/callers should force temperature=0 and lock model params for replay.
- **persistToolOutputs**: when true, tool outputs are persisted and replayed as-is (no re-execution in replay).
- **persistRetrievalResults**: when true, retrieval results are persisted and replayed as-is.

**randomnessSeed** (optional on ExecutionCommand): when determinism is enabled, kernel/store can use this for reproducible randomness. **ContextSnapshot** carries **determinismPolicy** so replay can enforce it. Presets: `DeterminismPolicy.NONE` and `DeterminismPolicy.FULL`. This is key for enterprise audit and replay.

---

## 12. Stage Order (Reference)

Execution order of predefined stages (see also §7.2 Execution Graph):

`ACCESS` → … → `MODEL` → `RETRIEVAL` / **`RETRIEVE`** → … → `POST_PROCESS` → **`EVALUATION`** / **`EVALUATE`** → **`FEEDBACK`** / **`FEEDBACK_CAPTURE`** → **`LEARNING`** → **`DATASET_BUILD`** → **`TRAIN_TRIGGER`** → **`MODEL_REGISTRY`** → `OBSERVABILITY` → `CUSTOM`

Pipelines include only the stages they need; order is defined by `stageOrder` in config. A minimal learning-ready flow can use: **ACCESS** → **MEMORY** → **RETRIEVE** → **MODEL** → **EVALUATE** → **FEEDBACK_CAPTURE** → **DATASET_BUILD** → **TRAIN_TRIGGER** → **MODEL_REGISTRY**.

### 12.1 Learning and training stages (future-ready)

Stages reserved for **incremental learning** and **model learning**:

| Stage | Purpose | Future use |
|-------|---------|------------|
| **EVALUATION** / **EVALUATE** | Score or measure model output (quality, relevance). | Quality gates; trigger learning when score is below threshold. |
| **FEEDBACK** / **FEEDBACK_CAPTURE** | Collect user feedback (ratings, corrections). | Training signal for incremental learning. |
| **LEARNING** | Run incremental learning step. | Fine-tune, update embeddings, or train on new data. |
| **DATASET_BUILD** | Build or curate dataset from feedback/evaluations. | Training dataset preparation. |
| **TRAIN_TRIGGER** | Trigger training job when conditions are met. | Fine-tune, LoRA, or full training runs. |
| **MODEL_REGISTRY** | Register or promote a trained model for serving. | Model lifecycle, A/B, rollback. |

**RETRIEVE** is an alias for **RETRIEVAL** (same semantics). Plugins: implement the corresponding plugin types in `PluginTypes` (e.g. `EvaluationPlugin`, `FeedbackPlugin`, `LearningPlugin`, `DatasetBuildPlugin`, `TrainTriggerPlugin`, `ModelRegistryPlugin`). Stub implementations are provided so pipelines can include these stages today; replace with real implementations for evaluation loops and model learning.

---

## 13. Policy Engine, Budget Guardrail, Concurrency, Security, Plan Validation, Graph Export

### 13.1 Strong Policy Engine (POLICY_ENGINE)

Policy is **central** via **ExecutionPolicyResolver** instead of distributed across TenantPolicy, Guardrail, and RateLimit plugins:

- **Model selection** by tenant tier
- **Tool whitelist** per user
- **Budget cap**, **max token cap**, **max iteration cap** enforcement

Register a custom resolver at bootstrap (`EngineRuntime.setExecutionPolicyResolver`); default implementation applies no restrictions.

### 13.2 Budget / Cost Guardrail (BUDGET_GUARDRAIL)

**BudgetGuardrailEnforcer** and **ExecutionCaps** provide kernel-level execution caps:

- Stop execution when **cost > threshold**, **tokens > limit**, or **iterations > limit**
- Enforcer resolves caps per run; kernel checks after each stage when the feature is enabled

Register at bootstrap (`EngineRuntime.setBudgetGuardrailEnforcer`).

### 13.3 Concurrency Isolation (CONCURRENCY_ISOLATION)

**QueueTopologyConfig** in config supports queue topology design for scaling:

- **strategy**: `SINGLE`, `QUEUE_PER_STAGE`, `QUEUE_PER_TENANT`
- **stageToQueue**: stage name → task queue (isolate heavy models)
- **tenantToQueue**: tenant id → task queue (isolate high-cost tenants)

Use for queue-per-stage or queue-per-tenant isolation guidance and implementation.

### 13.4 Security Hardening (SECURITY_HARDENING)

**SecurityHardeningGate** interface covers:

- **Prompt injection defense** (before model stage)
- **Tool allowlist enforcement** (before tool stage)
- **Output content scanning** pre-persist (PII, toxicity, policy)
- **Context poisoning detection**

Register at bootstrap (`EngineRuntime.setSecurityHardeningGate`); call from stages or interceptors when the feature is enabled.

### 13.5 Plan Safety Validation (PLAN_SAFETY_VALIDATION)

**PlanValidator** validates dynamic plans from the PLANNER before PLAN_EXECUTOR runs them:

- **Allowed stages only** (no unauthorized stage injection)
- **Max depth** enforcement
- **No recursive infinite loops** (cycle detection)

When enabled, PLAN_EXECUTOR calls `EngineRuntime.getPlanValidator().validate(plan, context)` before executing. Register `PlanValidatorImpl` or custom validator at bootstrap with allowed stage list and max depth.

### 13.6 Visual Execution Graph Export (EXECUTION_GRAPH_EXPORT)

**ExecutionGraph** exports for UI and tooling:

- **toDot()**: Graphviz DOT format
- **toMermaid()**: Mermaid graph format
- **toJsonForUi()**: JSON structure (nodes + edges) for UI rendering

Use when EXECUTION_GRAPH_EXPORT is enabled to improve adoption and debugging.

---

**Quick reference:** See **Feature list (at a glance)** and **Use cases (at a glance)** at the top of this document. This list is derived from the current engine stages, plugin types, and pipeline examples in the codebase and can be extended as new stages and plugin types are added.
