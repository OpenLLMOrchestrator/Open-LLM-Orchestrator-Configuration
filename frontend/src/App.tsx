import { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { ComponentPalette } from './components/ComponentPalette';
import { ConfigCanvas } from './components/ConfigCanvas';
import { PropertyPanel } from './components/PropertyPanel';
import { ResizablePanel } from './components/ResizablePanel';
import type { OloConfig, Template, ComponentSummary, CanvasState, CanvasNode, CanvasEdge } from './types';
import { api, isBackendReady } from './api';
import { engineConfigToCanvasState, isEngineConfig, mergeCanvasPositions } from './utils/templateToCanvas';

const INPROGRESS_DEBOUNCE_MS = 1200;
const BACKEND_POLL_MS = 1500;

/** Normalize parsed canvas JSON to tree-shaped state with nodes and edges (connections in place). Preserves stored positions. */
function normalizeCanvasState(parsed: unknown): CanvasState {
  if (!parsed || typeof parsed !== 'object') return { nodes: [], edges: [] };
  const o = parsed as Record<string, unknown>;
  const rawNodes = Array.isArray(o.nodes) ? o.nodes : [];
  const nodes: CanvasNode[] = rawNodes
    .filter((n): n is Record<string, unknown> => n != null && typeof n === 'object' && typeof (n as Record<string, unknown>).id === 'string')
    .map((n) => {
      const pos = (n.position as { x?: number; y?: number } | undefined);
      return {
        ...n,
        id: String(n.id),
        position: typeof pos?.x === 'number' && typeof pos?.y === 'number'
          ? { x: pos.x, y: pos.y }
          : { x: 0, y: 0 },
      } as CanvasNode;
    });
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
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [canvasState, setCanvasState] = useState<CanvasState>({ nodes: [], edges: [] });
  const [canvasStateKey, setCanvasStateKey] = useState(0);
  const [configJson, setConfigJson] = useState<Record<string, unknown>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [leftPanelWidth, setLeftPanelWidth] = useState(260);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const inprogressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRestoredInProgressRef = useRef(false);

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

  const pipelineNames = Object.keys(
    (configJson?.pipelines && typeof configJson.pipelines === 'object' && configJson.pipelines) as Record<string, unknown> || {}
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      while (!cancelled) {
        const ready = await isBackendReady();
        if (cancelled) return;
        if (ready) break;
        await new Promise((r) => setTimeout(r, BACKEND_POLL_MS));
      }
      if (cancelled) return;
      await Promise.all([loadTemplates(), loadComponents(), loadConfigs()]);
      if (cancelled) return;
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTemplates, loadComponents, loadConfigs]);

  useEffect(() => {
    if (loading) return;
    (async () => {
      if (hasRestoredInProgressRef.current) return;
      hasRestoredInProgressRef.current = true;
      const inprogress = await api.getInProgressTemplate();
      if (!inprogress) return;
      if (inprogress.templateId != null && inprogress.templateId !== '') setSelectedTemplateId(inprogress.templateId);
      if (inprogress.configName != null && inprogress.configName !== '') setCurrentConfigName(inprogress.configName);
      if (inprogress.selectedPipelineId != null && inprogress.selectedPipelineId !== '') {
        setSelectedPipelineId(inprogress.selectedPipelineId);
      }
      if (inprogress.configJson != null && inprogress.configJson !== '') {
        try {
          const config = JSON.parse(inprogress.configJson) as Record<string, unknown>;
          setConfigJson(config);
        } catch {
          // ignore
        }
      }
      if (inprogress.canvasJson != null && inprogress.canvasJson !== '') {
        try {
          const canvas = JSON.parse(inprogress.canvasJson) as unknown;
          setCanvasState(normalizeCanvasState(canvas));
          setCanvasStateKey((k) => k + 1);
        } catch {
          // ignore
        }
      }
    })();
  }, [loading]);

  const persistInProgress = useCallback(() => {
    if (inprogressTimeoutRef.current) clearTimeout(inprogressTimeoutRef.current);
    inprogressTimeoutRef.current = setTimeout(() => {
      inprogressTimeoutRef.current = null;
      api.putInProgressTemplate({
        templateId: selectedTemplateId ?? undefined,
        configName: currentConfigName || undefined,
        canvasJson: JSON.stringify(canvasState),
        configJson: JSON.stringify(configJson),
        selectedPipelineId: selectedPipelineId ?? undefined,
      }).catch(() => {});
    }, INPROGRESS_DEBOUNCE_MS);
  }, [selectedTemplateId, currentConfigName, canvasState, configJson, selectedPipelineId]);

  useEffect(() => {
    if (loading) return;
    persistInProgress();
    return () => {
      if (inprogressTimeoutRef.current) clearTimeout(inprogressTimeoutRef.current);
    };
  }, [loading, persistInProgress]);

  const applyTemplate = useCallback((template: Template) => {
    setSelectedTemplateId(template.id);
    try {
      const config = template.configJson ? JSON.parse(template.configJson) as Record<string, unknown> : {};
      setConfigJson(config);
      const pipelines = config?.pipelines && typeof config.pipelines === 'object' ? (config.pipelines as Record<string, unknown>) : {};
      const firstPipelineId = Object.keys(pipelines)[0] ?? null;
      setSelectedPipelineId(firstPipelineId);

      if (template.canvasJson && template.canvasJson.trim() !== '') {
        const canvas = JSON.parse(template.canvasJson) as unknown;
        setCanvasState(normalizeCanvasState(canvas));
      } else if (isEngineConfig(config)) {
        setCanvasState((prev) => {
          const computed = engineConfigToCanvasState(config, firstPipelineId ?? undefined);
          return mergeCanvasPositions(computed, prev);
        });
      } else {
        setCanvasState({ nodes: [], edges: [] });
      }
      setCanvasStateKey((k) => k + 1);
    } catch {
      setCanvasState({ nodes: [], edges: [] });
      setCanvasStateKey((k) => k + 1);
      setConfigJson({});
      setSelectedPipelineId(null);
    }
  }, []);

  const loadConfig = useCallback(async (name: string) => {
    const c = await api.getConfig(name);
    if (!c) return;
    setCurrentConfigName(c.name);
    setSelectedTemplateId(c.templateId ?? null);
    try {
      const config = c.configJson ? JSON.parse(c.configJson) as Record<string, unknown> : {};
      setConfigJson(config);
      const pipelines = config?.pipelines && typeof config.pipelines === 'object' ? (config.pipelines as Record<string, unknown>) : {};
      const firstPipelineId = Object.keys(pipelines)[0] ?? null;
      setSelectedPipelineId(firstPipelineId);
      if (c.canvasJson) {
        const canvas = JSON.parse(c.canvasJson) as unknown;
        setCanvasState(normalizeCanvasState(canvas));
      } else if (firstPipelineId && isEngineConfig(config)) {
        const { nodes, edges } = engineConfigToCanvasState(config, firstPipelineId);
        setCanvasState({ nodes, edges });
      } else {
        setCanvasState({ nodes: [], edges: [] });
      }
      setCanvasStateKey((k) => k + 1);
    } catch {
      setCanvasState({ nodes: [], edges: [] });
      setCanvasStateKey((k) => k + 1);
      setConfigJson({});
      setSelectedPipelineId(null);
    }
  }, []);

  const onPipelineSelect = useCallback((id: string | null) => {
    setSelectedPipelineId(id);
    if (!id) return;
    if (!isEngineConfig(configJson)) return;
    setCanvasState((prev) => mergeCanvasPositions(engineConfigToCanvasState(configJson, id), prev));
    setCanvasStateKey((k) => k + 1);
  }, [configJson]);

  const onAddPipeline = useCallback((customName?: string) => {
    setConfigJson((prev) => {
      const pipelines = (prev?.pipelines && typeof prev.pipelines === 'object'
        ? { ...(prev.pipelines as Record<string, unknown>) }
        : {}) as Record<string, { root?: Record<string, unknown>; defaultTimeoutSeconds?: number }>;
      const trimmed = customName?.trim();
      let name: string;
      if (trimmed && !pipelines[trimmed]) {
        name = trimmed;
      } else if (trimmed && pipelines[trimmed]) {
        setSelectedPipelineId(trimmed);
        const pipeline = pipelines[trimmed] as { root?: Record<string, unknown> };
        if (pipeline?.root && typeof pipeline.root === 'object' && isEngineConfig(prev)) {
          setCanvasState((prevState) =>
            mergeCanvasPositions(engineConfigToCanvasState(prev, trimmed), prevState)
          );
        } else {
          setCanvasState({ nodes: [], edges: [] });
        }
        setCanvasStateKey((k) => k + 1);
        return prev;
      } else {
        name = `pipeline-${Object.keys(pipelines).length + 1}`;
        while (pipelines[name]) name = `pipeline-${Date.now()}`;
      }
      pipelines[name] = { root: {}, defaultTimeoutSeconds: 6000, defaultAsyncCompletionPolicy: 'ALL' };
      setSelectedPipelineId(name);
      setCanvasState({ nodes: [], edges: [] });
      setCanvasStateKey((k) => k + 1);
      return { ...prev, pipelines };
    });
  }, []);

  const onDeletePipeline = useCallback(() => {
    if (!selectedPipelineId) return;
    setConfigJson((prev) => {
      const pipelines = (prev?.pipelines && typeof prev.pipelines === 'object'
        ? { ...prev.pipelines } as Record<string, unknown>
        : {}) as Record<string, unknown>;
      delete pipelines[selectedPipelineId];
      const remaining = Object.keys(pipelines);
      const nextId = remaining[0] ?? null;
      setSelectedPipelineId(nextId);
      if (nextId && isEngineConfig(prev)) {
        const nextConfig = { ...prev, pipelines };
        setCanvasState((prevState) =>
          mergeCanvasPositions(engineConfigToCanvasState(nextConfig, nextId), prevState)
        );
      } else {
        setCanvasState({ nodes: [], edges: [] });
      }
      setCanvasStateKey((k) => k + 1);
      return { ...prev, pipelines };
    });
  }, [selectedPipelineId]);

  const saveConfig = useCallback(async () => {
    const name = currentConfigName?.trim();
    if (!name) return;
    setSaveStatus('saving');
    try {
      await api.upsertEngineConfig(name, JSON.stringify(configJson));
      setSaveStatus('saved');
      await loadConfigs();
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      console.error(e);
      setSaveStatus('error');
    }
  }, [currentConfigName, configJson, loadConfigs]);

  const saveAsNewConfig = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaveStatus('saving');
    try {
      await api.upsertEngineConfig(trimmed, JSON.stringify(configJson));
      setCurrentConfigName(trimmed);
      setSaveStatus('saved');
      await loadConfigs();
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      console.error(e);
      setSaveStatus('error');
    }
  }, [configJson, loadConfigs]);

  const updatePipelineDefaults = useCallback(
    (pipelineId: string, defaults: { defaultTimeoutSeconds?: number; defaultAsyncCompletionPolicy?: string }) => {
      setConfigJson((prev) => {
        const pipelines = (prev?.pipelines && typeof prev.pipelines === 'object'
          ? { ...(prev.pipelines as Record<string, unknown>) }
          : {}) as Record<string, Record<string, unknown>>;
        const pipeline = pipelines[pipelineId] ? { ...pipelines[pipelineId] } : { root: {} };
        if (defaults.defaultTimeoutSeconds !== undefined) pipeline.defaultTimeoutSeconds = defaults.defaultTimeoutSeconds;
        if (defaults.defaultAsyncCompletionPolicy !== undefined)
          pipeline.defaultAsyncCompletionPolicy = defaults.defaultAsyncCompletionPolicy;
        pipelines[pipelineId] = pipeline;
        return { ...prev, pipelines };
      });
    },
    []
  );

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

  useEffect(() => {
    document.body.style.cursor = loading ? 'wait' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [loading]);

  if (loading) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-dark)',
          color: 'var(--text-muted)',
          cursor: 'wait',
          zIndex: 9999,
        }}
      >
        <div style={{ textAlign: 'center', fontSize: '1rem' }}>
          Waiting for backend…
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header
        templates={templates}
        configs={configs}
        currentConfigName={currentConfigName}
        selectedTemplateId={selectedTemplateId}
        onTemplateSelect={applyTemplate}
        pipelineNames={pipelineNames}
        selectedPipelineId={selectedPipelineId}
        onPipelineSelect={onPipelineSelect}
        onAddPipeline={onAddPipeline}
        onDeletePipeline={onDeletePipeline}
        onConfigSelect={loadConfig}
        onSaveAsNew={saveAsNewConfig}
        onSave={saveConfig}
        saveStatus={saveStatus}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <ResizablePanel
          side="left"
          width={leftPanelWidth}
          onWidthChange={setLeftPanelWidth}
          collapsed={leftPanelCollapsed}
          onCollapsedChange={setLeftPanelCollapsed}
        >
          <ComponentPalette
            components={components}
            onAddCapability={async (name) => {
              const id = name.trim().toUpperCase().replace(/\s+/g, '_');
              if (!id) return;
              try {
                await api.createCapability({ id, name: name.trim(), description: '' });
                await loadComponents();
              } catch (e) {
                console.error('Failed to create capability', e);
              }
            }}
          />
        </ResizablePanel>
        <ConfigCanvas
          canvasState={canvasState}
          canvasStateKey={canvasStateKey}
          onCanvasChange={setCanvasState}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          components={components}
        />
        <ResizablePanel
          side="right"
          width={rightPanelWidth}
          onWidthChange={setRightPanelWidth}
          collapsed={rightPanelCollapsed}
          onCollapsedChange={setRightPanelCollapsed}
        >
          <PropertyPanel
            selectedNodeId={selectedNodeId}
            selectedPipelineId={selectedPipelineId}
            configJson={configJson}
            nodes={canvasState.nodes}
            onUpdateNodeData={updateNodeData}
            onUpdatePipelineDefaults={updatePipelineDefaults}
            api={api}
          />
        </ResizablePanel>
      </div>
    </div>
  );
}
