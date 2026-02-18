-- Seed built-in templates (idempotent)
INSERT INTO olo_template (id, name, description, canvas_json, config_json, built_in)
SELECT 'tpl-empty', 'Empty', 'Start from scratch with no nodes', '{"nodes":[],"edges":[]}', '{}', true
WHERE NOT EXISTS (SELECT 1 FROM olo_template WHERE id = 'tpl-empty');

INSERT INTO olo_template (id, name, description, canvas_json, config_json, built_in)
SELECT 'tpl-rag', 'RAG Pipeline', 'Retriever + Prompt + LLM reference', '{"nodes":[{"id":"n1","pluginId":"retriever","position":{"x":80,"y":100}},{"id":"n2","pluginId":"prompt-template","position":{"x":280,"y":100}},{"id":"n3","pluginId":"llm-inference","position":{"x":480,"y":100}}],"edges":[{"source":"n1","target":"n2"},{"source":"n2","target":"n3"}]}', '{}', true
WHERE NOT EXISTS (SELECT 1 FROM olo_template WHERE id = 'tpl-rag');
