package com.olo.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.olo.component.ComponentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * UI components: flow/control from components/, capabilities from components/capability/, plugins from components/plugins/.
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

    /**
     * Global options from components/global: feature flags and plugins lists.
     * Used by the Feature flags & settings tab.
     */
    @GetMapping("/global")
    public ComponentService.GlobalOptions getGlobal() {
        return componentService.getGlobalOptions();
    }

    @GetMapping("/{componentId}/schema")
    public ResponseEntity<JsonNode> getSchema(@PathVariable String componentId) {
        return componentService.getSchema(componentId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Create a new capability template in components/capability/{id}.json.
     * Body: { "id": "MY_CAP", "name": "My Cap", "description": "Optional" }
     */
    @PostMapping("/capability")
    public ResponseEntity<ComponentService.ComponentSummary> createCapability(@RequestBody Map<String, String> body) {
        String id = body != null ? body.get("id") : null;
        String name = body != null ? body.get("name") : null;
        String description = body != null ? body.get("description") : null;
        try {
            ComponentService.ComponentSummary created = componentService.createCapability(id, name, description);
            return ResponseEntity.ok(created);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }
}
