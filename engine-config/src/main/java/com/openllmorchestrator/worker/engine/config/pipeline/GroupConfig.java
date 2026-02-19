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

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.Collections;
import java.util.List;

/**
 * A group within a stage: sync or async execution, with recursive nesting.
 * Children are activity names (plugin ids) or nested GroupConfigs.
 * Optional if/elseif/else: set {@link #condition} to a plugin name; then use {@link #thenChildren}, {@link #elseifBranches}, {@link #elseChildren}.
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GroupConfig {
    /** SYNC or ASYNC */
    private String executionMode;
    /** For ASYNC: ALL | FIRST_SUCCESS | FIRST_FAILURE | ALL_SETTLED */
    private String asyncCompletionPolicy;
    /** For ASYNC: output key overwrite policy (name from merge policy registry). Legacy; prefer mergePolicy hook. */
    private String asyncOutputMergePolicy;
    /** For ASYNC: merge policy hook { "type": "MERGE_POLICY", "pluginType": "MergePolicy", "name": "..." }. */
    private MergePolicyConfig mergePolicy;
    /** Max recursion depth for nested groups (overrides pipeline defaultMaxGroupDepth). */
    private Integer maxDepth;
    private Integer timeoutSeconds;
    /**
     * Children: each element is either a String (activity/plugin name) or a Map (nested group).
     * Use {@link #getChildrenAsList()} and interpret per element.
     * When {@link #condition} is set, this is the "then" branch if {@link #thenChildren} is null.
     */
    private List<Object> children;
    /** If set, this group is conditional: run condition plugin (PLUGIN_IF) first, then one of then/elseif/else. At most one PLUGIN_IF per group. */
    private String condition;
    /** If set, this group is iterative: run iterator plugin (PLUGIN_ITERATOR) to drive loop. At most one PLUGIN_ITERATOR per group. */
    private String iterator;
    /** For ASYNC: plugin name for FORK. If not set, engine uses default from engine configuration. */
    private String forkPlugin;
    /** For ASYNC: plugin name for JOIN. If not set, engine uses default from engine configuration. */
    private String joinPlugin;
    /** "Then" branch children when condition is set. If null, {@link #children} is used as then. */
    private List<Object> thenChildren;
    /** "Then" branch as a single GROUP (preferred when set). Deserialized as Map → GroupConfig. */
    private Object thenGroup;
    /** Elseif branches: each has condition plugin name and then children or thenGroup. Evaluated in order; first truthy branch runs. */
    private List<ElseIfBranchConfig> elseifBranches;
    /** "Else" branch children when condition is set. */
    private List<Object> elseChildren;
    /** "Else" branch as a single GROUP (preferred when set). Deserialized as Map → GroupConfig. */
    private Object elseGroup;

    public List<Object> getChildrenAsList() {
        return children != null ? children : Collections.emptyList();
    }

    @JsonIgnore
    public List<Object> getThenChildrenSafe() {
        return thenChildren != null ? thenChildren : getChildrenAsList();
    }

    @JsonIgnore
    public List<ElseIfBranchConfig> getElseifBranchesSafe() {
        return elseifBranches != null ? elseifBranches : Collections.emptyList();
    }

    @JsonIgnore
    public List<Object> getElseChildrenSafe() {
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

    /** True if this group has an iterator plugin (PLUGIN_ITERATOR). */
    public boolean isIterative() {
        return iterator != null && !iterator.isBlank();
    }

    public boolean isAsync() {
        return "ASYNC".equalsIgnoreCase(executionMode);
    }

    public boolean isSync() {
        return "SYNC".equalsIgnoreCase(executionMode);
    }
}
