/*
 * Copyright 2026 Open LLM Orchestrator contributors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.openllmorchestrator.worker.engine.config.pipeline;

import java.util.Set;

/**
 * Allowed values for PLUGIN node {@code pluginType}. Every PLUGIN (leaf) node must have one of these;
 * {@code name} is the class name to invoke (fully qualified class name).
 */
public final class AllowedPluginTypes {
    public static final String ACCESS_CONTROL = "AccessControlPlugin";
    public static final String TENANT_POLICY = "TenantPolicyPlugin";
    public static final String RATE_LIMIT = "RateLimitPlugin";
    public static final String MEMORY = "MemoryPlugin";
    public static final String VECTOR_STORE = "VectorStorePlugin";
    public static final String MODEL = "ModelPlugin";
    public static final String MCP = "MCPPlugin";
    public static final String TOOL = "ToolPlugin";
    public static final String FILTER = "FilterPlugin";
    public static final String GUARDRAIL = "GuardrailPlugin";
    public static final String REFINEMENT = "RefinementPlugin";
    public static final String PROMPT_BUILDER = "PromptBuilderPlugin";
    public static final String OBSERVABILITY = "ObservabilityPlugin";
    public static final String TRACING = "TracingPlugin";
    public static final String BILLING = "BillingPlugin";
    public static final String FEATURE_FLAG = "FeatureFlagPlugin";
    public static final String AUDIT = "AuditPlugin";
    public static final String SECURITY_SCANNER = "SecurityScannerPlugin";
    public static final String CACHING = "CachingPlugin";
    public static final String SEARCH = "SearchPlugin";
    public static final String LANG_CHAIN_ADAPTER = "LangChainAdapterPlugin";
    public static final String AGENT_ORCHESTRATOR = "AgentOrchestratorPlugin";
    public static final String WORKFLOW_EXTENSION = "WorkflowExtensionPlugin";
    public static final String CUSTOM_STAGE = "CustomStagePlugin";

    /** At most one per group. Makes the group conditional (if/else). */
    public static final String PLUGIN_IF = "ConditionPlugin";
    /** At most one per group. Makes the group iterative (loop over body). */
    public static final String PLUGIN_ITERATOR = "IteratorPlugin";
    /** ASYNC groups: one FORK (and one JOIN). If not set on group, engine uses default from config. */
    public static final String FORK = "ForkPlugin";
    /** ASYNC groups: one JOIN (and one FORK). If not set on group, engine uses default from config. */
    public static final String JOIN = "JoinPlugin";

    private static final Set<String> ALLOWED = Set.of(
            ACCESS_CONTROL,
            TENANT_POLICY,
            RATE_LIMIT,
            MEMORY,
            VECTOR_STORE,
            MODEL,
            MCP,
            TOOL,
            FILTER,
            GUARDRAIL,
            REFINEMENT,
            PROMPT_BUILDER,
            OBSERVABILITY,
            TRACING,
            BILLING,
            FEATURE_FLAG,
            AUDIT,
            SECURITY_SCANNER,
            CACHING,
            SEARCH,
            LANG_CHAIN_ADAPTER,
            AGENT_ORCHESTRATOR,
            WORKFLOW_EXTENSION,
            CUSTOM_STAGE,
            PLUGIN_IF,
            PLUGIN_ITERATOR,
            FORK,
            JOIN
    );

    private AllowedPluginTypes() {}

    public static boolean isAllowed(String pluginType) {
        return pluginType != null && ALLOWED.contains(pluginType);
    }

    public static Set<String> all() {
        return ALLOWED;
    }
}
