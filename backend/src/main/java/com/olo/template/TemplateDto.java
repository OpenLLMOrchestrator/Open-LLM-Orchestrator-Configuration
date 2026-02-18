package com.olo.template;

import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TemplateDto {

    private String id;
    private String name;
    private String description;
    private String canvasJson;
    private String configJson;
    private boolean builtIn;
}
