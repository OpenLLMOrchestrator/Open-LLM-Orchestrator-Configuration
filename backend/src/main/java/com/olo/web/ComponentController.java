package com.olo.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.olo.component.ComponentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * UI components: Start, End, Group (from components folder) and Plugins (from plugins folder).
 * Each has a JSON schema for property panel rendering.
 */
@RestController
@RequestMapping("/api/components")
@RequiredArgsConstructor
@CrossOrigin(origins = "*", maxAge = 3600)
public class ComponentController {

    private final ComponentService componentService;

    @GetMapping
    public List<ComponentService.ComponentSummary> list() {
        return componentService.listAll();
    }

    @GetMapping("/{componentId}/schema")
    public ResponseEntity<JsonNode> getSchema(@PathVariable String componentId) {
        return componentService.getSchema(componentId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
