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
 * User-defined capability: a named reference to a plugin that can be used anywhere in the capability flow.
 * Predefined capabilities (e.g. ACCESS, MODEL) have a fixed flow order; custom capabilities defined here
 * can be invoked at any point in the flow by name.
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CapabilityDef {
    /** Plugin type (e.g. ModelPlugin, AccessControlPlugin). Required. */
    private String pluginType;
    /** Activity/plugin id (FQCN or registered name). Required. */
    private String name;
}
