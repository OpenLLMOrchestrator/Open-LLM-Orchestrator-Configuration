package com.olo.template;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TemplateRepository extends JpaRepository<TemplateEntity, String> {

    List<TemplateEntity> findAllByOrderByNameAsc();

    List<TemplateEntity> findByBuiltInTrue();
}
