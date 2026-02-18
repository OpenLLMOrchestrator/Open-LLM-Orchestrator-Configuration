import { useCallback, useEffect, useState } from 'react';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { CanvasNode } from '../types';
import type { PluginSchema } from '../types';
import type { api } from '../api';

const ASYNC_POLICY_OPTIONS = ['ALL', 'FIRST_SUCCESS', 'FIRST_FAILURE', 'ALL_SETTLED'] as const;

interface PropertyPanelProps {
  selectedNodeId: string | null;
  selectedPipelineId: string | null;
  configJson: Record<string, unknown>;
  nodes: CanvasNode[];
  onUpdateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  onUpdatePipelineDefaults: (pipelineId: string, defaults: { defaultTimeoutSeconds?: number; defaultAsyncCompletionPolicy?: string }) => void;
  api: typeof import('../api').api;
}

export function PropertyPanel({
  selectedNodeId,
  selectedPipelineId,
  configJson,
  nodes,
  onUpdateNodeData,
  onUpdatePipelineDefaults,
  api,
}: PropertyPanelProps) {
  const [schema, setSchema] = useState<PluginSchema | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [globalTimeout, setGlobalTimeout] = useState<string>('');
  const [globalPolicy, setGlobalPolicy] = useState<string>('ALL');

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;

  /** Group with ASYNC, async component, or fork node = Fork; show Reducer properties as well. */
  const isForkNode =
    selectedNode &&
    (selectedNode.pluginId === 'async' ||
      selectedNode.pluginId === 'fork' ||
      (selectedNode.pluginId === 'group' && (selectedNode.data?.executionMode as string) === 'ASYNC'));

  const pipelines = (configJson?.pipelines && typeof configJson.pipelines === 'object'
    ? configJson.pipelines as Record<string, Record<string, unknown>>
    : {});
  const currentPipeline = selectedPipelineId ? pipelines[selectedPipelineId] : null;

  useEffect(() => {
    if (selectedPipelineId && currentPipeline) {
      const t = currentPipeline.defaultTimeoutSeconds;
      setGlobalTimeout(t != null ? String(t) : '6000');
      setGlobalPolicy(
        typeof currentPipeline.defaultAsyncCompletionPolicy === 'string'
          ? currentPipeline.defaultAsyncCompletionPolicy
          : 'ALL'
      );
    }
  }, [selectedPipelineId, currentPipeline?.defaultTimeoutSeconds, currentPipeline?.defaultAsyncCompletionPolicy]);

  useEffect(() => {
    if (!selectedNode) {
      setSchema(null);
      setFormData({});
      return;
    }
    const isFork =
      selectedNode.pluginId === 'async' ||
      selectedNode.pluginId === 'fork' ||
      (selectedNode.pluginId === 'group' && (selectedNode.data?.executionMode as string) === 'ASYNC');
    const nodeData = (configJson[selectedNode.id] as Record<string, unknown>) ?? selectedNode.data ?? {};

    if (isFork) {
      Promise.all([
        api.getComponentSchema(selectedNode.pluginId),
        api.getComponentSchema('reducer'),
      ])
        .then(([baseSchema, reducerSchema]) => {
          const baseProps = (baseSchema.properties?.properties as Record<string, unknown>) ?? {};
          const reducerProps = (reducerSchema.properties?.properties as Record<string, unknown>) ?? {};
          const merged = { ...baseProps, ...reducerProps };
          setSchema({
            ...baseSchema,
            properties: {
              ...baseSchema.properties,
              type: 'object',
              properties: merged,
              required: [
                ...(baseSchema.properties?.required ?? []),
                ...(reducerSchema.properties?.required ?? []),
              ].filter((v, i, a) => a.indexOf(v) === i),
            },
          });
          setFormData(nodeData);
        })
        .catch(() => {
          setSchema(null);
          setFormData(selectedNode.data ?? {});
        });
    } else {
      api
        .getComponentSchema(selectedNode.pluginId)
        .then((s) => {
          setSchema(s);
          setFormData(nodeData);
        })
        .catch(() => {
          setSchema(null);
          setFormData(selectedNode.data ?? {});
        });
    }
  }, [selectedNodeId, selectedNode?.id, selectedNode?.pluginId, selectedNode?.data?.executionMode, configJson, api]);

  const onSubmit = useCallback(
    ({ formData: fd }: { formData: Record<string, unknown> }) => {
      if (selectedNodeId) onUpdateNodeData(selectedNodeId, fd);
    },
    [selectedNodeId, onUpdateNodeData]
  );

  const applyGlobalDefaults = useCallback(() => {
    if (!selectedPipelineId) return;
    const timeoutSec = parseInt(globalTimeout, 10);
    onUpdatePipelineDefaults(selectedPipelineId, {
      defaultTimeoutSeconds: Number.isFinite(timeoutSec) ? timeoutSec : 6000,
      defaultAsyncCompletionPolicy: ASYNC_POLICY_OPTIONS.includes(globalPolicy as (typeof ASYNC_POLICY_OPTIONS)[number])
        ? globalPolicy
        : 'ALL',
    });
  }, [selectedPipelineId, globalTimeout, globalPolicy, onUpdatePipelineDefaults]);

  const emptyPanel = (
    <aside
      style={{
        width: '100%',
        minWidth: 0,
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border)',
        padding: 20,
        color: 'var(--text-muted)',
        fontSize: '0.9rem',
        flex: 1,
      }}
    >
      Select a node to configure
    </aside>
  );

  if (!selectedNodeId || !selectedNode) {
    if (selectedPipelineId) {
      return (
        <aside
          style={{
            width: '100%',
            minWidth: 0,
            background: 'var(--bg-panel)',
            borderLeft: '1px solid var(--border)',
            padding: 16,
            overflowY: 'auto',
            flex: 1,
          }}
        >
          <div style={{ marginBottom: 12, fontWeight: 600 }}>Pipeline global properties</div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            Defaults for pipeline: <strong>{selectedPipelineId}</strong>
          </p>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>defaultTimeoutSeconds</span>
            <input
              type="number"
              min={1}
              value={globalTimeout}
              onChange={(e) => setGlobalTimeout(e.target.value)}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 4,
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                color: 'var(--text)',
              }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>defaultAsyncCompletionPolicy</span>
            <select
              value={globalPolicy}
              onChange={(e) => setGlobalPolicy(e.target.value)}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 4,
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                color: 'var(--text)',
              }}
            >
              {ASYNC_POLICY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={applyGlobalDefaults} className="form-actions primary" style={{ marginTop: 8 }}>
            Apply
          </button>
        </aside>
      );
    }
    return emptyPanel;
  }

  const jsonSchema = schema?.properties as Record<string, unknown> | undefined;

  return (
    <aside
      style={{
        width: '100%',
        minWidth: 0,
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border)',
        padding: 16,
        overflowY: 'auto',
        flex: 1,
      }}
    >
      <div style={{ marginBottom: 12, fontWeight: 600 }}>
          {isForkNode ? 'Fork (FORK)' : selectedNode.pluginId}
        </div>
      {jsonSchema ? (
        <Form
          schema={jsonSchema}
          formData={formData}
          validator={validator}
          onChange={({ formData: fd }) => setFormData(fd)}
          onSubmit={onSubmit}
          liveValidate
        >
          <button type="submit" className="form-actions primary" style={{ marginTop: 12 }}>
            Apply
          </button>
        </Form>
      ) : (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          No schema for this plugin. Edit node data in code or add a schema.
        </div>
      )}
    </aside>
  );
}
