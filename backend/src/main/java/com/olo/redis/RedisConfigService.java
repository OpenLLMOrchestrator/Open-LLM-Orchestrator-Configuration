package com.olo.redis;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

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
        }
    }

    public Optional<ConfigPayload> getByName(String name) {
        String key = keyPrefix + name;
        String raw = redisTemplate.opsForValue().get(key);
        if (raw == null) return Optional.empty();
        try {
            return Optional.of(objectMapper.readValue(raw, ConfigPayload.class));
        } catch (JsonProcessingException e) {
            log.warn("Failed to deserialize Redis config for {}", name, e);
            return Optional.empty();
        }
    }

    public void deleteByName(String name) {
        redisTemplate.delete(keyPrefix + name);
    }

    /**
     * List config names stored at olo:engine:config:* (e.g. default:1.0, temp:1.0).
     * Used for "Load saved configuration" dropdown.
     */
    @SuppressWarnings("unchecked")
    public List<String> listEngineConfigNames() {
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
    }

    /**
     * Get raw config value from olo:engine:config:{keySuffix}.
     * Returns the stored string (typically engine config JSON).
     */
    public Optional<String> getEngineConfig(String keySuffix) {
        String key = engineConfigKeyPrefix + keySuffix;
        String raw = redisTemplate.opsForValue().get(key);
        return Optional.ofNullable(raw);
    }

    /**
     * Store config at olo:engine:config:{name}. Used by "New" (save with user-provided name) and "Update".
     */
    public void upsertEngineConfig(String name, String configJson) {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Engine config name is required");
        String key = engineConfigKeyPrefix + name.trim();
        String value = configJson != null && !configJson.isBlank() ? configJson : "{}";
        redisTemplate.opsForValue().set(key, value);
        log.debug("Upserted engine config to Redis: {}", key);
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
        }
    }

    public Optional<InProgressPayload> getInProgress() {
        String raw = redisTemplate.opsForValue().get(INPROGRESS_KEY);
        if (raw == null) return Optional.empty();
        try {
            return Optional.of(objectMapper.readValue(raw, InProgressPayload.class));
        } catch (JsonProcessingException e) {
            log.warn("Failed to deserialize in-progress payload", e);
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
