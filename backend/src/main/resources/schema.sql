-- Create OLO tables at bootstrap if they do not exist (PostgreSQL and H2 compatible).

CREATE TABLE IF NOT EXISTS olo_template (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description VARCHAR(255),
    canvas_json TEXT,
    config_json TEXT,
    built_in BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS olo_config (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description VARCHAR(255),
    template_id VARCHAR(255),
    canvas_json TEXT,
    config_json TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
