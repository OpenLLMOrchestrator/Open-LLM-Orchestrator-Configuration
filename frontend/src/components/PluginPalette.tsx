import type { PluginSummary } from '../types';

const ICONS: Record<string, string> = {
  psychology: '🧠',
  search: '🔍',
  code: '📝',
  account_tree: '🔀',
  extension: '🧩',
};

function getIcon(iconName?: string): string {
  return iconName && ICONS[iconName] ? ICONS[iconName] : ICONS.extension;
}

interface PluginPaletteProps {
  plugins: PluginSummary[];
}

export function PluginPalette({ plugins }: PluginPaletteProps) {
  const onDragStart = (e: React.DragEvent, pluginId: string) => {
    e.dataTransfer.setData('application/olo-plugin', pluginId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside
      style={{
        width: 220,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border)',
        padding: 12,
        overflowY: 'auto',
      }}
    >
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase' }}>
        Plugins — drag to canvas
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {plugins.map((p) => (
          <div
            key={p.id}
            draggable
            onDragStart={(e) => onDragStart(e, p.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              background: 'var(--bg-elevated)',
              borderRadius: 8,
              border: '1px solid var(--border)',
              cursor: 'grab',
              fontSize: '0.9rem',
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>{getIcon(p.icon)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>{p.name}</div>
              {p.description && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {p.description}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
