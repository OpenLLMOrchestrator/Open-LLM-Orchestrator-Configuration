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

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.openllmorchestrator.worker.engine.config.activity.RetryPolicyConfig;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.Collections;
import java.util.List;

/** A node in the pipeline tree: GROUP or PLUGIN (leaf). STAGE is accepted as legacy alias for PLUGIN. */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class NodeConfig {
    /** One of: GROUP, PLUGIN. Legacy: STAGE (treated as PLUGIN). */
    private String type;
    /** For PLUGIN: class name to call (fully qualified class name, e.g. com.example.plugin.AccessControlPluginImpl). Required. */
    private String name;
    /** For PLUGIN: one of the allowed plugin types (e.g. AccessControlPlugin, MemoryPlugin). Required. */
    private String pluginType;
    private String executionMode;
    private Integer timeoutSeconds;
    /** For GROUP ASYNC: override default policy (ALL | FIRST_SUCCESS | FIRST_FAILURE | ALL_SETTLED). */
    private String asyncCompletionPolicy;
    /** For GROUP ASYNC: output key overwrite policy (name from merge policy registry). Legacy; prefer mergePolicy hook. */
    private String asyncOutputMergePolicy;
    /** For GROUP ASYNC: merge policy hook { "type": "MERGE_POLICY", "pluginType": "MergePolicy", "name": "..." }. */
    private MergePolicyConfig mergePolicy;
    /** For GROUP: max recursion depth for nested groups (overrides pipeline defaultMaxGroupDepth). */
    private Integer maxDepth;
    /** For PLUGIN: optional activity timeout overrides (seconds). */
    private Integer scheduleToStartSeconds;
    private Integer scheduleToCloseSeconds;
    /** For PLUGIN: optional retry override. */
    private RetryPolicyConfig retryPolicy;
    private List<NodeConfig> children;
    /** If set, this GROUP is conditional: run condition plugin (PLUGIN_IF), then one of then/elseif/else. Plugin must write output key "branch" (0=then, 1=elseif, ..., n-1=else). At most one PLUGIN_IF per group. */
    private String condition;
    /** If set, this GROUP is iterative: run iterator plugin (PLUGIN_ITERATOR) to drive loop over body. At most one PLUGIN_ITERATOR per group. */
    private String iterator;
    /** For ASYNC groups: plugin name for FORK. If not set, engine uses default from engine configuration. */
    private String forkPlugin;
    /** For ASYNC groups: plugin name for JOIN. If not set, engine uses default from engine configuration. */
    private String joinPlugin;
    /** "Then" branch (GROUP only, when condition is set). If null, {@link #children} is used as then. */
    private List<NodeConfig> thenChildren;
    /** "Then" branch as a single GROUP node (preferred when set). Condition has group as children. */
    private NodeConfig thenGroup;
    /** Elseif branches (GROUP only). Each has condition plugin name and then children or thenGroup. */
    private List<ElseIfBranchNodeConfig> elseifBranches;
    /** "Else" branch (GROUP only). */
    private List<NodeConfig> elseChildren;
    /** "Else" branch as a single GROUP node (preferred when set). */
    private NodeConfig elseGroup;

    public List<NodeConfig> getChildren() {
        return children != null ? children : Collections.emptyList();
    }

    @JsonIgnore
    public List<NodeConfig> getThenChildrenSafe() {
        return thenChildren != null ? thenChildren : getChildren();
    }

    @JsonIgnore
    public List<ElseIfBranchNodeConfig> getElseifBranchesSafe() {
        return elseifBranches != null ? elseifBranches : Collections.emptyList();
    }

    @JsonIgnore
    public List<NodeConfig> getElseChildrenSafe() {
        return elseChildren != null ? elseChildren : Collections.emptyList();
    }

    /** When condition is set: prefer thenGroup (one GROUP) as then branch; else use thenChildren. */
    public boolean hasThenGroup() {
        return thenGroup != null;
    }

    /** When condition is set: prefer elseGroup (one GROUP) as else branch; else use elseChildren. */
    public boolean hasElseGroup() {
        return elseGroup != null;
    }

    public boolean isConditional() {
        return condition != null && !condition.isBlank();
    }

    /** True if this GROUP has an iterator plugin (PLUGIN_ITERATOR). */
    public boolean isIterative() {
        return iterator != null && !iterator.isBlank();
    }

    public boolean isGroup() {
        return "GROUP".equalsIgnoreCase(type);
    }

    /** True if this node is a leaf plugin (type PLUGIN or legacy STAGE). */
    public boolean isPlugin() {
        return "PLUGIN".equalsIgnoreCase(type) || "STAGE".equalsIgnoreCase(type);
    }

    /** @deprecated Use {@link #isPlugin()} instead. Returns true for PLUGIN or STAGE. */
    @Deprecated
    public boolean isStage() {
        return isPlugin();
    }
}
