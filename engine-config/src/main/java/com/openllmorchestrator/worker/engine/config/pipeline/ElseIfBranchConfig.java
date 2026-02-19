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
 * One elseif branch: condition plugin name + then children (activity names or nested groups).
 * Used in group-level if/elseif/else when {@link GroupConfig#getCondition()} is set.
 */
@Getter
@Setter
@NoArgsConstructor
public class ElseIfBranchConfig {
    /** Plugin name (activity id) that evaluates this branch; must write output key {@code branch} (see ConditionPlugin contract). */
    private String condition;
    /** Children to run when this branch is selected: strings (activity names) or maps (nested GroupConfig). */
    private List<Object> then;
    /** "Then" branch as a single GROUP (preferred when set). Deserialized as Map → GroupConfig. */
    private Object thenGroup;

    public List<Object> getThenSafe() {
        return then != null ? then : Collections.emptyList();
    }

    public boolean hasThenGroup() {
        return thenGroup != null;
    }
}
