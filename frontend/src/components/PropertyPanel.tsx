import { useCallback, useEffect, useState } from 'react';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { CanvasNode } from '../types';
import type { PluginSchema } from '../types';
import type { api } from '../api';

interface PropertyPanelProps {
  selectedNodeId: string | null;
  nodes: CanvasNode[];
  configJson: Record<string, unknown>;
  onUpdateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  api: typeof import('../api').api;
}

export function PropertyPanel({
  selectedNodeId,
  nodes,
  configJson,
  onUpdateNodeData,
  api,
}: PropertyPanelProps) {
  const [schema, setSchema] = useState<PluginSchema | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;

  useEffect(() => {
    if (!selectedNode) {
      setSchema(null);
      setFormData({});
      return;
    }
    api.getComponentSchema(selectedNode.pluginId).then((s) => {
      setSchema(s);
      const nodeData = (configJson[selectedNode.id] as Record<string, unknown>) ?? selectedNode.data ?? {};
      setFormData(nodeData);
    }).catch(() => {
      setSchema(null);
      setFormData(selectedNode.data ?? {});
    });
  }, [selectedNodeId, selectedNode?.id, selectedNode?.pluginId, configJson, api]);

  const onSubmit = useCallback(
    ({ formData: fd }: { formData: Record<string, unknown> }) => {
      if (selectedNodeId) onUpdateNodeData(selectedNodeId, fd);
    },
    [selectedNodeId, onUpdateNodeData]
  );

  if (!selectedNodeId || !selectedNode) {
    return (
      <aside
        style={{
          width: 280,
          background: 'var(--bg-panel)',
          borderLeft: '1px solid var(--border)',
          padding: 20,
          color: 'var(--text-muted)',
          fontSize: '0.9rem',
        }}
      >
        Select a node to configure
      </aside>
    );
  }

  const jsonSchema = schema?.properties as Record<string, unknown> | undefined;

  return (
    <aside
      style={{
        width: 320,
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border)',
        padding: 16,
        overflowY: 'auto',
      }}
    >
      <div style={{ marginBottom: 12, fontWeight: 600 }}>{selectedNode.pluginId}</div>
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
