/*
 * Copyright 2026 Open LLM Orchestrator contributors.
 */
package com.openllmorchestrator.worker.engine.config.queue;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.Collections;
import java.util.Map;

/**
 * Queue topology for concurrency isolation (queue-per-stage, queue-per-tenant).
 * When CONCURRENCY_ISOLATION is enabled, use to isolate heavy models and high-cost tenants.
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QueueTopologyConfig {

    private String strategy = "SINGLE";
    private Map<String, String> stageToQueue = Collections.emptyMap();
    private Map<String, String> tenantToQueue = Collections.emptyMap();

    public static final String SINGLE = "SINGLE";
    public static final String QUEUE_PER_STAGE = "QUEUE_PER_STAGE";
    public static final String QUEUE_PER_TENANT = "QUEUE_PER_TENANT";
}
