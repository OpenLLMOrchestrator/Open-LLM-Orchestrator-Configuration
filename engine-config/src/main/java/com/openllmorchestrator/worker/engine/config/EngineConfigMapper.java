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

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.Reader;

/**
 * Central serialization and deserialization for engine and queue configuration.
 * Use this in the worker to read/write config and in any tool that produces config JSON
 * consumed by the worker (e.g. CLI, dashboard, config service).
 * Serialization omits null, empty string, empty collection, and empty map so they are not written to config file or Redis.
 */
public final class EngineConfigMapper {

    private static final EngineConfigMapper INSTANCE = new EngineConfigMapper();

    private final ObjectMapper objectMapper;

    public EngineConfigMapper() {
        this.objectMapper = new ObjectMapper();
        this.objectMapper.setSerializationInclusion(JsonInclude.Include.NON_EMPTY);
    }

    /** Shared mapper instance with default configuration. */
    public static EngineConfigMapper getInstance() {
        return INSTANCE;
    }

    /** The underlying ObjectMapper (e.g. for custom type handling). */
    public ObjectMapper getObjectMapper() {
        return objectMapper;
    }

    // --- EngineFileConfig ---

    public String toJson(EngineFileConfig config) throws IOException {
        return objectMapper.writeValueAsString(config);
    }

    public byte[] toJsonBytes(EngineFileConfig config) throws IOException {
        return objectMapper.writeValueAsBytes(config);
    }

    public EngineFileConfig fromJson(String json) throws IOException {
        return objectMapper.readValue(json, EngineFileConfig.class);
    }

    public EngineFileConfig fromJson(byte[] json) throws IOException {
        return objectMapper.readValue(json, EngineFileConfig.class);
    }

    public EngineFileConfig fromJson(InputStream in) throws IOException {
        return objectMapper.readValue(in, EngineFileConfig.class);
    }

    public EngineFileConfig fromJson(Reader reader) throws IOException {
        return objectMapper.readValue(reader, EngineFileConfig.class);
    }

    // --- QueueConfig ---

    public String toJson(QueueConfig config) throws IOException {
        return objectMapper.writeValueAsString(config);
    }

    public QueueConfig queueConfigFromJson(String json) throws IOException {
        return objectMapper.readValue(json, QueueConfig.class);
    }

    public QueueConfig queueConfigFromJson(InputStream in) throws IOException {
        return objectMapper.readValue(in, QueueConfig.class);
    }

    // --- JsonNode (for version extraction, etc.) ---

    public JsonNode readTree(String json) throws IOException {
        return objectMapper.readTree(json);
    }

    public JsonNode readTree(byte[] json) throws IOException {
        return objectMapper.readTree(json);
    }
}
