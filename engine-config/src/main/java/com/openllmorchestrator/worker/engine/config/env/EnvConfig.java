/*
 * Copyright 2026 Open LLM Orchestrator contributors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.openllmorchestrator.worker.engine.config.env;

import com.openllmorchestrator.worker.engine.config.database.DatabaseConfig;
import com.openllmorchestrator.worker.engine.config.redis.RedisConfig;
import com.openllmorchestrator.worker.engine.config.worker.WorkerConfig;
import lombok.Builder;
import lombok.Getter;

/**
 * Connection config from container environment only.
 * Queue name, Redis, and DB are never taken from config file in production.
 */
@Getter
@Builder
public class EnvConfig {
    private final WorkerConfig worker;
    private final RedisConfig redis;
    private final DatabaseConfig database;
    /** Seconds to sleep between config load retries when not found in Redis/DB/file. */
    private final int configRetrySleepSeconds;
    /** Mounted config file path (fallback when Redis and DB have no config). */
    private final String configFilePath;
    /** Max concurrent workflow task pollers (env: MAX_CONCURRENT_WORKFLOW_TASK_POLLERS). */
    private final int maxConcurrentWorkflowTaskPollers;
    /** Max concurrent activity task pollers (env: MAX_CONCURRENT_ACTIVITY_TASK_POLLERS). */
    private final int maxConcurrentActivityTaskPollers;
    /** Temporal server target (env: TEMPORAL_TARGET). Overrides config when set. */
    private final String temporalTarget;
    /** Temporal namespace (env: TEMPORAL_NAMESPACE). Overrides config when set. */
    private final String temporalNamespace;

    public static EnvConfig fromEnvironment() {
        String queueName = getEnv("QUEUE_NAME", "core-task-queue");
        String redisHost = getEnv("REDIS_HOST", "localhost");
        int redisPort = parseInt(getEnv("REDIS_PORT", "6379"), 6379);
        String redisPassword = getEnv("REDIS_PASSWORD", "");
        String dbUrl = getEnv("DB_URL", "jdbc:postgresql://localhost:5432/olo_config");
        String dbUser = getEnv("DB_USERNAME", "postgres");
        String dbPassword = getEnv("DB_PASSWORD", "postgres");
        int retrySleep = parseInt(getEnv("CONFIG_RETRY_SLEEP_SECONDS", "30"), 30);
        String configPath = getEnv("CONFIG_FILE_PATH", getEnv("engine.config.path", null));
        if (configPath == null || configPath.isBlank()) {
            configPath = "config/" + getConfigKey() + ".json";
        }
        int workflowPollers = parseInt(getEnv("MAX_CONCURRENT_WORKFLOW_TASK_POLLERS", "5"), 5);
        int activityPollers = parseInt(getEnv("MAX_CONCURRENT_ACTIVITY_TASK_POLLERS", "10"), 10);
        String temporalTarget = getEnv("TEMPORAL_TARGET", "localhost:7233");
        String temporalNamespace = getEnv("TEMPORAL_NAMESPACE", "default");

        return EnvConfig.builder()
                .worker(WorkerConfig.of(queueName, false))
                .redis(RedisConfig.of(redisHost, redisPort, redisPassword))
                .database(DatabaseConfig.of(dbUrl, dbUser, dbPassword))
                .configRetrySleepSeconds(retrySleep)
                .configFilePath(configPath)
                .maxConcurrentWorkflowTaskPollers(workflowPollers)
                .maxConcurrentActivityTaskPollers(activityPollers)
                .temporalTarget(temporalTarget)
                .temporalNamespace(temporalNamespace)
                .build();
    }

    private static String getConfigKey() {
        return getEnv("CONFIG_KEY", "default");
    }

    private static String getEnv(String key, String defaultValue) {
        String v = System.getenv(key);
        if (v != null && !v.isBlank()) return v.trim();
        return System.getProperty(key, defaultValue);
    }

    private static int parseInt(String s, int defaultValue) {
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
}
