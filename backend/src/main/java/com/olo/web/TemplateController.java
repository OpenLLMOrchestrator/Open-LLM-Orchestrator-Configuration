package com.olo.web;

import com.olo.template.TemplateDto;
import com.olo.template.TemplateService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/templates")
@RequiredArgsConstructor
@CrossOrigin(origins = "*", maxAge = 3600)
public class TemplateController {

    private final TemplateService templateService;

    @GetMapping
    public List<TemplateDto> list() {
        return templateService.listAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<TemplateDto> getById(@PathVariable String id) {
        TemplateDto t = templateService.getById(id);
        return t != null ? ResponseEntity.ok(t) : ResponseEntity.notFound().build();
    }
}
