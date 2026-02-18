import { useState, useCallback } from 'react';
import type { ComponentSummary } from '../types';

const ICONS: Record<string, string> = {
  play_arrow: '▶',
  stop: '■',
  call_split: '⊳',
  loop: '↻',
  fork_right: '⚇',
  merge: '⚈',
  parallel: '∥',
  compress: '⨴',
  psychology: '🧠',
  search: '🔍',
  code: '📝',
  account_tree: '🔀',
  extension: '🧩',
};

function getIcon(iconName?: string): string {
  return iconName && ICONS[iconName] ? ICONS[iconName] : ICONS.extension;
}

/** Section order for left panel: driven by category from API (components/templates), no hardcoded ids. */
const SECTION_ORDER = ['flow', 'control', 'plugin'];

function sectionTitle(sectionId: string): string {
  const t = (sectionId || 'plugin').toLowerCase();
  if (t === 'flow') return 'Flow';
  if (t === 'control') return 'Control';
  if (t === 'plugin') return 'Plugins';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

interface ComponentPaletteProps {
  components: ComponentSummary[];
}

/** Collapsible section: only name in header; children shown when expanded. */
function CollapsibleSection({
  sectionId,
  title,
  children,
  defaultOpen = true,
  isOpen,
  onToggle,
}: {
  sectionId: string;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggle?: (id: string) => void;
}) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = onToggle !== undefined ? isOpen ?? localOpen : localOpen;
  const toggle = useCallback(() => {
    if (onToggle) onToggle(sectionId);
    else setLocalOpen((o) => !o);
  }, [sectionId, onToggle]);

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '6px 8px',
          border: 'none',
          background: 'transparent',
          color: 'var(--text-muted)',
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>▾</span>
        {title}
      </button>
      {open ? <div style={{ marginTop: 4 }}>{children}</div> : null}
    </div>
  );
}

export function ComponentPalette({ components }: ComponentPaletteProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const onDragStart = (e: React.DragEvent, componentId: string) => {
    e.dataTransfer.setData('application/olo-plugin', componentId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const toggleSection = useCallback((sectionId: string) => {
    setOpenSections((prev) => ({ ...prev, [sectionId]: !(prev[sectionId] ?? false) }));
  }, []);

  const bySection = new Map<string, ComponentSummary[]>();
  for (const c of components) {
    const section = (c.category || (c.type === 'plugin' ? 'plugin' : c.type === 'container' ? 'control' : 'flow')).toLowerCase();
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section)!.push(c);
  }
  for (const list of bySection.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  const sections = SECTION_ORDER.filter((s) => bySection.has(s));
  const otherCategories = [...bySection.keys()].filter((k) => !SECTION_ORDER.includes(k)).sort();
  const allSectionIds = [...sections, ...otherCategories];

  const renderItem = (c: ComponentSummary) => (
    <div
      key={c.id}
      draggable
      onDragStart={(e) => onDragStart(e, c.id)}
      title={c.description ?? undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        background: 'var(--bg-elevated)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        cursor: 'grab',
        fontSize: '0.9rem',
        marginBottom: 6,
      }}
    >
      <span style={{ fontSize: '1.1rem' }}>{getIcon(c.icon)}</span>
      <span style={{ fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {c.name}
      </span>
    </div>
  );

  return (
    <aside
      style={{
        width: 240,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border)',
        padding: 12,
        overflowY: 'auto',
      }}
    >
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase' }}>
        Components — drag to canvas
      </div>
      {allSectionIds.map((sectionId) => {
        const list = bySection.get(sectionId) ?? [];
        if (list.length === 0) return null;
        return (
          <CollapsibleSection
            key={sectionId}
            sectionId={sectionId}
            title={`${sectionTitle(sectionId)} (${list.length})`}
            defaultOpen={false}
            isOpen={openSections[sectionId] ?? false}
            onToggle={toggleSection}
          >
            {list.map(renderItem)}
          </CollapsibleSection>
        );
      })}
      {components.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No components loaded.</div>
      )}
    </aside>
  );
}
