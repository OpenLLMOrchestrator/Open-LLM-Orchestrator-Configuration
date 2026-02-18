import { useCallback, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { ComponentPalette } from './components/ComponentPalette';
import { ConfigCanvas } from './components/ConfigCanvas';
import { PropertyPanel } from './components/PropertyPanel';
import type { OloConfig, Template, ComponentSummary, CanvasState, CanvasNode, CanvasEdge } from './types';
import { api } from './api';
import { engineConfigToCanvasState, isEngineConfig } from './utils/templateToCanvas';

/** Normalize parsed canvas JSON to tree-shaped state with nodes and edges (connections in place). */
function normalizeCanvasState(parsed: unknown): CanvasState {
  if (!parsed || typeof parsed !== 'object') return { nodes: [], edges: [] };
  const o = parsed as Record<string, unknown>;
  const nodes: CanvasNode[] = Array.isArray(o.nodes) ? o.nodes : [];
  const rawEdges = Array.isArray(o.edges) ? o.edges : [];
  const edges: CanvasEdge[] = rawEdges
    .filter((e): e is Record<string, unknown> => e != null && typeof e === 'object' && typeof (e as Record<string, unknown>).source === 'string' && typeof (e as Record<string, unknown>).target === 'string')
    .map((e) => ({
      id: typeof e.id === 'string' ? e.id : `e-${e.source}-${e.target}`,
      source: String(e.source),
      target: String(e.target),
    }));
  return { nodes, edges };
}

export default function App() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [components, setComponents] = useState<ComponentSummary[]>([]);
  const [configs, setConfigs] = useState<OloConfig[]>([]);
  const [currentConfigName, setCurrentConfigName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [canvasState, setCanvasState] = useState<CanvasState>({ nodes: [], edges: [] });
  const [canvasStateKey, setCanvasStateKey] = useState(0);
  const [configJson, setConfigJson] = useState<Record<string, unknown>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const loadTemplates = useCallback(async () => {
    try {
      const list = await api.getTemplates();
      setTemplates(list);
    } catch (e) {
      console.error('Failed to load templates', e);
    }
  }, []);

  const loadComponents = useCallback(async () => {
    try {
      const list = await api.getComponents();
      setComponents(list);
    } catch (e) {
      console.error('Failed to load components', e);
    }
  }, []);

  const loadConfigs = useCallback(async () => {
    try {
      const list = await api.listConfigs();
      setConfigs(list);
    } catch (e) {
      console.error('Failed to load config list', e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadTemplates(), loadComponents(), loadConfigs()]);
      setLoading(false);
    })();
  }, [loadTemplates, loadComponents, loadConfigs]);

  const applyTemplate = useCallback((template: Template) => {
    setSelectedTemplateId(template.id);
    try {
      const config = template.configJson ? JSON.parse(template.configJson) as Record<string, unknown> : {};
      setConfigJson(config);

      // If template is engine config (pipelines.root), build tree flow visualization
      if (isEngineConfig(config)) {
        const { nodes, edges } = engineConfigToCanvasState(config);
        setCanvasState({ nodes, edges });
      } else {
        const canvas = template.canvasJson ? JSON.parse(template.canvasJson) : null;
        setCanvasState(normalizeCanvasState(canvas));
      }
      setCanvasStateKey((k) => k + 1);
    } catch {
      setCanvasState({ nodes: [], edges: [] });
      setCanvasStateKey((k) => k + 1);
      setConfigJson({});
    }
  }, []);

  const loadConfig = useCallback(async (name: string) => {
    const c = await api.getConfig(name);
    if (!c) return;
    setCurrentConfigName(c.name);
    setSelectedTemplateId(c.templateId ?? null);
    try {
      const canvas = c.canvasJson ? JSON.parse(c.canvasJson) : null;
      setCanvasState(normalizeCanvasState(canvas));
      setCanvasStateKey((k) => k + 1);
      const config = c.configJson ? JSON.parse(c.configJson) : {};
      setConfigJson(config);
    } catch {
      setCanvasState({ nodes: [], edges: [] });
      setCanvasStateKey((k) => k + 1);
      setConfigJson({});
    }
  }, []);

  const newConfig = useCallback(() => {
    const empty = templates.find((t) => t.name === 'Empty');
    setCurrentConfigName('');
    if (empty) applyTemplate(empty);
    else {
      setCanvasState({ nodes: [], edges: [] });
      setCanvasStateKey((k) => k + 1);
    }
    setConfigJson({});
    setSelectedNodeId(null);
  }, [templates, applyTemplate]);

  const saveConfig = useCallback(async () => {
    const name = currentConfigName?.trim();
    if (!name) {
      setSaveStatus('error');
      return;
    }
    setSaveStatus('saving');
    try {
      await api.upsertConfig({
        name,
        description: '',
        templateId: selectedTemplateId ?? undefined,
        canvasJson: JSON.stringify(canvasState),
        configJson: JSON.stringify(configJson),
      });
      setSaveStatus('saved');
      await loadConfigs();
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      console.error(e);
      setSaveStatus('error');
    }
  }, [currentConfigName, selectedTemplateId, canvasState, configJson, loadConfigs]);

  const updateNodeData = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setCanvasState((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
      ),
    }));
    setConfigJson((prev) => ({
      ...prev,
      [nodeId]: data,
    }));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header
        templates={templates}
        configs={configs}
        currentConfigName={currentConfigName}
        onTemplateSelect={applyTemplate}
        onConfigSelect={loadConfig}
        onNewConfig={newConfig}
        onConfigNameChange={setCurrentConfigName}
        onSave={saveConfig}
        saveStatus={saveStatus}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <ComponentPalette components={components} />
        <ConfigCanvas
          canvasState={canvasState}
          canvasStateKey={canvasStateKey}
          onCanvasChange={setCanvasState}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          components={components}
        />
        <PropertyPanel
          selectedNodeId={selectedNodeId}
          nodes={canvasState.nodes}
          configJson={configJson}
          onUpdateNodeData={updateNodeData}
          api={api}
        />
      </div>
    </div>
  );
}
