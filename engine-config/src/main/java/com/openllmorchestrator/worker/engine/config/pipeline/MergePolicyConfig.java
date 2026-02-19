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

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Merge policy hook: identifies the merge policy plugin (activity) to run before exiting an ASYNC group.
 * Use in pipeline or group config as: { "type": "MERGE_POLICY", "pluginType": "MergePolicy", "name": "com.example.plugin.RankedMerge" }
 * The "name" is the activity/plugin name (e.g. LAST_WINS, or FQCN) resolved at runtime.
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MergePolicyConfig {
    /** Should be "MERGE_POLICY". */
    private String type;
    /** Plugin type, e.g. "MergePolicy". */
    private String pluginType;
    /** Activity/plugin name or FQCN (e.g. "LAST_WINS", "com.example.plugin.RankedMerge"). */
    private String name;
}
