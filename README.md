# Open LLM Orchestrator (OLO) Configuration

Configurable OLO with a **Java Spring Boot** backend and **React** frontend: drag-and-drop canvas, JSON-schema–driven plugin configuration, templates, and save (upsert) to **Redis** and **DB**.

## Features

- **Backend (Spring Boot)**
  - REST API for configs, templates, and components
  - Config **upsert** to **H2 DB** and **Redis**
  - **Templates** from the **`template/`** folder (engine-config-*.json pipeline configs; see [docs](docs/config-reference.md))
  - **Components** from **`components/`** (Start, End, Group) and **`plugins/`** (plugin definitions); each has a JSON config with `properties` schema for the UI

- **Frontend (React + Vite)**
  - **Template** dropdown at top: load pipeline config from **template/** (or DB)
  - **Component palette** (left): **Start**, **End**, **Group**, and all **Plugins** — drag onto canvas and **wire** to build the pipeline flow
  - **Canvas** (center): drop components, connect with edges, move nodes
  - **Property panel** (right): select a node → form from component/plugin **properties** schema; **Apply**
  - **Save**: name the config and **Save** → **upsert** to Redis + DB
  - **New** / **Load**: start from scratch or load a saved config by name

## Quick start

### Prerequisites

- **Java 17**, **Node 18+**, **Maven**, **Redis** (for full backend)

### Windows dev: start.bat / stop.bat

Without Docker, from the project root:

- **start.bat** — Starts Redis (if `redis-server` is on PATH), then the backend and frontend in separate console windows.
- **stop.bat** — Stops the backend (Java) and frontend (Vite) processes. Redis is left running; stop it manually if needed.

Run **start.bat** once; use **stop.bat** to shut down backend and frontend.

### 1. Redis (required for save)

```bash
# With Docker
docker run -d -p 6379:6379 redis:7-alpine
```

### 2. Backend

```bash
cd backend
mvn spring-boot:run
```

- API: **http://localhost:8082**
- H2 console (optional): `http://localhost:8082/h2-console` (JDBC URL: `jdbc:h2:file:./data/olo`)

### 3. Frontend (dev)

```bash
cd frontend
npm install
npm run dev
```

- App: **http://localhost:5173** (Vite proxies `/api` to `http://localhost:8082`)

### 4. All-in-one with Docker Compose

```bash
# Build backend JAR first
cd backend && mvn -DskipTests package && cd ..

docker-compose up -d
```

- Frontend: **http://localhost:5173**
- Backend: **http://localhost:8082**

## API (overview)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/templates` | List templates |
| GET | `/api/templates/{id}` | Get template by id |
| GET | `/api/plugins` | List plugins (from JSON schemas) |
| GET | `/api/plugins/{pluginId}/schema` | Get plugin JSON schema |
| GET | `/api/components` | List components (Start, End, Group, Plugins from components/ + plugins/) |
| GET | `/api/components/{id}/schema` | Get component/plugin schema for property panel |
| GET | `/api/configs` | List config names |
| GET | `/api/configs/{name}` | Get config (DB, then Redis fallback) |
| POST | `/api/configs` | Upsert config (body: name, canvasJson, configJson, etc.) |
| DELETE | `/api/configs/{name}` | Delete config (DB + Redis) |

## Component and plugin config (per file)

Add UI component configs under **`components/`** (Start, End, Group) or **`plugins/`** (plugins). Backend also falls back to **`backend/src/main/resources/plugin-schemas/`**. Each JSON file:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "description": "Short description",
  "icon": "extension",
  "type": "plugin",
  "category": "optional",
  "properties": {
    "type": "object",
    "properties": {
      "fieldName": {
        "type": "string",
        "title": "Field Label",
        "default": "value"
      }
    },
    "required": ["fieldName"]
  }
}
```

- **properties** is a JSON Schema (object with `type`, `properties`, `required`). The UI uses it to render the property form for a node.

## Templates

Pipeline configuration templates are loaded from the **`template/`** folder (e.g. `engine-config-rag.json`, `engine-config-minimal.json`). They appear in the top dropdown; selecting one loads that engine config. Additional templates can be stored in DB (see `backend/src/main/resources/data.sql`); file-based templates take precedence.

## Configuration

- **Backend** `application.yml`:
  - `spring.datasource.*` – H2 DB
  - `spring.data.redis.*` – Redis
  - `olo.redis.config-key-prefix` – Redis key prefix for configs
  - `olo.templates-dir`, `olo.components-dir`, `olo.plugins-dir` – Paths to template/, components/, plugins/ (relative to backend working dir)
  - `olo.plugin-schemas-path` – Classpath fallback for plugin schemas

- **Frontend**: API base is proxied at `/api` (see `vite.config.ts` and `frontend/nginx.conf` in Docker).

## License

Apache-2.0 (see LICENSE).
