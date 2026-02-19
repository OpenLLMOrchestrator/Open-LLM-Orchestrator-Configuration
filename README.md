# Open LLM Orchestrator (OLO) Configuration

Configurable OLO with a **Java Spring Boot** backend and **React** frontend: drag-and-drop canvas, JSON-schema–driven plugin configuration, templates, and save (upsert) to **Redis** and **DB**.

## Features

- **Backend (Spring Boot)**
  - REST API for configs, templates, and components
  - Config **upsert** to **PostgreSQL** and **Redis**
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

The backend uses the **engine-config** library so that templates and Redis-stored config are serialized/deserialized in the same format the worker (consumer) expects. Build engine-config once, then run the backend:

```bash
# From project root: build engine-config then backend (or run both with one command)
mvn -f engine-config/pom.xml install -q
cd backend
mvn spring-boot:run
```

Or from project root: `mvn install` builds `engine-config` then `backend`.

- API: **http://localhost:8082**
- **Local run with PostgreSQL:** If Postgres is in Docker (e.g. container `olo-postgres` with user `temporal`, password `pgpass`, DB `temporal`), run the backend with the `local` profile so it uses `localhost:5432` and those credentials:
  ```bash
  cd backend
  mvn spring-boot:run -Dspring.profiles.active=local
  ```
  Or set env vars: `SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/temporal`, `SPRING_DATASOURCE_USERNAME=temporal`, `SPRING_DATASOURCE_PASSWORD=pgpass`

### 3. Frontend (dev)

```bash
cd frontend
npm install
npm run dev
```

- App: **http://localhost:5173** (Vite proxies `/api` to `http://localhost:8082`)

### 4. All-in-one with Docker Compose

All settings are configurable via environment variables. Copy `.env.example` to `.env` and adjust if needed.

```bash
cp .env.example .env
docker compose up -d --build
```

- Frontend: **http://localhost:5173** (or `FRONTEND_PORT`)
- Backend: **http://localhost:8082** (or `SERVER_PORT`)
- Redis: port `6379` (or `REDIS_PORT`)
- PostgreSQL: port `5432` (or `POSTGRES_PORT`); set `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` in `.env`

The Compose stack includes Redis and PostgreSQL. The backend is built from source (engine-config + backend). Templates and components are mounted from `./template` and `./components`; override paths with `OLO_TEMPLATES_DIR`, `OLO_COMPONENTS_DIR`, `OLO_PLUGINS_DIR` in `.env`.

### Published containers (Docker Hub)

On **push to `main`**, **push of tag `v*`**, or **release published**, the [publish-containers](.github/workflows/publish-containers.yml) workflow builds and pushes images to **Docker Hub**.

**Required repo secrets** (Settings → Secrets and variables → Actions):

- `DOCKERHUB_USERNAME` – your Docker Hub username (or org)
- `DOCKERHUB_TOKEN` – Docker Hub access token (Account → Security → New Access Token)

**Published images:**

- `<DOCKERHUB_USERNAME>/olo-config-backend`: `latest`, `<sha>`, and (on tag/release) `<version>`
- `<DOCKERHUB_USERNAME>/olo-config-frontend`: `latest`, `<sha>`, and (on tag/release) `<version>`

Pull: `docker pull <your-username>/olo-config-backend:latest`. Use in your own compose or with Redis + Postgres.

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

All backend settings can be overridden via **environment variables** (see `.env.example`). Used by Docker Compose and local runs.

- **Server**: `SERVER_PORT` (default 8082), `FRONTEND_PORT` (default 5173 for Compose map)
- **Redis**: `SPRING_DATA_REDIS_HOST`, `SPRING_DATA_REDIS_PORT`, `SPRING_DATA_REDIS_PASSWORD`, `OLO_REDIS_CONFIG_KEY_PREFIX`, `OLO_REDIS_ENGINE_CONFIG_KEY_PREFIX`
- **Paths**: `OLO_TEMPLATES_DIR`, `OLO_COMPONENTS_DIR`, `OLO_PLUGINS_DIR`, `OLO_PLUGIN_SCHEMAS_PATH` (in container use `/app/template` etc.; Compose mounts `./template`, `./components`)
- **Database (PostgreSQL)**: `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD` (default `jdbc:postgresql://localhost:5432/olo`). In Docker, set `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` (compose builds the URL for the backend).

**Backend** `application.yml` holds defaults; env vars take precedence. **Frontend**: API base is proxied at `/api` (see `vite.config.ts` and `frontend/nginx.conf` in Docker).

## License

Apache-2.0 (see LICENSE).
