package com.olo.template;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Seeds built-in templates after the schema exists (e.g. when using PostgreSQL).
 * Skips when running with embedded DB and data.sql has already run.
 */
@Component
public class DataSeeder implements ApplicationRunner {

    private final TemplateRepository templateRepository;

    public DataSeeder(TemplateRepository templateRepository) {
        this.templateRepository = templateRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (templateRepository.findById("tpl-empty").isEmpty()) {
            templateRepository.save(TemplateEntity.builder()
                    .id("tpl-empty")
                    .name("Empty")
                    .description("Start from scratch with no nodes")
                    .canvasJson("{\"nodes\":[],\"edges\":[]}")
                    .configJson("{}")
                    .builtIn(true)
                    .build());
        }
        if (templateRepository.findById("tpl-rag").isEmpty()) {
            templateRepository.save(TemplateEntity.builder()
                    .id("tpl-rag")
                    .name("RAG Pipeline")
                    .description("Retriever + Prompt + LLM reference")
                    .canvasJson("{\"nodes\":[{\"id\":\"n1\",\"pluginId\":\"retriever\",\"position\":{\"x\":80,\"y\":100}},{\"id\":\"n2\",\"pluginId\":\"prompt-template\",\"position\":{\"x\":280,\"y\":100}},{\"id\":\"n3\",\"pluginId\":\"llm-inference\",\"position\":{\"x\":480,\"y\":100}}],\"edges\":[{\"source\":\"n1\",\"target\":\"n2\"},{\"source\":\"n2\",\"target\":\"n3\"}]}")
                    .configJson("{}")
                    .builtIn(true)
                    .build());
        }
    }
}
