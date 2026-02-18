package com.olo.config;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "olo_config")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OloConfigEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @NotBlank
    @Column(nullable = false, unique = true)
    private String name;

    private String description;

    @Column(name = "template_id")
    private String templateId;

    @Column(columnDefinition = "CLOB")
    private String canvasJson;  // nodes, edges, layout

    @Column(columnDefinition = "CLOB")
    private String configJson;  // full config payload

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onPersist() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
