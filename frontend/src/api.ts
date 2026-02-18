import type { OloConfig, Template, PluginSummary, PluginSchema, ComponentSummary } from './types';

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
  return res.json();
}

async function del(path: string): Promise<void> {
  const res = await fetch(BASE + path, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(await res.text().catch(() => res.statusText));
}

export const api = {
  getTemplates: () => get<Template[]>(`/templates`),
  getTemplate: (id: string) => get<Template>(`/templates/${id}`),
  getPlugins: () => get<PluginSummary[]>(`/plugins`),
  getPluginSchema: (pluginId: string) => get<PluginSchema>(`/plugins/${pluginId}/schema`),
  getComponents: () => get<ComponentSummary[]>(`/components`),
  getComponentSchema: (componentId: string) => get<PluginSchema>(`/components/${encodeURIComponent(componentId)}/schema`),
  listConfigs: () => get<OloConfig[]>(`/configs`),
  getConfig: async (name: string): Promise<OloConfig | null> => {
    try {
      return await get<OloConfig>(`/configs/${encodeURIComponent(name)}`);
    } catch {
      return null;
    }
  },
  upsertConfig: (body: OloConfig) => post<OloConfig>(`/configs`, body),
  deleteConfig: (name: string) => del(`/configs/${encodeURIComponent(name)}`),
};
