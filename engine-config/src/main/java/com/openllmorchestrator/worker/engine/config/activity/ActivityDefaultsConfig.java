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

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Default activity options: timeouts, retry policy, payload limits for minimal Temporal history. */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ActivityDefaultsConfig {
    private ActivityTimeoutsConfig defaultTimeouts = new ActivityTimeoutsConfig();
    private RetryPolicyConfig retryPolicy = new RetryPolicyConfig();
    /** Optional payload limits so activity args/results stay small (Temporal records in DB/Elastic). */
    private ActivityPayloadConfig payload = new ActivityPayloadConfig();
}
