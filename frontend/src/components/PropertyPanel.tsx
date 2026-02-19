import { useCallback, useEffect, useState } from 'react';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { CanvasNode } from '../types';
import type { PluginSchema } from '../types';
import type { api } from '../api';

const ASYNC_POLICY_OPTIONS = ['ALL', 'FIRST_SUCCESS', 'FIRST_FAILURE', 'ALL_SETTLED'] as const;

/** Plugin input fields that are internal/auto-filled and should not be shown in the UI. */
const HIDDEN_PLUGIN_PROPERTIES = new Set(['messages', 'question']);

/** Activity timeout fields added to every plugin so user can override; stored in configJson[nodeId]. */
const ACTIVITY_TIMEOUT_PROPERTIES: Record<string, { type: string; title: string; default: number; description?: string }> = {
  scheduleToStartSeconds: {
    type: 'number',
    title: 'Schedule to start (seconds)',
    default: 60,
    description: 'Max time from schedule to worker pickup',
  },
  startToCloseSeconds: {
    type: 'number',
    title: 'Start to close (seconds)',
    default: 30,
    description: 'Max time for activity execution',
  },
  scheduleToCloseSeconds: {
    type: 'number',
    title: 'Schedule to close (seconds)',
    default: 300,
    description: 'Max time from schedule to completion',
  },
};

/** Ensure array schemas have an items definition so RJSF/AJV don't throw "Missing items definition". */
function ensureArrayItems(schema: Record<string, unknown>): Record<string, unknown> {
  const out = { ...schema };
  if (out.type === 'array' && out.items == null) {
    out.items = { type: 'object', title: 'Item', description: 'Array item' };
  }
  if (out.properties && typeof out.properties === 'object') {
    const props = out.properties as Record<string, unknown>;
    out.properties = Object.fromEntries(
      Object.entries(props).map(([k, v]) => [k, typeof v === 'object' && v != null && !Array.isArray(v) ? ensureArrayItems(v as Record<string, unknown>) : v])
    );
  }
  if (out.items && typeof out.items === 'object' && !Array.isArray(out.items)) {
    out.items = ensureArrayItems(out.items as Record<string, unknown>);
  }
  return out;
}

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
          const activity = (configJson.activity as Record<string, unknown>) ?? {};
          const defaultTimeouts = (activity.defaultTimeouts as Record<string, unknown>) ?? {};
          const withTimeoutDefaults = {
            ...nodeData,
            scheduleToStartSeconds:
              (nodeData.scheduleToStartSeconds as number) ??
              (defaultTimeouts.scheduleToStartSeconds as number) ??
              60,
            startToCloseSeconds:
              (nodeData.startToCloseSeconds as number) ??
              (defaultTimeouts.startToCloseSeconds as number) ??
              30,
            scheduleToCloseSeconds:
              (nodeData.scheduleToCloseSeconds as number) ??
              (defaultTimeouts.scheduleToCloseSeconds as number) ??
              300,
          };
          setFormData(withTimeoutDefaults);
          const nodeConfig = configJson[selectedNode.id];
          const isEmpty =
            nodeConfig == null || (typeof nodeConfig === 'object' && Object.keys(nodeConfig as object).length === 0);
          if (isEmpty) {
            onUpdateNodeData(selectedNode.id, withTimeoutDefaults);
          }
        })
        .catch(() => {
          setSchema(null);
          setFormData(selectedNode.data ?? {});
        });
    }
  }, [selectedNodeId, selectedNode?.id, selectedNode?.pluginId, selectedNode?.data?.executionMode, configJson, api, onUpdateNodeData]);

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

  const rawSchema = schema?.properties as Record<string, unknown> | undefined;
  const rawProps = rawSchema?.properties as Record<string, unknown> | undefined;
  let filteredProps =
    rawProps && typeof rawProps === 'object'
      ? Object.fromEntries(
          Object.entries(rawProps).filter(([key]) => !HIDDEN_PLUGIN_PROPERTIES.has(key))
        )
      : rawProps;
  const filteredRequired = Array.isArray(rawSchema?.required)
    ? (rawSchema.required as string[]).filter((r) => !HIDDEN_PLUGIN_PROPERTIES.has(r))
    : rawSchema?.required;
  const schemaForForm =
    rawSchema && filteredProps != null
      ? ensureArrayItems({
          ...rawSchema,
          properties: filteredProps,
          ...(filteredRequired != null && { required: filteredRequired }),
        })
      : rawSchema
        ? ensureArrayItems(rawSchema)
        : undefined;
  const jsonSchema = schemaForForm as Record<string, unknown> | undefined;

  const displayName =
    (schema?.displayName as string) ??
    (schema?.name as string) ??
    (selectedNode?.pluginId?.includes('__') ? selectedNode.pluginId.split('__').pop() : selectedNode?.pluginId) ??
    selectedNode?.pluginId;

  const pluginId = schema?.pluginId ?? (schema?.id as string);
  const pluginName = schema?.className ?? (schema?.name as string);
  const pluginVersion = schema?.version as string | undefined;
  const pluginCapability = schema?.capability as string[] | undefined;
  const showPluginDescriptor =
    !isForkNode &&
    selectedNode &&
    (pluginId != null || pluginName != null || pluginVersion != null || (Array.isArray(pluginCapability) && pluginCapability.length > 0));

  const labelStyle = { fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 2 } as const;
  const valueStyle = { fontSize: '0.85rem', fontFamily: 'monospace', wordBreak: 'break-all' } as const;

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
          {isForkNode ? 'Fork (FORK)' : displayName}
        </div>
      {showPluginDescriptor && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: 'var(--bg-elevated)',
            borderRadius: 8,
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
            Plugin descriptor
          </div>
          {pluginId != null && (
            <div style={{ marginBottom: 8 }}>
              <div style={labelStyle}>id</div>
              <div style={valueStyle}>{pluginId}</div>
            </div>
          )}
          {pluginName != null && (
            <div style={{ marginBottom: 8 }}>
              <div style={labelStyle}>name</div>
              <div style={valueStyle}>{pluginName}</div>
            </div>
          )}
          {pluginVersion != null && (
            <div style={{ marginBottom: 8 }}>
              <div style={labelStyle}>version</div>
              <div style={valueStyle}>{pluginVersion}</div>
            </div>
          )}
          {Array.isArray(pluginCapability) && pluginCapability.length > 0 && (
            <div style={{ marginBottom: 0 }}>
              <div style={labelStyle}>capability</div>
              <div style={valueStyle}>
                {pluginCapability.length === 1
                  ? pluginCapability[0]
                  : `[\n  ${pluginCapability.map((c) => `"${c}"`).join(',\n  ')}\n]`}
              </div>
            </div>
          )}
        </div>
      )}
      {!isForkNode && selectedNode && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: 'var(--bg-elevated)',
            borderRadius: 8,
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
            Activity timeouts (seconds)
          </div>
          {(['scheduleToStartSeconds', 'startToCloseSeconds', 'scheduleToCloseSeconds'] as const).map((key) => (
            <label key={key} style={{ display: 'block', marginBottom: 8 }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {ACTIVITY_TIMEOUT_PROPERTIES[key].title}
              </span>
              <input
                type="number"
                min={0}
                value={
                  (formData[key] as number) ??
                  (configJson[selectedNode.id] as Record<string, unknown>)?.[key] ??
                  ACTIVITY_TIMEOUT_PROPERTIES[key].default
                }
                onChange={(e) => {
                  const num = e.target.valueAsNumber;
                  if (Number.isFinite(num)) {
                    const next = {
                      ...(configJson[selectedNode.id] as Record<string, unknown> ?? {}),
                      ...formData,
                      [key]: num,
                    };
                    onUpdateNodeData(selectedNode.id, next);
                    setFormData((prev) => ({ ...prev, [key]: num }));
                  }
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 4,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text)',
                }}
              />
            </label>
          ))}
        </div>
      )}
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
      ) : !isForkNode && selectedNode ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          No schema for this plugin. Add a schema to edit more properties.
        </div>
      ) : (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          No schema for this plugin. Edit node data in code or add a schema.
        </div>
      )}
    </aside>
  );
}
