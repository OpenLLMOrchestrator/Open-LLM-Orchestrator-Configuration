package com.olo.template;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.openllmorchestrator.worker.engine.config.EngineConfigMapper;
import com.openllmorchestrator.worker.engine.config.EngineFileConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Loads pipeline configuration templates from the template/ folder (docs reference).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class FileBasedTemplateService {

    private final ObjectMapper objectMapper;

    private static final EngineConfigMapper ENGINE_CONFIG_MAPPER = EngineConfigMapper.getInstance();

    @Value("${olo.templates-dir:../template}")
    private String templatesDir;

    private List<TemplateDto> fileTemplates = new ArrayList<>();

    /** Resolve templates directory; try configured path and common fallbacks so it works from project root or backend/. */
    private Path resolveTemplatesBase() {
        Path cwd = Paths.get(System.getProperty("user.dir")).normalize();
        Path configured = cwd.resolve(templatesDir).normalize();
        if (Files.isDirectory(configured)) return configured;
        if (Files.isDirectory(cwd.resolve("template"))) return cwd.resolve("template").normalize();
        if (cwd.getFileName() != null && "backend".equals(cwd.getFileName().toString())
                && Files.isDirectory(cwd.resolve("..").resolve("template"))) {
            return cwd.resolve("..").resolve("template").normalize();
        }
        return configured;
    }

    @PostConstruct
    public void loadTemplates() {
        Path base = resolveTemplatesBase();
        if (!Files.isDirectory(base)) {
            log.warn("Templates dir not found: {} (cwd={}). No templates will be available. Set olo.templates-dir or run from backend/ with template/ as sibling.",
                    base, System.getProperty("user.dir"));
            return;
        }
        fileTemplates = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(base, "*.json")) {
            for (Path p : stream) {
                if (!Files.isRegularFile(p)) continue;
                String id = p.getFileName().toString().replace(".json", "");
                try {
                    String content = Files.readString(p);
                    JsonNode root = objectMapper.readTree(content);
                    String name = id.startsWith("engine-config-") ? id.substring("engine-config-".length()).replace("-", " ") : id;
                    if (name.length() > 0) name = name.substring(0, 1).toUpperCase() + name.substring(1);
                    String description = root.has("pipelines") ? "Pipeline config from template folder" : "";
                    String configJson = content;
                    if (root.has("pipelines") || root.has("configVersion")) {
                        try {
                            EngineFileConfig config = ENGINE_CONFIG_MAPPER.fromJson(content);
                            configJson = ENGINE_CONFIG_MAPPER.toJson(config);
                        } catch (Exception e) {
                            log.debug("Template {} not valid engine config, using raw content: {}", id, e.getMessage());
                        }
                    }
                    fileTemplates.add(TemplateDto.builder()
                            .id(id)
                            .name(name)
                            .description(description)
                            .configJson(configJson)
                            .canvasJson(null)
                            .builtIn(true)
                            .build());
                    log.info("Loaded template from file: {}", id);
                } catch (Exception e) {
                    log.warn("Failed to load template {}: {}", p.getFileName(), e.getMessage(), e);
                }
            }
        } catch (Exception e) {
            log.warn("Could not list templates dir {}: {}", base, e.getMessage(), e);
        }
        if (fileTemplates.isEmpty()) {
            log.warn("No templates loaded from {}. Check that the directory exists and contains *.json files.", base);
        }
    }

    public List<TemplateDto> listFromFiles() {
        return new ArrayList<>(fileTemplates);
    }

    public Optional<TemplateDto> getByIdFromFiles(String id) {
        return fileTemplates.stream().filter(t -> t.getId().equals(id)).findFirst();
    }
}
