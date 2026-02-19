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
package com.openllmorchestrator.worker.engine.config.activity;

import lombok.Getter;
import lombok.Setter;

/**
 * Limits for activity input/result payload size so Temporal history (DB/Elastic) stays minimal.
 * When set, prefer storing large blobs externally and passing references in context.
 */
@Getter
@Setter
public class ActivityPayloadConfig {
    /**
     * Max keys to pass in accumulatedOutput/input maps to activities (0 = no limit).
     * When exceeded, implementation may truncate or fail; keep small to reduce history size.
     */
    private int maxAccumulatedOutputKeys = 0;
    /**
     * Max keys in stage result output returned from activity (0 = no limit).
     */
    private int maxResultOutputKeys = 0;
}
