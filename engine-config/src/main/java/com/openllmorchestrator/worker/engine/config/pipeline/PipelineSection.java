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

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;
import java.util.Map;

/** Pipeline section of engine config. Each pipeline has one root (one or more capabilities; each capability has one group). */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonDeserialize(using = PipelineSectionDeserializer.class)
public class PipelineSection {
    private int defaultTimeoutSeconds;
    /** Default for ASYNC groups: ALL | FIRST_SUCCESS | FIRST_FAILURE | ALL_SETTLED */
    private String defaultAsyncCompletionPolicy = "ALL";
    /** Max depth for nested GROUP recursion (default 5). Exceeding throws at plan build. */
    private int defaultMaxGroupDepth = 5;
    /** Default merge policy hook for ASYNC groups: type MERGE_POLICY, pluginType MergePolicy, name = activity/FQCN. */
    private MergePolicyConfig mergePolicy;
    /** Legacy: single root GROUP/STAGE tree. Used when capabilities and rootByCapability are null/empty. */
    private NodeConfig root;
    /** Optional: capability name → plugin id. When absent, engine-level capabilityPlugins are used. */
    private Map<String, String> capabilityPlugins;
    /**
     * Top-level flow: ordered list of capabilities. Each capability has groups; group children are activity names.
     * When non-null and non-empty, plan is built from this instead of root/rootByCapability.
     */
    private List<CapabilityBlockConfig> capabilities;
    /**
     * Capability name → GROUP config. Execution order follows engine capabilityOrder; only capabilities present here are included.
     * When non-null and non-empty, plan is built from this. Accepts key "root" or "rootByCapability" in JSON.
     */
    private Map<String, NodeConfig> rootByCapability;
}
