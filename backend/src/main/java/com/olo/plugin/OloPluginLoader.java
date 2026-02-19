package com.olo.plugin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.yaml.snakeyaml.Yaml;

/**
 * Loads plugins from a zip in the plugins folder: zip contains multiple .olo files,
 * each .olo is a zip that can contain plugin definitions in plugin.yaml (YAML) or
 * plugin.json (JSON). YAML format: schemaVersion, plugins: [ { plugin: { id, name, description, category, inputs, outputs, icons } } ].
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class OloPluginLoader {

    private static final String[] METADATA_JSON_NAMES = { "plugin.json", "manifest.json", "metadata.json" };
    private static final String[] METADATA_YAML_NAMES = { "plugin.yaml", "plugin.yml" };
    private static final int MAX_ZIP_ENTRY_BYTES = 5 * 1024 * 1024; // 5 MB per entry

    private static final Map<String, String> CAPABILITY_TO_PLUGIN_TYPE = Map.ofEntries(
            Map.entry("MODEL", "ModelPlugin"),
            Map.entry("MEMORY", "MemoryPlugin"),
            Map.entry("CACHING", "CachingPlugin"),
            Map.entry("RETRIEVAL", "VectorStorePlugin"),
            Map.entry("VECTOR_STORE", "VectorStorePlugin"),
            Map.entry("TOOL", "ToolPlugin"),
            Map.entry("MCP", "MCPPlugin"),
            Map.entry("FILTER", "FilterPlugin"),
            Map.entry("REFINEMENT", "RefinementPlugin"),
            Map.entry("ACCESS", "AccessControlPlugin"),
            Map.entry("ACCESS_CONTROL", "AccessControlPlugin")
    );

    private final ObjectMapper objectMapper;
    private static final ObjectMapper yamlMapper = new ObjectMapper(new YAMLFactory());

    /**
     * Scan dir for *.zip; for each zip, find .olo entries or plugin.yaml; load all plugin definitions.
     * Returns map of pluginId -> metadata JSON (id, name, description, icon, type, properties).
     */
    public Map<String, JsonNode> loadFromZipDirectory(Path pluginsDir) {
        Map<String, JsonNode> out = new HashMap<>();
        if (!Files.isDirectory(pluginsDir)) return out;
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(pluginsDir, "*.zip")) {
            for (Path zipPath : stream) {
                if (!Files.isRegularFile(zipPath)) continue;
                try {
                    loadZip(zipPath, out);
                } catch (Exception e) {
                    log.warn("Failed to load plugin zip {}: {}", zipPath.getFileName(), e.getMessage());
                }
            }
        } catch (IOException e) {
            log.warn("Could not list zip files in {}: {}", pluginsDir, e.getMessage());
        }
        return out;
    }

    /**
     * Scan plugins dir (and subdirs) for plugin.yaml / plugin.yml files and load all definitions.
     * Use when plugins are in extracted folders (e.g. plugins/Open-LLM-Orchestrator-plugins-1.0.0/olo-plugin-llm-ollama-1.0.0/plugin.yaml).
     */
    public Map<String, JsonNode> loadFromPluginYamlInDirectory(Path pluginsDir) {
        Map<String, JsonNode> out = new HashMap<>();
        if (!Files.isDirectory(pluginsDir)) return out;
        try (Stream<Path> walk = Files.walk(pluginsDir, 10)) {
            walk.filter(p -> Files.isRegularFile(p))
                .filter(p -> {
                    String name = p.getFileName().toString().toLowerCase();
                    return "plugin.yaml".equals(name) || "plugin.yml".equals(name);
                })
                .forEach(p -> {
                    try {
                        String content = Files.readString(p);
                        String baseId = p.getParent() != null ? p.getParent().getFileName().toString() : "plugin";
                        String entryPath;
                        try {
                            entryPath = pluginsDir.relativize(p).toString().replace('\\', '/');
                        } catch (IllegalArgumentException e) {
                            entryPath = p.getFileName().toString();
                        }
                        log.info("Loading plugin YAML from file: {}", p);
                        loadFromYaml(content.getBytes(StandardCharsets.UTF_8), baseId, entryPath, out);
                    } catch (Exception e) {
                        log.warn("Failed to load plugin YAML from {}: {}", p, e.getMessage());
                    }
                });
        } catch (IOException e) {
            log.warn("Could not walk plugins dir {}: {}", pluginsDir, e.getMessage());
        }
        return out;
    }

    private void loadZip(Path zipPath, Map<String, JsonNode> out) throws IOException {
        try (InputStream fis = Files.newInputStream(zipPath);
             ZipInputStream zis = new ZipInputStream(fis)) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (entry.isDirectory()) continue;
                String name = entry.getName().replace('\\', '/');
                if (name.endsWith(".olo")) {
                    byte[] oloBytes = readEntry(zis, entry.getSize());
                    if (oloBytes != null) loadOlo(oloBytes, name, out);
                } else if (name.endsWith("plugin.yaml") || name.endsWith("plugin.yml")) {
                    byte[] yamlBytes = readEntry(zis, entry.getSize());
                    if (yamlBytes != null) {
                        String oloBaseId = baseIdFromPath(name);
                        loadFromYaml(yamlBytes, oloBaseId, name, out);
                    }
                }
                zis.closeEntry();
            }
        }
    }

    /** For zip entry like "pkg/plugin.yaml" or "a/b/plugin.yaml", return the folder name that contains the file (e.g. "pkg" or "b"). */
    private static String baseIdFromPath(String path) {
        int lastSlash = path.lastIndexOf('/');
        String dir = lastSlash >= 0 ? path.substring(0, lastSlash) : "";
        int dirSlash = dir.lastIndexOf('/');
        String segment = dirSlash >= 0 ? dir.substring(dirSlash + 1) : dir;
        return segment.isEmpty() ? "plugin" : segment;
    }

    /** Parse plugin.yaml content and add all plugin definitions to out (same as loadOlo does for YAML). */
    private void loadFromYaml(byte[] yamlBytes, String oloBaseId, String entryPath, Map<String, JsonNode> out) {
        try {
            String content = new String(yamlBytes, StandardCharsets.UTF_8);
            List<PluginDef> definitions = parsePluginYaml(content, entryPath);
            if (definitions.isEmpty()) {
                log.warn("No plugin definitions parsed from YAML (check format: plugins array with plugin.id/name): {}", entryPath);
                return;
            }
            for (PluginDef def : definitions) {
                String pluginId = uniquePluginId(oloBaseId, def, out);
                JsonNode withId = ensurePluginId(def.node, pluginId);
                out.put(pluginId, withId);
                log.info("Loaded plugin from YAML: {} (from {})", pluginId, entryPath);
            }
        } catch (Exception e) {
            log.warn("Failed to parse plugin YAML from {}: {}", entryPath, e.getMessage(), e);
        }
    }

    private byte[] readEntry(ZipInputStream zis, long size) throws IOException {
        int limit = size > 0 && size <= MAX_ZIP_ENTRY_BYTES ? (int) size : MAX_ZIP_ENTRY_BYTES;
        byte[] buf = new byte[8192];
        int total = 0;
        List<byte[]> chunks = new ArrayList<>();
        int n;
        while ((n = zis.read(buf, 0, Math.min(buf.length, limit - total))) != -1) {
            chunks.add(Arrays.copyOf(buf, n));
            total += n;
            if (total >= limit) break;
        }
        if (total == 0) return null;
        byte[] result = new byte[total];
        int off = 0;
        for (byte[] chunk : chunks) {
            System.arraycopy(chunk, 0, result, off, chunk.length);
            off += chunk.length;
        }
        return result;
    }

    /**
     * Derive a unique plugin id from the .olo entry path so each plugin is stored under its own "folder" (id).
     * - If entry is in a subfolder (e.g. "llm-ollama/plugin.olo"), use folder name as id.
     * - Else use .olo basename without extension (e.g. "olo-plugin-llm-ollama-1.0.0.olo" -> "olo-plugin-llm-ollama-1.0.0").
     */
    private static String pluginIdFromEntryPath(String oloEntryName) {
        String path = oloEntryName.replace('\\', '/').trim();
        if (path.contains("/")) {
            String folder = path.substring(0, path.indexOf('/'));
            if (!folder.isEmpty()) return folder;
        }
        String name = path.contains("/") ? path.substring(path.lastIndexOf('/') + 1) : path;
        if (name.endsWith(".olo")) name = name.substring(0, name.length() - 4);
        return name.isEmpty() ? "plugin" : name;
    }

    /** One plugin definition: path inside .olo, optional array index (-1 = single object), and the JSON node. */
    private static class PluginDef {
        final String entryPath;
        final int arrayIndex;
        final JsonNode node;

        PluginDef(String entryPath, int arrayIndex, JsonNode node) {
            this.entryPath = entryPath;
            this.arrayIndex = arrayIndex;
            this.node = node;
        }
    }

    private void loadOlo(byte[] oloBytes, String oloEntryName, Map<String, JsonNode> out) {
        String oloBaseId = pluginIdFromEntryPath(oloEntryName);
        List<PluginDef> definitions = new ArrayList<>();
        try (ZipInputStream oloZis = new ZipInputStream(new ByteArrayInputStream(oloBytes))) {
            ZipEntry inner;
            while ((inner = oloZis.getNextEntry()) != null) {
                if (inner.isDirectory()) continue;
                String entryPath = inner.getName().replace('\\', '/');
                String fileName = entryPath.contains("/") ? entryPath.substring(entryPath.lastIndexOf('/') + 1) : entryPath;
                boolean isJsonMeta = false;
                for (String meta : METADATA_JSON_NAMES) {
                    if (fileName.equalsIgnoreCase(meta)) { isJsonMeta = true; break; }
                }
                boolean isYamlMeta = false;
                for (String meta : METADATA_YAML_NAMES) {
                    if (fileName.equalsIgnoreCase(meta)) { isYamlMeta = true; break; }
                }
                boolean isJson = fileName.toLowerCase().endsWith(".json");
                boolean isYaml = fileName.toLowerCase().endsWith(".yaml") || fileName.toLowerCase().endsWith(".yml");
                if (!isJsonMeta && !isYamlMeta && !isJson && !isYaml) {
                    oloZis.closeEntry();
                    continue;
                }
                byte[] content = readEntry(oloZis, inner.getSize());
                if (content == null) { oloZis.closeEntry(); continue; }
                String raw = new String(content, StandardCharsets.UTF_8);
                oloZis.closeEntry();
                if (isYamlMeta || isYaml) {
                    try {
                        List<PluginDef> fromYaml = parsePluginYaml(raw, entryPath);
                        definitions.addAll(fromYaml);
                    } catch (Exception e) {
                        log.debug("Could not parse YAML from .olo entry {}: {}", entryPath, e.getMessage());
                    }
                } else {
                    try {
                        JsonNode root = objectMapper.readTree(raw);
                        if (root.isArray()) {
                            for (int i = 0; i < root.size(); i++) {
                                JsonNode el = root.get(i);
                                if (el != null && el.isObject()) definitions.add(new PluginDef(entryPath, i, el));
                            }
                        } else if (root.isObject()) {
                            definitions.add(new PluginDef(entryPath, -1, root));
                        }
                    } catch (Exception e) {
                        log.debug("Could not parse JSON from .olo entry {}: {}", entryPath, e.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to read .olo {}: {}", oloEntryName, e.getMessage());
            return;
        }
        for (PluginDef def : definitions) {
            String pluginId = uniquePluginId(oloBaseId, def, out);
            JsonNode withId = ensurePluginId(def.node, pluginId);
            out.put(pluginId, withId);
            log.info("Loaded plugin from .olo: {} (from {})", pluginId, def.entryPath);
        }
        if (definitions.isEmpty()) {
            log.debug("No plugin definitions found in .olo: {}", oloEntryName);
        }
    }

    /**
     * Parse plugin.yaml format: schemaVersion, plugins: [ { plugin: { id, name, description, category, inputs, outputs, icons } } ].
     * Also accepts items that are the plugin object directly (have "id" and "name").
     * Returns one PluginDef per entry, with node shaped for UI (id, name, description, icon, type, category, properties from inputs).
     */
    private List<PluginDef> parsePluginYaml(String yamlContent, String entryPath) throws IOException {
        List<PluginDef> out = new ArrayList<>();
        if (yamlContent == null || yamlContent.isBlank()) return out;
        String trimmed = yamlContent.startsWith("\uFEFF") ? yamlContent.substring(1) : yamlContent;
        JsonNode root = yamlMapper.readTree(trimmed);
        if (root == null) {
            log.debug("Plugin YAML parsed to null: {}", entryPath);
            return out;
        }
        JsonNode pluginsArray = root.get("plugins");
        if (pluginsArray == null) {
            log.debug("Plugin YAML has no 'plugins' key: {}", entryPath);
            return out;
        }
        if (!pluginsArray.isArray()) {
            log.warn("Plugin YAML 'plugins' is not an array (node type: {}): {}", pluginsArray.getClass().getSimpleName(), entryPath);
            return out;
        }
        int size = pluginsArray.size();
        log.info("Plugin YAML 'plugins' array size: {} in {}", size, entryPath);
        for (int i = 0; i < size; i++) {
            JsonNode item = pluginsArray.get(i);
            if (item == null || !item.isObject()) continue;
            JsonNode plugin = item.has("plugin") ? item.get("plugin") : item;
            if (plugin == null || !plugin.isObject()) continue;
            if (!plugin.has("id") && !plugin.has("name")) continue;
            ObjectNode uiNode = objectMapper.createObjectNode();
            String yamlId = plugin.has("id") ? plugin.get("id").asText() : ("plugin-" + i);
            uiNode.put("pluginId", yamlId);
            uiNode.put("id", yamlId);
            uiNode.put("name", plugin.has("name") ? plugin.get("name").asText() : yamlId);
            if (plugin.has("displayName")) uiNode.put("displayName", plugin.get("displayName").asText());
            if (plugin.has("version")) uiNode.put("version", plugin.get("version").asText());
            if (plugin.has("className")) uiNode.put("className", plugin.get("className").asText());
            if (plugin.has("pluginType") && plugin.get("pluginType").asText().trim().isEmpty())
                uiNode.put("pluginType", "");
            else
                uiNode.put("pluginType", pluginTypeFromCapability(plugin));
            if (plugin.has("capability") && plugin.get("capability").isArray()) {
                ArrayNode capArray = objectMapper.createArrayNode();
                for (JsonNode e : plugin.get("capability")) {
                    if (e != null && e.isTextual()) capArray.add(e.asText());
                }
                uiNode.set("capability", capArray);
            }
            uiNode.put("description", plugin.has("description") ? plugin.get("description").asText() : "");
            uiNode.put("type", "plugin");
            uiNode.put("category", plugin.has("category") ? plugin.get("category").asText() : "plugin");
            uiNode.put("icon", "extension");
            ObjectNode properties = objectMapper.createObjectNode();
            ObjectNode props = objectMapper.createObjectNode();
            ArrayNode required = objectMapper.createArrayNode();
            if (plugin.has("inputs") && plugin.get("inputs").isArray()) {
                for (JsonNode in : plugin.get("inputs")) {
                    if (!in.isObject() || !in.has("name")) continue;
                    String name = in.get("name").asText();
                    String type = in.has("type") ? in.get("type").asText() : "string";
                    ObjectNode prop = objectMapper.createObjectNode();
                    prop.put("type", type);
                    prop.put("title", name);
                    if (in.has("description")) prop.put("description", in.get("description").asText());
                    if (in.has("required") && isTruthy(in.get("required"))) required.add(name);
                    props.set(name, prop);
                }
            }
            properties.put("type", "object");
            properties.set("properties", props);
            properties.set("required", required);
            uiNode.set("properties", properties);
            out.add(new PluginDef(entryPath, i, uiNode));
        }
        if (out.isEmpty()) {
            List<PluginDef> fallback = parsePluginYamlSnakeYaml(trimmed, entryPath);
            if (!fallback.isEmpty()) {
                log.info("Parsed {} plugins from YAML using SnakeYAML fallback: {}", fallback.size(), entryPath);
                return fallback;
            }
        }
        return out;
    }

    /** Fallback: parse plugin.yaml with SnakeYAML (handles plugins: [ { plugin: { id, name, ... } } ]). */
    @SuppressWarnings("unchecked")
    private List<PluginDef> parsePluginYamlSnakeYaml(String yamlContent, String entryPath) {
        List<PluginDef> out = new ArrayList<>();
        try {
            Yaml yaml = new Yaml();
            Object root = yaml.load(yamlContent);
            if (!(root instanceof Map)) return out;
            Map<String, Object> rootMap = (Map<String, Object>) root;
            Object pluginsObj = rootMap.get("plugins");
            if (!(pluginsObj instanceof List)) return out;
            List<?> list = (List<?>) pluginsObj;
            for (int i = 0; i < list.size(); i++) {
                Object item = list.get(i);
                if (!(item instanceof Map)) continue;
                Map<String, Object> itemMap = (Map<String, Object>) item;
                Object pluginObj = itemMap.get("plugin");
                if (pluginObj == null) pluginObj = item;
                if (!(pluginObj instanceof Map)) continue;
                Map<String, Object> plugin = (Map<String, Object>) pluginObj;
                String id = str(plugin.get("id"));
                String name = str(plugin.get("name"));
                if (id == null && name == null) continue;
                if (id == null) id = "plugin-" + i;
                if (name == null) name = id;
                ObjectNode uiNode = objectMapper.createObjectNode();
                uiNode.put("pluginId", id);
                uiNode.put("id", id);
                uiNode.put("name", name);
                if (plugin.get("displayName") != null) uiNode.put("displayName", str(plugin.get("displayName")));
                if (plugin.get("version") != null) uiNode.put("version", str(plugin.get("version")));
                if (plugin.get("className") != null) uiNode.put("className", str(plugin.get("className")));
                Object ptObj = plugin.get("pluginType");
                if (ptObj != null && str(ptObj).trim().isEmpty())
                    uiNode.put("pluginType", "");
                else
                    uiNode.put("pluginType", pluginTypeFromCapabilitySnake(plugin));
                Object capObj = plugin.get("capability");
                if (capObj instanceof List) {
                    ArrayNode capArray = objectMapper.createArrayNode();
                    for (Object o : (List<?>) capObj) {
                        if (o != null) capArray.add(o.toString());
                    }
                    uiNode.set("capability", capArray);
                }
                uiNode.put("description", str(plugin.get("description")) != null ? str(plugin.get("description")) : "");
                uiNode.put("type", "plugin");
                uiNode.put("category", str(plugin.get("category")) != null ? str(plugin.get("category")) : "plugin");
                uiNode.put("icon", "extension");
                ObjectNode properties = objectMapper.createObjectNode();
                ObjectNode props = objectMapper.createObjectNode();
                ArrayNode required = objectMapper.createArrayNode();
                Object inputsObj = plugin.get("inputs");
                if (inputsObj instanceof List) {
                    for (Object in : (List<?>) inputsObj) {
                        if (!(in instanceof Map)) continue;
                        Map<String, Object> inMap = (Map<String, Object>) in;
                        String inName = str(inMap.get("name"));
                        if (inName == null) continue;
                        ObjectNode prop = objectMapper.createObjectNode();
                        prop.put("type", str(inMap.get("type")) != null ? str(inMap.get("type")) : "string");
                        prop.put("title", inName);
                        if (inMap.get("description") != null) prop.put("description", str(inMap.get("description")));
                        if (isTruthyObj(inMap.get("required"))) required.add(inName);
                        props.set(inName, prop);
                    }
                }
                properties.put("type", "object");
                properties.set("properties", props);
                properties.set("required", required);
                uiNode.set("properties", properties);
                out.add(new PluginDef(entryPath, i, uiNode));
            }
        } catch (Exception e) {
            log.debug("SnakeYAML fallback failed for {}: {}", entryPath, e.getMessage());
        }
        return out;
    }

    private static String str(Object o) {
        return o == null ? null : o.toString().trim();
    }

    private static boolean isTruthyObj(Object o) {
        if (o == null) return false;
        if (o instanceof Boolean) return (Boolean) o;
        return Boolean.parseBoolean(o.toString().trim());
    }

    private static boolean isTruthy(JsonNode n) {
        if (n == null || n.isNull()) return false;
        if (n.isBoolean()) return n.asBoolean();
        if (n.isTextual()) return Boolean.parseBoolean(n.asText().trim());
        return false;
    }

    /** Derive engine pluginType from plugin YAML (pluginType if present, else from capability). */
    private static String pluginTypeFromCapability(JsonNode plugin) {
        if (plugin.has("pluginType") && !plugin.get("pluginType").asText().isBlank()) {
            return plugin.get("pluginType").asText().trim();
        }
        JsonNode cap = plugin.get("capability");
        if (cap == null) return "ModelPlugin";
        if (cap.isTextual()) {
            String key = cap.asText().trim().toUpperCase();
            return CAPABILITY_TO_PLUGIN_TYPE.getOrDefault(key, "ModelPlugin");
        }
        if (cap.isArray() && cap.size() > 0) {
            JsonNode first = cap.get(0);
            if (first != null && first.isTextual()) {
                String key = first.asText().trim().toUpperCase();
                return CAPABILITY_TO_PLUGIN_TYPE.getOrDefault(key, "ModelPlugin");
            }
        }
        return "ModelPlugin";
    }

    @SuppressWarnings("unchecked")
    private static String pluginTypeFromCapabilitySnake(Map<String, Object> plugin) {
        Object pt = plugin.get("pluginType");
        if (pt != null && pt.toString().trim().length() > 0) return pt.toString().trim();
        Object cap = plugin.get("capability");
        if (cap == null) return "ModelPlugin";
        String key;
        if (cap instanceof List && !((List<?>) cap).isEmpty()) {
            Object first = ((List<?>) cap).get(0);
            key = first != null ? first.toString().trim().toUpperCase() : null;
        } else {
            key = cap.toString().trim().toUpperCase();
        }
        return key != null ? CAPABILITY_TO_PLUGIN_TYPE.getOrDefault(key, "ModelPlugin") : "ModelPlugin";
    }

    /** Compute a unique plugin id for this definition; prefer path/folder, then metadata id, then oloBaseId + index. */
    private String uniquePluginId(String oloBaseId, PluginDef def, Map<String, JsonNode> out) {
        String path = def.entryPath;
        String folder = path.contains("/") ? path.substring(0, path.indexOf('/')) : null;
        String candidate;
        if (folder != null && !folder.isEmpty()) {
            candidate = oloBaseId + "__" + folder;
        } else if (def.arrayIndex >= 0) {
            if (def.node.has("id")) {
                String metaId = def.node.get("id").asText().trim();
                if (!metaId.isEmpty()) candidate = oloBaseId + "__" + metaId;
                else candidate = oloBaseId + "_" + def.arrayIndex;
            } else {
                candidate = oloBaseId + "_" + def.arrayIndex;
            }
        } else {
            candidate = oloBaseId;
        }
        String id = candidate;
        int suffix = 0;
        while (out.containsKey(id)) id = candidate + "_" + (suffix++);
        return id;
    }

    /** Ensure the plugin node has "id" and "type":"plugin" so the UI lists it under Plugins with name/icon/description. */
    private JsonNode ensurePluginId(JsonNode root, String pluginId) {
        if (!root.isObject()) return root;
        var obj = (com.fasterxml.jackson.databind.node.ObjectNode) objectMapper.createObjectNode();
        root.fields().forEachRemaining(f -> obj.set(f.getKey(), f.getValue()));
        obj.put("id", pluginId);
        if (!obj.has("type") || obj.get("type").asText().trim().isEmpty()) {
            obj.put("type", "plugin");
        } else {
            String t = obj.get("type").asText().trim();
            if (!"start".equals(t) && !"end".equals(t) && !"group".equals(t)
                    && !"container".equals(t) && !"control".equals(t)) {
                obj.put("type", "plugin");
            }
        }
        return obj;
    }
}
