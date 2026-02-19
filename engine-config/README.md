# engine-config

Library for building, serializing, and persisting Open LLM Orchestrator engine and queue configuration. Use it from CLIs, dashboards, or config services to produce JSON that the worker consumes, or to read config back from JSON/Redis.

## Dependency

**Gradle:**

```groovy
implementation 'com.openllm:engine-config:0.0.1'
```

**Maven:**

```xml
<dependency>
  <groupId>com.openllm</groupId>
  <artifactId>engine-config</artifactId>
  <version>0.0.1</version>
</dependency>
```

From the same repo (multi-project):

```groovy
implementation project(':engine-config')
```

## 1. Building config

Config types have Lombok `@Builder` support. Use the builders directly or the `EngineConfigBuilders` helpers.

### Root engine config

```java
import com.openllmorchestrator.worker.engine.config.*;
import com.openllmorchestrator.worker.engine.config.pipeline.*;
import com.openllmorchestrator.worker.engine.config.redis.RedisConfig;
import java.util.List;
import java.util.Map;

// Minimal engine config with one pipeline
EngineFileConfig config = EngineConfigBuilders.engineConfig()
    .configVersion("1.0")
    .capabilityOrder(List.of("ACCESS", "MODEL", "TOOL"))
    .pipelines(Map.of("default", EngineConfigBuilders.pipeline()
        .defaultTimeoutSeconds(60)
        .defaultMaxGroupDepth(5)
        .rootByCapability(Map.of(
            "ACCESS", NodeConfig.builder()
                .type("GROUP")
                .executionMode("SYNC")
                .children(List.of())
                .build(),
            "MODEL", NodeConfig.builder()
                .type("PLUGIN")
                .name("my-llm")
                .pluginType("ModelPlugin")
                .build(),
            "TOOL", NodeConfig.builder()
                .type("PLUGIN")
                .name("my-tool")
                .pluginType("ToolPlugin")
                .build()))
        .build()))
    .build();
```

### Using the builder shortcuts

```java
// Start from helpers
EngineFileConfig.EngineFileConfigBuilder root = EngineConfigBuilders.engineConfig();
PipelineSection.PipelineSectionBuilder pipeline = EngineConfigBuilders.pipeline();
NodeConfig.NodeConfigBuilder node = EngineConfigBuilders.node();

// PLUGIN (leaf) node
NodeConfig plugin = EngineConfigBuilders.pluginNode("my-llm", "ModelPlugin").build();

// GROUP node
NodeConfig group = EngineConfigBuilders.groupNode("SYNC", List.of(plugin)).build();

// Capability block (for capabilities list style)
GroupConfig groupConfig = EngineConfigBuilders.group()
    .executionMode("SYNC")
    .children(List.of("activity-1", "activity-2"))
    .build();
CapabilityBlockConfig block = EngineConfigBuilders.capabilityBlock("MODEL", List.of(groupConfig)).build();
```

### Queue config

```java
QueueConfig queueConfig = EngineConfigBuilders.queueConfig()
    .queueName("my-queue")
    .stages(List.of("stage1", "stage2"))
    .defaultTimeout(Duration.ofMinutes(5))
    .build();
```

## 2. Serialization (JSON)

Use `EngineConfigMapper` to convert config to/from JSON.

```java
EngineConfigMapper mapper = EngineConfigMapper.getInstance();

// Serialize
String json = mapper.toJson(config);
byte[] bytes = mapper.toJsonBytes(config);

// Deserialize
EngineFileConfig fromString = mapper.fromJson(json);
EngineFileConfig fromStream = mapper.fromJson(inputStream);
EngineFileConfig fromReader = mapper.fromJson(reader);

// Queue config
String queueJson = mapper.toJson(queueConfig);
QueueConfig queue = mapper.queueConfigFromJson(queueJson);

// Raw JSON (e.g. to read version)
JsonNode tree = mapper.readTree(json);
String version = tree.has("configVersion") ? tree.get("configVersion").asText() : "1.0";
```

## 3. Writing to file or Redis

Use `EngineConfigWriter` to persist config after building or loading.

### Local JSON file

```java
EngineConfigWriter writer = new EngineConfigWriter();

// Engine config
writer.writeToFile(config, Paths.get("config/default.json"));

// Queue config
writer.writeToFile(queueConfig, Paths.get("config/my-queue.json"));

// Raw JSON string
writer.writeJsonToFile(json, Paths.get("config/custom.json"));

// To an output stream
writer.writeToStream(config, outputStream);
```

Parent directories are created if needed. Existing files are overwritten.

### Redis

```java
RedisConfig redis = RedisConfig.builder()
    .host("localhost")
    .port(6379)
    .password("")
    .build();

// Engine config — key: olo:engine:config:<configKey>:<version>
// Version comes from config.getConfigVersion() or "1.0"
writer.writeToRedis(config, redis, "default");

// Raw JSON with explicit key and version
writer.writeJsonToRedis(json, redis, "default", "1.0");

// Queue config — key: queue:config:<queueName>
writer.writeToRedis(queueConfig, redis);
```

## 4. Full example: build and publish

```java
import com.openllmorchestrator.worker.engine.config.*;
import com.openllmorchestrator.worker.engine.config.pipeline.*;
import com.openllmorchestrator.worker.engine.config.redis.RedisConfig;

import java.nio.file.Paths;
import java.util.List;
import java.util.Map;

// 1. Build config
EngineFileConfig config = EngineConfigBuilders.engineConfig()
    .configVersion("1.0")
    .capabilityOrder(List.of("ACCESS", "MODEL", "TOOL"))
    .pipelines(Map.of("default", EngineConfigBuilders.pipeline()
        .defaultTimeoutSeconds(60)
        .rootByCapability(Map.of(
            "ACCESS", NodeConfig.builder().type("GROUP").executionMode("SYNC").children(List.of()).build(),
            "MODEL", NodeConfig.builder().type("PLUGIN").name("my-llm").pluginType("ModelPlugin").build(),
            "TOOL", NodeConfig.builder().type("PLUGIN").name("my-tool").pluginType("ToolPlugin").build()))
        .build()))
    .build();

// 2. Write to local file and Redis
EngineConfigWriter writer = new EngineConfigWriter();
writer.writeToFile(config, Paths.get("config/default.json"));

RedisConfig redis = RedisConfig.builder().host("localhost").port(6379).password("").build();
writer.writeToRedis(config, redis, "default");
```

The worker loads config from Redis (or DB/file) using the same JSON shape, so config produced with this module is directly consumable by the worker.

## 5. Group rules (pipelines)

- **Per group:** At most one plugin of type **PLUGIN_IF** (ConditionPlugin) and at most one **PLUGIN_ITERATOR** (IteratorPlugin). They apply to the whole group (conditional or iterative execution).
- **SYNC:** Sequential execution of children.
- **ASYNC:** One FORK and one JOIN plugin. You can set `forkPlugin` and `joinPlugin` on the group, or leave them unset and use engine defaults.
- **Engine defaults:** In root config set `defaultForkPlugin` and `defaultJoinPlugin`. If an ASYNC group does not specify fork/join, the engine uses these (or a built-in when null).

Allowed plugin type constants: `AllowedPluginTypes.PLUGIN_IF`, `PLUGIN_ITERATOR`, `FORK`, `JOIN`.

## 6. Reading config (e.g. from file)

```java
EngineConfigMapper mapper = EngineConfigMapper.getInstance();

// From path
String json = Files.readString(Paths.get("config/default.json"));
EngineFileConfig config = mapper.fromJson(json);

// From classpath
try (InputStream in = getClass().getResourceAsStream("/config/default.json")) {
    EngineFileConfig config = mapper.fromJson(in);
}
```

## 7. Packages

| Package | Purpose |
|--------|--------|
| `com.openllmorchestrator.worker.engine.config` | Root config, mapper, writer, builders |
| `...config.pipeline` | PipelineSection, NodeConfig, GroupConfig, CapabilityBlockConfig, etc. |
| `...config.activity` | ActivityDefaultsConfig, timeouts, retry, payload |
| `...config.redis` | RedisConfig |
| `...config.database` | DatabaseConfig |
| `...config.worker` | WorkerConfig |
| `...config.temporal` | TemporalConfig |
| `...config.queue` | QueueTopologyConfig |
| `...config.env` | EnvConfig (env-derived connection config) |

## License

Apache License 2.0.
