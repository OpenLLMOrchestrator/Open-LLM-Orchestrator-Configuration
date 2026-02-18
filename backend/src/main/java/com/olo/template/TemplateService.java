package com.olo.template;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TemplateService {

    private final TemplateRepository templateRepository;
    private final FileBasedTemplateService fileBasedTemplateService;

    /** List templates: from template folder first, then DB. */
    public List<TemplateDto> listAll() {
        List<TemplateDto> out = new ArrayList<>(fileBasedTemplateService.listFromFiles());
        List<TemplateDto> fromDb = templateRepository.findAllByOrderByNameAsc().stream()
                .map(this::toDto)
                .collect(Collectors.toList());
        for (TemplateDto t : fromDb) {
            if (out.stream().noneMatch(o -> o.getId().equals(t.getId())))
                out.add(t);
        }
        out.sort((a, b) -> String.CASE_INSENSITIVE_ORDER.compare(a.getName(), b.getName()));
        return out;
    }

    /** Get template by id: file first, then DB. */
    public TemplateDto getById(String id) {
        return fileBasedTemplateService.getByIdFromFiles(id)
                .orElseGet(() -> templateRepository.findById(id).map(this::toDto).orElse(null));
    }

    private TemplateDto toDto(TemplateEntity e) {
        return TemplateDto.builder()
                .id(e.getId())
                .name(e.getName())
                .description(e.getDescription())
                .canvasJson(e.getCanvasJson())
                .configJson(e.getConfigJson())
                .builtIn(e.isBuiltIn())
                .build();
    }
}
