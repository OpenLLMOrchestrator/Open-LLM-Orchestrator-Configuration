package com.olo.web;

import com.olo.config.OloConfigDto;
import com.olo.config.OloConfigService;
import com.olo.redis.RedisConfigService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/configs")
@RequiredArgsConstructor
@CrossOrigin(origins = "*", maxAge = 3600)
public class OloConfigController {

    private final OloConfigService configService;
    private final RedisConfigService redisConfigService;

    @PostMapping
    public ResponseEntity<OloConfigDto> upsert(@Valid @RequestBody OloConfigDto dto) {
        return ResponseEntity.ok(configService.upsert(dto));
    }

    @GetMapping
    public List<OloConfigDto> list() {
        return configService.listAll();
    }

    @GetMapping("/{name}")
    public ResponseEntity<OloConfigDto> getByName(@PathVariable String name) {
        OloConfigDto config = configService.getByNameWithRedisFallback(name);
        return config != null ? ResponseEntity.ok(config) : ResponseEntity.notFound().build();
    }

    @DeleteMapping("/{name}")
    public ResponseEntity<Void> delete(@PathVariable String name) {
        configService.deleteByName(name);
        return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
    }

    /** Save current config to olo:engine:config:{name}. Used by "New" (name from dialog) and "Update". Path avoids conflict with GET /{name}. */
    @PostMapping("/engine/save")
    public ResponseEntity<EngineConfigUpsertRequest> upsertEngineConfig(@RequestBody EngineConfigUpsertRequest request) {
        if (request == null || request.getName() == null || request.getName().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        try {
            redisConfigService.upsertEngineConfig(request.getName().trim(), request.getConfigJson());
            return ResponseEntity.ok(request);
        } catch (Exception e) {
            log.error("Failed to upsert engine config: {}", request.getName(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /** Get current in-progress template from Redis (olo:ui:inprogress-template). */
    @GetMapping("/inprogress")
    public ResponseEntity<RedisConfigService.InProgressPayload> getInProgress() {
        return redisConfigService.getInProgress()
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.noContent().build());
    }

    /** Persist current in-progress template to Redis. */
    @PutMapping("/inprogress")
    public ResponseEntity<RedisConfigService.InProgressPayload> putInProgress(
            @RequestBody RedisConfigService.InProgressPayload payload) {
        redisConfigService.setInProgress(payload);
        return ResponseEntity.ok(payload);
    }
}
