import type { OloConfig, Template, PluginSummary, PluginSchema, ComponentSummary, InProgressTemplate } from './types';

const BASE = '/api';

/** Check if backend is ready (for wait-until-ready before loading app). */
export async function isBackendReady(): Promise<boolean> {
  try {
    const res = await fetch(BASE, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

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
async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'PUT',
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
  createCapability: (body: { id: string; name?: string; description?: string }) =>
    post<ComponentSummary>(`/components/capability`, body),
  listConfigs: () => get<OloConfig[]>(`/configs`),
  getConfig: async (name: string): Promise<OloConfig | null> => {
    try {
      return await get<OloConfig>(`/configs/${encodeURIComponent(name)}`);
    } catch {
      return null;
    }
  },
  upsertConfig: (body: OloConfig) => post<OloConfig>(`/configs`, body),
  /** Save config to olo:engine:config:{name}. */
  upsertEngineConfig: (name: string, configJson: string) =>
    post<void>(`/configs/engine/save`, { name, configJson }),
  deleteConfig: (name: string) => del(`/configs/${encodeURIComponent(name)}`),
  getInProgressTemplate: async (): Promise<InProgressTemplate | null> => {
    const res = await fetch(BASE + '/configs/inprogress');
    if (res.status === 204 || !res.ok) return null;
    return res.json();
  },
  putInProgressTemplate: (body: InProgressTemplate) =>
    put<InProgressTemplate>(`/configs/inprogress`, body),
};
