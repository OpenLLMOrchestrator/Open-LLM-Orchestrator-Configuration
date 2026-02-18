package com.olo.web;

import com.olo.config.OloConfigDto;
import com.olo.config.OloConfigService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/configs")
@RequiredArgsConstructor
@CrossOrigin(origins = "*", maxAge = 3600)
public class OloConfigController {

    private final OloConfigService configService;

    @PostMapping
    public ResponseEntity<OloConfigDto> upsert(@Valid @RequestBody OloConfigDto dto) {
        return ResponseEntity.ok(configService.upsert(dto));
    }

    @GetMapping
    public List<OloConfigDto> list() {
        return configService.listAll();
    }

    @GetMapping("/{name}")
    public ResponseEntity<OloConfigDto> getByName(@PathVariable String name) {
        OloConfigDto config = configService.getByNameWithRedisFallback(name);
        return config != null ? ResponseEntity.ok(config) : ResponseEntity.notFound().build();
    }

    @DeleteMapping("/{name}")
    public ResponseEntity<Void> delete(@PathVariable String name) {
        configService.deleteByName(name);
        return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
    }
}
