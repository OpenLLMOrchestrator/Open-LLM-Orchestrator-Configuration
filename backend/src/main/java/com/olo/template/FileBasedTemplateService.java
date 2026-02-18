package com.olo.template;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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

    @Value("${olo.templates-dir:../template}")
    private String templatesDir;

    private List<TemplateDto> fileTemplates = new ArrayList<>();

    @PostConstruct
    public void loadTemplates() {
        Path base = Paths.get(System.getProperty("user.dir")).resolve(templatesDir).normalize();
        if (!Files.isDirectory(base)) {
            log.info("Templates dir not found: {}, using empty list", base);
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
                    fileTemplates.add(TemplateDto.builder()
                            .id(id)
                            .name(name)
                            .description(description)
                            .configJson(content)
                            .canvasJson(null)
                            .builtIn(true)
                            .build());
                    log.info("Loaded template from file: {}", id);
                } catch (Exception e) {
                    log.warn("Failed to load template {}: {}", p.getFileName(), e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("Could not list templates dir {}: {}", base, e.getMessage());
        }
    }

    public List<TemplateDto> listFromFiles() {
        return new ArrayList<>(fileTemplates);
    }

    public Optional<TemplateDto> getByIdFromFiles(String id) {
        return fileTemplates.stream().filter(t -> t.getId().equals(id)).findFirst();
    }
}
