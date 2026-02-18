package com.olo.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.olo.plugin.PluginSchemaService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/plugins")
@RequiredArgsConstructor
@CrossOrigin(origins = "*", maxAge = 3600)
public class PluginSchemaController {

    private final PluginSchemaService pluginSchemaService;

    @GetMapping
    public List<PluginSchemaService.PluginSchemaSummary> list() {
        return pluginSchemaService.listPlugins();
    }

    @GetMapping("/{pluginId}/schema")
    public ResponseEntity<JsonNode> getSchema(@PathVariable String pluginId) {
        return pluginSchemaService.getSchema(pluginId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
