package com.olo.component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
 * Loads UI components: flow from components/flows/*.json, control from components/control/*.json,
 * capabilities from components/capability/*.json, plugins from components/plugins/.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ComponentService {

    private static final String FLOWS_SUBDIR = "flows";
    private static final String CONTROL_SUBDIR = "control";
    private static final String CAPABILITY_SUBDIR = "capability";
    private static final String PLUGINS_SUBDIR = "plugins";

    private final ObjectMapper objectMapper;
    private final OloPluginLoader oloPluginLoader;

    @Value("${olo.components-dir:../components}")
    private String componentsDir;

    @Value("${olo.plugins-dir:../components/plugins}")
    private String pluginsDir;

    @Value("${olo.plugin-schemas-path:classpath:plugin-schemas/}")
    private String pluginSchemasPath;

    private final Map<String, JsonNode> componentSchemasById = new HashMap<>();
    private volatile Path resolvedCapabilityDir;

    @PostConstruct
    public void loadComponents() {
        Path base = Paths.get(System.getProperty("user.dir")).normalize();
        Path componentsPath = base.resolve(componentsDir).normalize();
        // If configured path does not exist (e.g. run from project root with ../components), try ./components
        if (!Files.isDirectory(componentsPath) && !"components".equals(componentsDir)) {
            Path fallback = base.resolve("components").normalize();
            if (Files.isDirectory(fallback)) {
                componentsPath = fallback;
                log.info("Using components fallback: {} (cwd: {})", componentsPath, base);
            }
        }
        resolvedCapabilityDir = componentsPath.resolve(CAPABILITY_SUBDIR).normalize();
        Path pluginsPath = base.resolve(pluginsDir).normalize();
        if (!Files.isDirectory(pluginsPath)) {
            Path insideComponents = componentsPath.resolve(PLUGINS_SUBDIR).normalize();
            if (Files.isDirectory(insideComponents)) {
                pluginsPath = insideComponents;
                log.info("Using plugins dir: {} (components/plugins)", pluginsPath);
            } else {
                Path fallback = base.resolve("plugins").normalize();
                if (Files.isDirectory(fallback)) {
                    pluginsPath = fallback;
                    log.info("Using plugins dir fallback (root plugins): {}", pluginsPath);
                } else {
                    Path backendRelative = base.resolve("backend").resolve(pluginsDir).normalize();
                    if (Files.isDirectory(backendRelative)) {
                        pluginsPath = backendRelative;
                        log.info("Using plugins dir fallback (backend relative): {}", pluginsPath);
                    }
                }
            }
        }
        log.info("Components dir: {}, Plugins dir: {} (cwd: {})", componentsPath, pluginsPath, base);
        Path flowsPath = componentsPath.resolve(FLOWS_SUBDIR).normalize();
        Path controlPath = componentsPath.resolve(CONTROL_SUBDIR).normalize();
        if (Files.isDirectory(flowsPath)) {
            loadFromDirectory(flowsPath, "component");
        } else {
            loadFromDirectory(componentsPath, "component");
        }
        if (Files.isDirectory(controlPath)) {
            loadFromDirectory(controlPath, "component");
        }
        loadFromCapabilityDir(componentsPath);
        loadFromDirectory(pluginsPath, "plugin");
        loadFromOloZip(pluginsPath);
        loadFromPluginYamlFiles(pluginsPath);
        loadFromClasspath();
        log.info("Loaded {} components/capabilities/plugins total", componentSchemasById.size());
    }

    /** Load capability definitions from components/capability/*.json (template-driven). */
    private void loadFromCapabilityDir(Path componentsPath) {
        Path capabilityDir = componentsPath.resolve(CAPABILITY_SUBDIR).normalize();
        if (!Files.isDirectory(capabilityDir)) {
            log.debug("Capability dir not found: {}", capabilityDir);
            return;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(capabilityDir, "*.json")) {
            for (Path p : stream) {
                if (!Files.isRegularFile(p)) continue;
                loadOne(p, "capability");
            }
        } catch (Exception e) {
            log.warn("Could not list capability dir {}: {}", capabilityDir, e.getMessage());
        }
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

    /**
     * Create a new capability template file in components/capability/{id}.json.
     * Id must be safe for filename (alphanumeric and underscore). Creates the capability dir if missing.
     */
    public ComponentSummary createCapability(String id, String name, String description) {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("Capability id is required");
        }
        String safeId = id.trim().toUpperCase().replaceAll("\\s+", "_");
        if (!safeId.matches("[A-Za-z0-9_]+")) {
            throw new IllegalArgumentException("Capability id must be alphanumeric or underscore");
        }
        Path capabilityDir = resolvedCapabilityDir;
        if (capabilityDir == null) {
            capabilityDir = Paths.get(System.getProperty("user.dir")).normalize().resolve(componentsDir).resolve(CAPABILITY_SUBDIR).normalize();
        }
        try {
            if (!Files.isDirectory(capabilityDir)) {
                Files.createDirectories(capabilityDir);
                log.info("Created capability dir: {}", capabilityDir);
            }
            Path file = capabilityDir.resolve(safeId + ".json");
            if (Files.exists(file)) {
                throw new IllegalArgumentException("Capability already exists: " + safeId);
            }
            String displayName = name != null && !name.isBlank() ? name.trim() : safeId;
            ObjectNode root = objectMapper.createObjectNode()
                    .put("id", safeId)
                    .put("name", displayName)
                    .put("description", description != null ? description.trim() : "")
                    .put("icon", "account_tree")
                    .put("type", "capability")
                    .put("category", "capability");
            // Template: Execution Mode, Completion mode (when Async), Label; plus plugins and groups
            ObjectNode properties = objectMapper.createObjectNode()
                    .put("type", "object");
            ObjectNode props = objectMapper.createObjectNode();
            ObjectNode executionModeNode = objectMapper.createObjectNode()
                    .put("type", "string")
                    .put("title", "Execution mode")
                    .set("enum", objectMapper.createArrayNode().add("SYNC").add("ASYNC"));
            executionModeNode.put("default", "SYNC");
            props.set("executionMode", executionModeNode);
            ObjectNode asyncCompletionNode = objectMapper.createObjectNode()
                    .put("type", "string")
                    .put("title", "Completion mode (when Async)")
                    .set("enum", objectMapper.createArrayNode().add("ALL").add("FIRST_SUCCESS").add("FIRST_FAILURE").add("ALL_SETTLED"));
            asyncCompletionNode.put("default", "ALL");
            props.set("asyncCompletionPolicy", asyncCompletionNode);
            ObjectNode asyncMergeNode = objectMapper.createObjectNode()
                    .put("type", "string")
                    .put("title", "Async merge policy")
                    .set("enum", objectMapper.createArrayNode().add("LAST_WINS").add("FIRST_WINS").add("PREFIX_BY_ACTIVITY"));
            asyncMergeNode.put("default", "LAST_WINS");
            props.set("asyncOutputMergePolicy", asyncMergeNode);
            props.set("label", objectMapper.createObjectNode()
                    .put("type", "string")
                    .put("title", "Label")
                    .put("default", displayName));
            props.set("plugins", objectMapper.createObjectNode()
                    .put("type", "array")
                    .put("title", "Plugins")
                    .put("description", "One or more plugins in this capability")
                    .put("minItems", 1)
                    .set("items", objectMapper.createObjectNode().put("type", "string").put("title", "Plugin ID")));
            props.set("groups", objectMapper.createObjectNode()
                    .put("type", "array")
                    .put("title", "Groups")
                    .put("description", "One or more groups in this capability")
                    .put("minItems", 1)
                    .set("items", objectMapper.createObjectNode().put("type", "object").put("title", "Group")));
            properties.set("properties", props);
            properties.set("required", objectMapper.createArrayNode().add("executionMode"));
            root.set("properties", properties);
            Files.writeString(file, objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(root));
            loadOne(file, "capability");
            log.info("Created capability template: {}", file);
            return ComponentSummary.builder()
                    .id(safeId)
                    .name(displayName)
                    .description(description != null ? description.trim() : null)
                    .icon("account_tree")
                    .type("capability")
                    .category("capability")
                    .build();
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to create capability {}: {}", safeId, e.getMessage());
            throw new RuntimeException("Failed to create capability: " + e.getMessage(), e);
        }
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
