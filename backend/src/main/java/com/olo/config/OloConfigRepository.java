package com.olo.config;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface OloConfigRepository extends JpaRepository<OloConfigEntity, String> {

    Optional<OloConfigEntity> findByName(String name);

    boolean existsByName(String name);
}
