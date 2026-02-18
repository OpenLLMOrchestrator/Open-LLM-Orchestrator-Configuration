package com.olo.config;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

import java.time.Instant;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OloConfigDto {

    private String id;
    @NotBlank(message = "Config name is required")
    private String name;
    private String description;
    private String templateId;
    private String canvasJson;
    private String configJson;
    private Instant createdAt;
    private Instant updatedAt;
}
