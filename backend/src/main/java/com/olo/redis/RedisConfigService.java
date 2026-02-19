package com.olo.redis;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.openllmorchestrator.worker.engine.config.EngineConfigMapper;
import com.openllmorchestrator.worker.engine.config.EngineFileConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
@Slf4j
public class RedisConfigService {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    private static final EngineConfigMapper ENGINE_CONFIG_MAPPER = EngineConfigMapper.getInstance();

    @Value("${olo.redis.config-key-prefix:olo:config:}")
    private String keyPrefix;

    @Value("${olo.redis.engine-config-key-prefix:olo:engine:config:}")
    private String engineConfigKeyPrefix;

    private static final long TTL_DAYS = 30;

    public void upsertByName(String name, String configJson, String canvasJson) {
        String key = keyPrefix + name;
        try {
            String payload = objectMapper.writeValueAsString(new ConfigPayload(configJson, canvasJson));
            redisTemplate.opsForValue().set(key, payload, TTL_DAYS, TimeUnit.DAYS);
            log.debug("Upserted config to Redis: {}", name);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize config for Redis", e);
        } catch (Exception e) {
            log.warn("Redis unavailable when upserting config {}: {}", name, e.getMessage());
            throw new RuntimeException("Redis unavailable", e);
        }
    }

    public Optional<ConfigPayload> getByName(String name) {
        try {
            String key = keyPrefix + name;
            String raw = redisTemplate.opsForValue().get(key);
            if (raw == null) return Optional.empty();
            return Optional.of(objectMapper.readValue(raw, ConfigPayload.class));
        } catch (JsonProcessingException e) {
            log.warn("Failed to deserialize Redis config for {}", name, e);
            return Optional.empty();
        } catch (Exception e) {
            log.warn("Redis unavailable when getting config {}: {}", name, e.getMessage());
            return Optional.empty();
        }
    }

    public void deleteByName(String name) {
        try {
            redisTemplate.delete(keyPrefix + name);
        } catch (Exception e) {
            log.warn("Redis unavailable when deleting config {}: {}", name, e.getMessage());
        }
    }

    /**
     * List config names stored at olo:engine:config:* (e.g. default:1.0, temp:1.0).
     * Used for "Load saved configuration" dropdown.
     * Returns empty list if Redis is unavailable.
     */
    @SuppressWarnings("unchecked")
    public List<String> listEngineConfigNames() {
        try {
            String pattern = engineConfigKeyPrefix + "*";
            Set<byte[]> keyBytes = redisTemplate.execute((RedisCallback<Set<byte[]>>) conn -> conn.keys(pattern.getBytes(StandardCharsets.UTF_8)));
            if (keyBytes == null || keyBytes.isEmpty()) return List.of();
            List<String> names = new ArrayList<>();
            int prefixLen = engineConfigKeyPrefix.length();
            for (byte[] key : keyBytes) {
                String keyStr = new String(key, StandardCharsets.UTF_8);
                if (keyStr.length() > prefixLen) {
                    names.add(keyStr.substring(prefixLen));
                }
            }
            names.sort(String::compareTo);
            return names;
        } catch (Exception e) {
            log.warn("Redis unavailable when listing engine config names, returning empty list: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * Get config from olo:engine:config:{keySuffix}. Returns the stored JSON as-is so it matches
     * export-to-file format (no then-clause or other round-trip additions).
     * Returns empty if Redis is unavailable.
     */
    public Optional<String> getEngineConfig(String keySuffix) {
        try {
            String key = engineConfigKeyPrefix + keySuffix;
            String raw = redisTemplate.opsForValue().get(key);
            if (raw == null || raw.isBlank()) return Optional.empty();
            return Optional.of(raw);
        } catch (Exception e) {
            log.warn("Redis unavailable when getting engine config {}: {}", keySuffix, e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Store config at olo:engine:config:{name}. Validates JSON via engine-config but stores
     * the exact payload from the client so Redis matches export-to-file format (no then-clause
     * or other round-trip additions).
     */
    public void upsertEngineConfig(String name, String configJson) {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Engine config name is required");
        String key = engineConfigKeyPrefix + name.trim();
        String raw = configJson != null && !configJson.isBlank() ? configJson : "{}";
        try {
            EngineFileConfig config = ENGINE_CONFIG_MAPPER.fromJson(raw);
            EngineFileConfig.applyDefaultGlobals(config);
            redisTemplate.opsForValue().set(key, raw);
            log.debug("Upserted engine config to Redis: {}", key);
        } catch (IOException e) {
            throw new IllegalArgumentException("Invalid engine config JSON: " + e.getMessage(), e);
        } catch (Exception e) {
            log.warn("Redis unavailable when upserting engine config {}: {}", name, e.getMessage());
            throw new RuntimeException("Redis unavailable", e);
        }
    }

    /** Fixed key for UI in-progress template (not under config prefix). */
    public static final String INPROGRESS_KEY = "olo:ui:inprogress-template";
    private static final long INPROGRESS_TTL_DAYS = 7;

    public void setInProgress(InProgressPayload payload) {
        try {
            String json = objectMapper.writeValueAsString(payload);
            redisTemplate.opsForValue().set(INPROGRESS_KEY, json, INPROGRESS_TTL_DAYS, TimeUnit.DAYS);
            log.debug("Persisted in-progress template to Redis");
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize in-progress payload", e);
        } catch (Exception e) {
            log.warn("Redis unavailable when saving in-progress template: {}", e.getMessage());
            throw new RuntimeException("Redis unavailable", e);
        }
    }

    public Optional<InProgressPayload> getInProgress() {
        try {
            String raw = redisTemplate.opsForValue().get(INPROGRESS_KEY);
            if (raw == null) return Optional.empty();
            return Optional.of(objectMapper.readValue(raw, InProgressPayload.class));
        } catch (JsonProcessingException e) {
            log.warn("Failed to deserialize in-progress payload", e);
            return Optional.empty();
        } catch (Exception e) {
            log.warn("Redis unavailable when getting in-progress template: {}", e.getMessage());
            return Optional.empty();
        }
    }

    public record ConfigPayload(String configJson, String canvasJson) {}

    /** Payload for UI in-progress template persisted in Redis. */
    public record InProgressPayload(
            String templateId,
            String configName,
            String canvasJson,
            String configJson,
            String selectedPipelineId
    ) {}
}
