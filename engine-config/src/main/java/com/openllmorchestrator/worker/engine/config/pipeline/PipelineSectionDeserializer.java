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

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Deserializes pipeline section. The "root" key is polymorphic:
 * - If root is an object with "type" (e.g. GROUP), it is a single root tree (legacy) → set root.
 * - Otherwise root is an object with capability names as keys and GROUP configs as values → set rootByCapability.
 */
public final class PipelineSectionDeserializer extends JsonDeserializer<PipelineSection> {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public PipelineSection deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
        JsonNode node = p.getCodec().readTree(p);
        PipelineSection section = new PipelineSection();

        if (node.has("defaultTimeoutSeconds")) {
            section.setDefaultTimeoutSeconds(node.get("defaultTimeoutSeconds").asInt());
        }
        if (node.has("defaultAsyncCompletionPolicy")) {
            section.setDefaultAsyncCompletionPolicy(node.get("defaultAsyncCompletionPolicy").asText());
        }
        if (node.has("defaultMaxGroupDepth")) {
            section.setDefaultMaxGroupDepth(node.get("defaultMaxGroupDepth").asInt());
        }
        if (node.has("mergePolicy")) {
            section.setMergePolicy(MAPPER.treeToValue(node.get("mergePolicy"), MergePolicyConfig.class));
        }
        if (node.has("capabilityPlugins")) {
            section.setCapabilityPlugins(MAPPER.convertValue(node.get("capabilityPlugins"), new TypeReference<Map<String, String>>() {}));
        } else if (node.has("stagePlugins")) {
            section.setCapabilityPlugins(MAPPER.convertValue(node.get("stagePlugins"), new TypeReference<Map<String, String>>() {}));
        }
        if (node.has("capabilities")) {
            section.setCapabilities(MAPPER.convertValue(node.get("capabilities"), new TypeReference<List<CapabilityBlockConfig>>() {}));
        } else if (node.has("stages")) {
            section.setCapabilities(MAPPER.convertValue(node.get("stages"), new TypeReference<List<CapabilityBlockConfig>>() {}));
        }
        if (node.has("root")) {
            JsonNode rootNode = node.get("root");
            if (rootNode.isObject() && rootNode.has("type")) {
                section.setRoot(MAPPER.treeToValue(rootNode, NodeConfig.class));
            } else if (rootNode.isObject()) {
                section.setRootByCapability(MAPPER.convertValue(rootNode, new TypeReference<Map<String, NodeConfig>>() {}));
            }
        }
        if (node.has("rootByCapability")) {
            JsonNode rootNode = node.get("rootByCapability");
            if (rootNode.isObject()) {
                section.setRootByCapability(MAPPER.convertValue(rootNode, new TypeReference<Map<String, NodeConfig>>() {}));
            }
        } else if (node.has("rootByStage")) {
            JsonNode rootNode = node.get("rootByStage");
            if (rootNode.isObject()) {
                section.setRootByCapability(MAPPER.convertValue(rootNode, new TypeReference<Map<String, NodeConfig>>() {}));
            }
        }

        return section;
    }
}
