import { useState } from 'react';
import type { Template, OloConfig } from '../types';

const inputStyle = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  color: 'var(--text)',
} as const;

function PipelineDropdown({
  pipelineNames,
  selectedPipelineId,
  onPipelineSelect,
  onAddPipeline,
  onDeletePipeline,
  inputStyle: style,
}: {
  pipelineNames: string[];
  selectedPipelineId: string | null;
  onPipelineSelect: (id: string | null) => void;
  onAddPipeline: (customName?: string) => void;
  onDeletePipeline: () => void;
  inputStyle: React.CSSProperties;
}) {
  const handleAdd = () => {
    const name = window.prompt('Enter pipeline name:');
    if (name == null) return;
    const trimmed = name.trim();
    onAddPipeline(trimmed || undefined);
  };

  return (
    <>
      <select
        style={{ ...style, minWidth: 160 }}
        value={selectedPipelineId ?? ''}
        onChange={(e) => {
          const id = e.target.value;
          onPipelineSelect(id || null);
        }}
        title="Select pipeline"
      >
        <option value="">Select pipeline…</option>
        {pipelineNames.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleAdd}
        className="form-actions secondary"
        style={{ padding: '6px 10px', fontSize: '0.85rem' }}
        title="Add pipeline"
      >
        +
      </button>
      <button
        type="button"
        onClick={onDeletePipeline}
        disabled={pipelineNames.length === 0 || !selectedPipelineId}
        className="form-actions secondary"
        style={{ padding: '6px 10px', fontSize: '0.85rem' }}
        title="Remove selected pipeline"
      >
        −
      </button>
    </>
  );
}

interface HeaderProps {
  templates: Template[];
  configs: OloConfig[];
  currentConfigName: string;
  selectedTemplateId: string | null;
  onTemplateSelect: (t: Template) => void;
  pipelineNames: string[];
  selectedPipelineId: string | null;
  onPipelineSelect: (id: string | null) => void;
  onAddPipeline: (customName?: string) => void;
  onDeletePipeline: () => void;
  onConfigSelect: (name: string) => void;
  /** Save current config to olo:engine:config:{name} (name from New dialog). */
  onSaveAsNew: (name: string) => void;
  onSave: () => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
}

export function Header({
  templates,
  configs,
  currentConfigName,
  selectedTemplateId,
  onTemplateSelect,
  pipelineNames,
  selectedPipelineId,
  onPipelineSelect,
  onAddPipeline,
  onDeletePipeline,
  onConfigSelect,
  onSaveAsNew,
  onSave,
  saveStatus,
}: HeaderProps) {
  const [newConfigModalOpen, setNewConfigModalOpen] = useState(false);
  const [newConfigNameInput, setNewConfigNameInput] = useState('');

  const handleNewClick = () => {
    setNewConfigNameInput(currentConfigName || '');
    setNewConfigModalOpen(true);
  };

  const handleNewConfigSubmit = () => {
    const name = newConfigNameInput.trim();
    if (!name) return;
    onSaveAsNew(name);
    setNewConfigModalOpen(false);
    setNewConfigNameInput('');
  };

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 20px',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: '1.1rem', marginRight: 8 }}>OLO Config</span>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="Templates are read-only. Export your work as a new configuration to save.">
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Template (read-only)</span>
        <select
          style={{ ...inputStyle, minWidth: 160 }}
          value={selectedTemplateId ?? ''}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            const t = templates.find((x) => x.id === id);
            if (t) onTemplateSelect(t);
          }}
        >
          <option value="">Select template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Pipeline</span>
        <PipelineDropdown
          pipelineNames={pipelineNames}
          selectedPipelineId={selectedPipelineId}
          onPipelineSelect={onPipelineSelect}
          onAddPipeline={onAddPipeline}
          onDeletePipeline={onDeletePipeline}
          inputStyle={inputStyle}
        />
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Saved config</span>
        <select
          style={{ ...inputStyle, minWidth: 160 }}
          value={currentConfigName}
          onChange={(e) => {
            const name = e.target.value;
            if (name) onConfigSelect(name);
          }}
          title="Currently loaded config; select another to load it"
        >
          <option value="">Load saved config…</option>
          {configs.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
          {currentConfigName && !configs.some((c) => c.name === currentConfigName) && (
            <option value={currentConfigName}>{currentConfigName}</option>
          )}
        </select>
      </label>

      {currentConfigName ? (
        <button
          type="button"
          onClick={onSave}
          className="form-actions primary"
          disabled={saveStatus === 'saving'}
          title="Update the current configuration at olo:engine:config:{name}"
        >
          {saveStatus === 'saving' ? 'Updating…' : saveStatus === 'saved' ? 'Updated' : 'Update'}
        </button>
      ) : null}
      <button
        type="button"
        onClick={handleNewClick}
        className="form-actions secondary"
        disabled={saveStatus === 'saving'}
        title="Save current configuration at olo:engine:config:{name} (name from dialog)"
      >
        New
      </button>
      {saveStatus === 'error' && (
        <span style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>Save failed</span>
      )}

      {newConfigModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-config-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => e.target === e.currentTarget && setNewConfigModalOpen(false)}
        >
          <div
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 20,
              minWidth: 320,
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="new-config-title" style={{ margin: '0 0 12px', fontSize: '1rem' }}>
              New configuration
            </h2>
            <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Configuration will be stored at olo:engine:config:&lt;name&gt;. Enter a name:
            </p>
            <input
              type="text"
              value={newConfigNameInput}
              onChange={(e) => setNewConfigNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNewConfigSubmit()}
              placeholder="Configuration name"
              autoFocus
              style={{ ...inputStyle, width: '100%', marginBottom: 16, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="form-actions secondary"
                onClick={() => setNewConfigModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="form-actions primary"
                onClick={handleNewConfigSubmit}
                disabled={!newConfigNameInput.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
