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
package com.openllmorchestrator.worker.engine.config;

import com.openllmorchestrator.worker.engine.config.pipeline.CapabilityBlockConfig;
import com.openllmorchestrator.worker.engine.config.pipeline.GroupConfig;
import com.openllmorchestrator.worker.engine.config.pipeline.NodeConfig;
import com.openllmorchestrator.worker.engine.config.pipeline.PipelineSection;

import java.util.List;
import java.util.Map;

/**
 * Fluent entry point for building engine config class hierarchies.
 * Use the Lombok-generated builders on each type; this class provides shortcuts and common patterns.
 * <p>
 * Example: build a minimal engine config and write to file or Redis:
 * <pre>{@code
 * EngineFileConfig config = EngineConfigBuilders.engineConfig()
 *     .configVersion("1.0")
 *     .capabilityOrder(List.of("ACCESS", "MODEL", "TOOL"))
 *     .pipelines(Map.of("default", EngineConfigBuilders.pipeline()
 *         .defaultTimeoutSeconds(60)
 *         .rootByCapability(Map.of(
 *             "ACCESS", NodeConfig.builder().type("GROUP").executionMode("SYNC").children(List.of()).build(),
 *             "MODEL", NodeConfig.builder().type("PLUGIN").name("my-llm").pluginType("ModelPlugin").build(),
 *             "TOOL", NodeConfig.builder().type("PLUGIN").name("my-tool").pluginType("ToolPlugin").build()))
 *         .build()))
 *     .build();
 *
 * EngineConfigWriter writer = new EngineConfigWriter();
 * writer.writeToFile(config, Paths.get("config/default.json"));
 * writer.writeToRedis(config, RedisConfig.builder().host("localhost").port(6379).password("").build(), "default");
 * }</pre>
 */
public final class EngineConfigBuilders {

    private EngineConfigBuilders() {}

    /** Starts building an {@link EngineFileConfig}. */
    public static EngineFileConfig.EngineFileConfigBuilder engineConfig() {
        return EngineFileConfig.builder();
    }

    /** Starts building a {@link PipelineSection}. */
    public static PipelineSection.PipelineSectionBuilder pipeline() {
        return PipelineSection.builder();
    }

    /** Starts building a {@link NodeConfig} (GROUP or PLUGIN node). */
    public static NodeConfig.NodeConfigBuilder node() {
        return NodeConfig.builder();
    }

    /** Starts building a GROUP node with common defaults. */
    public static NodeConfig.NodeConfigBuilder groupNode(String executionMode, List<NodeConfig> children) {
        return NodeConfig.builder()
                .type("GROUP")
                .executionMode(executionMode != null ? executionMode : "SYNC")
                .children(children);
    }

    /** Starts building a PLUGIN (leaf) node. */
    public static NodeConfig.NodeConfigBuilder pluginNode(String name, String pluginType) {
        return NodeConfig.builder()
                .type("PLUGIN")
                .name(name)
                .pluginType(pluginType);
    }

    /** Starts building a {@link GroupConfig} (for capability-block style pipelines). */
    public static GroupConfig.GroupConfigBuilder group() {
        return GroupConfig.builder();
    }

    /** Starts building a {@link CapabilityBlockConfig} (one capability with its groups). */
    public static CapabilityBlockConfig.CapabilityBlockConfigBuilder capabilityBlock(String capabilityName, List<GroupConfig> groups) {
        return CapabilityBlockConfig.builder()
                .capability(capabilityName)
                .groups(groups);
    }

    /** Starts building a {@link QueueConfig}. */
    public static QueueConfig.QueueConfigBuilder queueConfig() {
        return QueueConfig.builder();
    }
}
