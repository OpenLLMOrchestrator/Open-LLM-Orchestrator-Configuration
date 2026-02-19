/*
 * Copyright 2026 Open LLM Orchestrator contributors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use it except in compliance with the License.
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

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.Collections;
import java.util.List;

/**
 * One elseif branch for root-by-capability (NodeConfig) conditional group: condition plugin + then children (GROUP/PLUGIN nodes).
 */
@Getter
@Setter
@NoArgsConstructor
public class ElseIfBranchNodeConfig {
    /** Plugin name (activity id) that evaluates this branch; must write output key {@code branch}. */
    private String condition;
    /** Child nodes (GROUP or PLUGIN) to run when this branch is selected. */
    private List<NodeConfig> then;
    /** "Then" branch as a single GROUP node (preferred when set). Condition has group as children. */
    private NodeConfig thenGroup;

    public List<NodeConfig> getThenSafe() {
        return then != null ? then : Collections.emptyList();
    }

    public boolean hasThenGroup() {
        return thenGroup != null;
    }
}
