package com.olo.redis;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
@Slf4j
public class RedisConfigService {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    @Value("${olo.redis.config-key-prefix:olo:config:}")
    private String keyPrefix;

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

    public record ConfigPayload(String configJson, String canvasJson) {}
}
