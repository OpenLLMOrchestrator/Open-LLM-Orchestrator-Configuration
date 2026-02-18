package com.olo.template;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Entity
@Table(name = "olo_template")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TemplateEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @NotBlank
    @Column(nullable = false, unique = true)
    private String name;

    private String description;

    @Column(columnDefinition = "CLOB")
    private String canvasJson;

    @Column(columnDefinition = "CLOB")
    private String configJson;

    private boolean builtIn;
}
