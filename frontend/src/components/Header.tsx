import type { Template, OloConfig } from '../types';

interface HeaderProps {
  templates: Template[];
  configs: OloConfig[];
  currentConfigName: string;
  onTemplateSelect: (t: Template) => void;
  onConfigSelect: (name: string) => void;
  onNewConfig: () => void;
  onConfigNameChange: (name: string) => void;
  onSave: () => void;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
}

export function Header({
  templates,
  configs,
  currentConfigName,
  onTemplateSelect,
  onConfigSelect,
  onNewConfig,
  onConfigNameChange,
  onSave,
  saveStatus,
}: HeaderProps) {
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

      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Template</span>
        <select
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: 'var(--text)',
            minWidth: 160,
          }}
          value=""
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
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Config</span>
        <input
          type="text"
          placeholder="Config name"
          value={currentConfigName}
          onChange={(e) => onConfigNameChange(e.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: 'var(--text)',
            width: 180,
          }}
        />
      </label>

      <select
        style={{
          padding: '6px 10px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          color: 'var(--text)',
          minWidth: 140,
        }}
        value=""
        onChange={(e) => {
          const name = e.target.value;
          if (name) onConfigSelect(name);
          e.target.value = '';
        }}
      >
        <option value="">Load saved…</option>
        {configs.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={onNewConfig}
        className="form-actions secondary"
        style={{ marginLeft: 8 }}
      >
        New
      </button>
      <button
        type="button"
        onClick={onSave}
        className="form-actions primary"
        disabled={saveStatus === 'saving'}
      >
        {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save'}
      </button>
      {saveStatus === 'error' && (
        <span style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>Save failed or name empty</span>
      )}
    </header>
  );
}
