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

import java.util.Collections;
import java.util.List;

/** Activity retry policy from config. No hardcoded retries in engine. */
@Getter
@Setter
public class RetryPolicyConfig {
    private int maximumAttempts = 3;
    private int initialIntervalSeconds = 1;
    private double backoffCoefficient = 2.0;
    private int maximumIntervalSeconds = 60;
    private List<String> nonRetryableErrors;

    public List<String> getNonRetryableErrors() {
        return nonRetryableErrors != null ? nonRetryableErrors : Collections.emptyList();
    }
}
