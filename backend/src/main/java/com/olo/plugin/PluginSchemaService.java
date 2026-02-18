package com.olo.plugin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class PluginSchemaService {

    private final ObjectMapper objectMapper;

    @org.springframework.beans.factory.annotation.Value("${olo.plugin-schemas-path:classpath:plugin-schemas/}")
    private String schemasPath;

    private final Map<String, JsonNode> schemasById = new HashMap<>();

    @PostConstruct
    public void loadSchemas() throws IOException {
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        String pattern = schemasPath.endsWith("/") ? schemasPath + "**/*.json" : schemasPath + "/**/*.json";
        Resource[] resources = resolver.getResources(pattern);
        for (Resource r : resources) {
            if (!r.isReadable()) continue;
            String filename = r.getFilename();
            if (filename == null) continue;
            try (InputStream is = r.getInputStream()) {
                String content = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                JsonNode root = objectMapper.readTree(content);
                String id = root.has("id") ? root.get("id").asText() : filename.replace(".json", "");
                schemasById.put(id, root);
                log.info("Loaded plugin schema: {}", id);
            } catch (Exception e) {
                log.warn("Failed to load plugin schema {}: {}", filename, e.getMessage());
            }
        }
    }

    public List<PluginSchemaSummary> listPlugins() {
        List<PluginSchemaSummary> list = new ArrayList<>();
        for (Map.Entry<String, JsonNode> e : schemasById.entrySet()) {
            JsonNode n = e.getValue();
            list.add(PluginSchemaSummary.builder()
                    .id(e.getKey())
                    .name(n.has("name") ? n.get("name").asText() : e.getKey())
                    .description(n.has("description") ? n.get("description").asText() : null)
                    .icon(n.has("icon") ? n.get("icon").asText() : "extension")
                    .build());
        }
        list.sort(Comparator.comparing(PluginSchemaSummary::getName));
        return list;
    }

    public Optional<JsonNode> getSchema(String pluginId) {
        return Optional.ofNullable(schemasById.get(pluginId));
    }

    @lombok.Data
    @lombok.Builder
    @lombok.NoArgsConstructor
    @lombok.AllArgsConstructor
    public static class PluginSchemaSummary {
        private String id;
        private String name;
        private String description;
        private String icon;
    }
}
