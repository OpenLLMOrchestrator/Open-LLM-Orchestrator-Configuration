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

import com.fasterxml.jackson.annotation.JsonAlias;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.Collections;
import java.util.List;

/**
 * Top-level capability in the pipeline flow. Each capability has one or more groups (sync/async, recursive).
 * Group children are activity names (plugin ids), each implemented by one CapabilityHandler.
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CapabilityBlockConfig {
    /** Capability name (e.g. ACCESS, MEMORY, MODEL). Accepts JSON key "capability" or "stage". */
    @JsonAlias("stage")
    private String capability;
    /** Groups within this capability; order preserved. */
    private List<GroupConfig> groups;

    public List<GroupConfig> getGroupsSafe() {
        return groups != null ? groups : Collections.emptyList();
    }
}
