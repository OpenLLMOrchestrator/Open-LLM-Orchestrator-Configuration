package com.olo.component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.olo.plugin.OloPluginLoader;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

/**
 * Loads UI component configs from components/ folder (Start, End, Group) and plugins from plugins/ folder.
 * Falls back to classpath for components and plugin-schemas if file paths are missing.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ComponentService {

    private final ObjectMapper objectMapper;
    private final OloPluginLoader oloPluginLoader;

    @Value("${olo.components-dir:../components}")
    private String componentsDir;

    @Value("${olo.plugins-dir:../plugins}")
    private String pluginsDir;

    @Value("${olo.plugin-schemas-path:classpath:plugin-schemas/}")
    private String pluginSchemasPath;

    private final Map<String, JsonNode> componentSchemasById = new HashMap<>();

    @PostConstruct
    public void loadComponents() {
        Path base = Paths.get(System.getProperty("user.dir")).normalize();
        Path pluginsPath = base.resolve(pluginsDir).normalize();
        if (!Files.isDirectory(pluginsPath)) {
            Path fallback = base.resolve("plugins").normalize();
            if (Files.isDirectory(fallback)) {
                pluginsPath = fallback;
                log.info("Using plugins dir fallback (plugins): {}", pluginsPath);
            } else {
                Path backendRelative = base.resolve("backend").resolve(pluginsDir).normalize();
                if (Files.isDirectory(backendRelative)) {
                    pluginsPath = backendRelative;
                    log.info("Using plugins dir fallback (backend/../plugins): {}", pluginsPath);
                }
            }
        }
        log.info("Plugins dir: {} (cwd: {})", pluginsPath, base);
        loadFromDirectory(base.resolve(componentsDir).normalize(), "component");
        loadFromDirectory(pluginsPath, "plugin");
        loadFromOloZip(pluginsPath);
        loadFromPluginYamlFiles(pluginsPath);
        loadFromClasspath();
        log.info("Loaded {} components/plugins total", componentSchemasById.size());
    }

    /** Load plugins from zip (and from plugin.yaml inside extracted dirs). */
    private void loadFromOloZip(Path pluginsPath) {
        Map<String, com.fasterxml.jackson.databind.JsonNode> fromZip = oloPluginLoader.loadFromZipDirectory(pluginsPath);
        for (Map.Entry<String, com.fasterxml.jackson.databind.JsonNode> e : fromZip.entrySet()) {
            if (!componentSchemasById.containsKey(e.getKey())) {
                componentSchemasById.put(e.getKey(), e.getValue());
            }
        }
    }

    /** Load plugins from plugin.yaml / plugin.yml in plugins dir and subdirs (extracted folder structure). */
    private void loadFromPluginYamlFiles(Path pluginsPath) {
        Map<String, com.fasterxml.jackson.databind.JsonNode> fromYaml = oloPluginLoader.loadFromPluginYamlInDirectory(pluginsPath);
        for (Map.Entry<String, com.fasterxml.jackson.databind.JsonNode> e : fromYaml.entrySet()) {
            if (!componentSchemasById.containsKey(e.getKey())) {
                componentSchemasById.put(e.getKey(), e.getValue());
            }
        }
    }

    private void loadFromDirectory(Path dir, String kind) {
        if (!Files.isDirectory(dir)) {
            log.debug("{} dir not found: {}", kind, dir);
            return;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir, "*.json")) {
            for (Path p : stream) {
                if (!Files.isRegularFile(p)) continue;
                loadOne(p, kind);
            }
        } catch (Exception e) {
            log.warn("Could not list {} dir {}: {}", kind, dir, e.getMessage());
        }
    }

    private void loadOne(Path p, String kind) {
        String id = p.getFileName().toString().replace(".json", "");
        try {
            String content = Files.readString(p);
            JsonNode root = objectMapper.readTree(content);
            componentSchemasById.put(id, root);
            log.info("Loaded {} schema: {}", kind, id);
        } catch (Exception e) {
            log.warn("Failed to load {} {}: {}", kind, p.getFileName(), e.getMessage());
        }
    }

    private void loadFromClasspath() {
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        String pattern = pluginSchemasPath.endsWith("/") ? pluginSchemasPath + "**/*.json" : pluginSchemasPath + "/**/*.json";
        try {
            Resource[] resources = resolver.getResources(pattern);
            for (Resource r : resources) {
                if (!r.isReadable()) continue;
                String filename = r.getFilename();
                if (filename == null) continue;
                String id = filename.replace(".json", "");
                if (componentSchemasById.containsKey(id)) continue;
                try (var is = r.getInputStream()) {
                    String content = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                    JsonNode root = objectMapper.readTree(content);
                    componentSchemasById.put(id, root);
                    log.info("Loaded plugin schema from classpath: {}", id);
                } catch (Exception e) {
                    log.warn("Failed to load plugin schema {}: {}", filename, e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("Could not scan classpath for plugin schemas: {}", e.getMessage());
        }
    }

    public List<ComponentSummary> listAll() {
        List<ComponentSummary> list = new ArrayList<>();
        for (Map.Entry<String, JsonNode> e : componentSchemasById.entrySet()) {
            JsonNode n = e.getValue();
            String type = n.has("type") ? n.get("type").asText() : "plugin";
            list.add(ComponentSummary.builder()
                    .id(e.getKey())
                    .name(n.has("name") ? n.get("name").asText() : e.getKey())
                    .description(n.has("description") ? n.get("description").asText() : null)
                    .icon(n.has("icon") ? n.get("icon").asText() : "extension")
                    .type(type)
                    .category(n.has("category") ? n.get("category").asText() : null)
                    .build());
        }
        list.sort(Comparator.comparing(ComponentSummary::getType).thenComparing(ComponentSummary::getName));
        return list;
    }

    public Optional<JsonNode> getSchema(String componentId) {
        return Optional.ofNullable(componentSchemasById.get(componentId));
    }

    @lombok.Data
    @lombok.Builder
    @lombok.NoArgsConstructor
    @lombok.AllArgsConstructor
    public static class ComponentSummary {
        private String id;
        private String name;
        private String description;
        private String icon;
        private String type;
        private String category;
    }
}
