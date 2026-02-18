package com.olo.web;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class RootController {

    @GetMapping(value = { "/", "/api" }, produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> root() {
        return Map.of(
            "message", "OLO Config API",
            "docs", "Use the frontend at http://localhost:5173 or call:",
            "endpoints", Map.of(
                "GET /api/configs", "List configs",
                "GET /api/configs/{name}", "Get config",
                "POST /api/configs", "Upsert config",
                "GET /api/templates", "List templates",
                "GET /api/plugins", "List plugins",
                "GET /api/plugins/{id}/schema", "Get plugin schema"
            )
        );
    }
}
