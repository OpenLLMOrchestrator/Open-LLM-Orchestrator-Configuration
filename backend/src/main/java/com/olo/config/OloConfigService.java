package com.olo.config;

import com.olo.redis.RedisConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class OloConfigService {

    private final OloConfigRepository configRepository;
    private final RedisConfigService redisConfigService;

    @Transactional
    public OloConfigDto upsert(OloConfigDto dto) {
        OloConfigEntity entity = configRepository.findByName(dto.getName())
                .map(existing -> {
                    existing.setDescription(dto.getDescription());
                    existing.setTemplateId(dto.getTemplateId());
                    existing.setCanvasJson(dto.getCanvasJson());
                    existing.setConfigJson(dto.getConfigJson());
                    return existing;
                })
                .orElse(OloConfigEntity.builder()
                        .name(dto.getName())
                        .description(dto.getDescription())
                        .templateId(dto.getTemplateId())
                        .canvasJson(dto.getCanvasJson())
                        .configJson(dto.getConfigJson())
                        .build());
        entity = configRepository.save(entity);
        redisConfigService.upsertByName(entity.getName(), entity.getConfigJson(), entity.getCanvasJson());
        return toDto(entity);
    }

    public List<OloConfigDto> listAll() {
        return configRepository.findAll().stream().map(this::toDto).collect(Collectors.toList());
    }

    public OloConfigDto getByName(String name) {
        return configRepository.findByName(name).map(this::toDto).orElse(null);
    }

    public OloConfigDto getByNameWithRedisFallback(String name) {
        OloConfigDto fromDb = getByName(name);
        if (fromDb != null) return fromDb;
        return redisConfigService.getByName(name)
                .map(p -> OloConfigDto.builder()
                        .name(name)
                        .configJson(p.configJson())
                        .canvasJson(p.canvasJson())
                        .build())
                .orElse(null);
    }

    @Transactional
    public void deleteByName(String name) {
        configRepository.findByName(name).ifPresent(configRepository::delete);
        redisConfigService.deleteByName(name);
    }

    private OloConfigDto toDto(OloConfigEntity e) {
        return OloConfigDto.builder()
                .id(e.getId())
                .name(e.getName())
                .description(e.getDescription())
                .templateId(e.getTemplateId())
                .canvasJson(e.getCanvasJson())
                .configJson(e.getConfigJson())
                .createdAt(e.getCreatedAt())
                .updatedAt(e.getUpdatedAt())
                .build();
    }
}
