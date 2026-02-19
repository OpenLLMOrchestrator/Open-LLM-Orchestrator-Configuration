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

import com.openllmorchestrator.worker.engine.config.redis.RedisConfig;
import redis.clients.jedis.Jedis;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Objects;

/**
 * Writes engine or queue configuration to a local JSON file or to Redis.
 * Clients build config with the builder API, then call {@link #writeToFile} or {@link #writeToRedis}.
 */
public final class EngineConfigWriter {

    private static final String REDIS_KEY_PREFIX = "olo:engine:config:";
    private static final String DEFAULT_VERSION = "1.0";

    private final EngineConfigMapper mapper;

    public EngineConfigWriter() {
        this(EngineConfigMapper.getInstance());
    }

    public EngineConfigWriter(EngineConfigMapper mapper) {
        this.mapper = Objects.requireNonNull(mapper, "mapper");
    }

    // --- Engine config: file ---

    /**
     * Serializes the engine config to JSON and writes it to the given path.
     * Creates parent directories if needed. Overwrites if the file exists.
     *
     * @param config engine config (e.g. built via {@link EngineFileConfig#builder()})
     * @param path   file path (e.g. {@code Paths.get("config/default.json")})
     */
    public void writeToFile(EngineFileConfig config, Path path) throws IOException {
        String json = mapper.toJson(config);
        writeJsonToFile(json, path);
    }

    /**
     * Writes raw JSON string to the given path. Use when you already have JSON (e.g. from {@link EngineConfigMapper#toJson(EngineFileConfig)}).
     */
    public void writeJsonToFile(String json, Path path) throws IOException {
        Path parent = path.getParent();
        if (parent != null && !Files.exists(parent)) {
            Files.createDirectories(parent);
        }
        Files.write(path, json.getBytes(StandardCharsets.UTF_8),
                StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
    }

    /**
     * Writes engine config JSON to the given output stream. Caller is responsible for closing the stream.
     */
    public void writeToStream(EngineFileConfig config, OutputStream out) throws IOException {
        mapper.getObjectMapper().writeValue(out, config);
    }

    // --- Engine config: Redis ---

    /**
     * Serializes the engine config to JSON and stores it in Redis.
     * Key format: {@code olo:engine:config:<configKey>:<version>}. Version is taken from {@code config.getConfigVersion()} or "1.0".
     *
     * @param config    engine config to write
     * @param redis     Redis connection (host, port, password)
     * @param configKey key suffix (e.g. "default"); full key will be {@code olo:engine:config:default:1.0}
     */
    public void writeToRedis(EngineFileConfig config, RedisConfig redis, String configKey) throws IOException {
        String json = mapper.toJson(config);
        String version = config.getConfigVersion() != null && !config.getConfigVersion().isBlank()
                ? config.getConfigVersion()
                : DEFAULT_VERSION;
        String key = REDIS_KEY_PREFIX + (configKey != null && !configKey.isBlank() ? configKey : "default") + ":" + version;
        try (Jedis jedis = new Jedis(redis.getHost(), redis.getPort())) {
            if (redis.getPassword() != null && !redis.getPassword().isBlank()) {
                jedis.auth(redis.getPassword());
            }
            jedis.set(key, json);
        }
    }

    /**
     * Writes raw engine config JSON to Redis under the given key and version.
     */
    public void writeJsonToRedis(String configJson, RedisConfig redis, String configKey, String version) throws IOException {
        String v = version != null && !version.isBlank() ? version : DEFAULT_VERSION;
        String key = REDIS_KEY_PREFIX + (configKey != null && !configKey.isBlank() ? configKey : "default") + ":" + v;
        try (Jedis jedis = new Jedis(redis.getHost(), redis.getPort())) {
            if (redis.getPassword() != null && !redis.getPassword().isBlank()) {
                jedis.auth(redis.getPassword());
            }
            jedis.set(key, configJson);
        }
    }

    // --- Queue config: file ---

    /**
     * Serializes the queue config to JSON and writes it to the given path.
     */
    public void writeToFile(QueueConfig config, Path path) throws IOException {
        String json = mapper.toJson(config);
        writeJsonToFile(json, path);
    }

    // --- Queue config: Redis ---

    /**
     * Serializes the queue config and stores it in Redis under key {@code queue:config:<queueName>}.
     */
    public void writeToRedis(QueueConfig config, RedisConfig redis) throws IOException {
        String json = mapper.toJson(config);
        String key = "queue:config:" + (config.getQueueName() != null ? config.getQueueName() : "default");
        try (Jedis jedis = new Jedis(redis.getHost(), redis.getPort())) {
            if (redis.getPassword() != null && !redis.getPassword().isBlank()) {
                jedis.auth(redis.getPassword());
            }
            jedis.set(key, json);
        }
    }
}
