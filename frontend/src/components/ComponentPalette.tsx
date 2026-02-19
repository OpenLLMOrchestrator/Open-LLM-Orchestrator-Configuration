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

/** Section order: capability, flow, control, then plugins as root with sub-hierarchy. */
const SECTION_ORDER = ['capability', 'flow', 'control', 'plugin'];

function sectionTitle(sectionId: string): string {
  const t = (sectionId || 'plugin').toLowerCase();
  if (t === 'capability') return 'Capability';
  if (t === 'flow') return 'Flow';
  if (t === 'control') return 'Control';
  if (t === 'plugin') return 'Plugins';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Categories that mean "no type" / applicable for all capabilities. */
const APPLICABLE_FOR_ALL_CATEGORIES = new Set(['', 'general', 'plugin', 'undefined']);

/** Group plugins by category. Plugins with no type/category are added to every capability section (applicable for all). */
function groupPluginsByCategory(
  components: ComponentSummary[],
  capabilityIds: string[]
): Map<string, ComponentSummary[]> {
  const plugins = components.filter((c) => (c.type || '').toLowerCase() === 'plugin');
  const byCategory = new Map<string, ComponentSummary[]>();
  const applicableForAll: ComponentSummary[] = [];

  for (const p of plugins) {
    const raw = (p.category ?? '').trim().toLowerCase();
    if (!raw || APPLICABLE_FOR_ALL_CATEGORIES.has(raw)) {
      applicableForAll.push(p);
      continue;
    }
    const componentName = raw.charAt(0).toUpperCase() + raw.slice(1);
    if (!byCategory.has(componentName)) byCategory.set(componentName, []);
    byCategory.get(componentName)!.push(p);
  }

  for (const capId of capabilityIds) {
    const key = capId.charAt(0).toUpperCase() + capId.slice(1).toLowerCase();
    if (!byCategory.has(key)) byCategory.set(key, []);
    const list = byCategory.get(key)!;
    for (const p of applicableForAll) {
      if (!list.includes(p)) list.push(p);
    }
  }
  if (applicableForAll.length > 0) {
    byCategory.set('General', applicableForAll);
  }
  for (const list of byCategory.values()) {
    list.sort((a, b) => (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name));
  }
  return byCategory;
}

interface ComponentPaletteProps {
  components: ComponentSummary[];
  /** Called when user adds a new capability (creates template in components/capability). */
  onAddCapability?: (name: string) => void | Promise<void>;
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

export function ComponentPalette({
  components,
  onAddCapability,
}: ComponentPaletteProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [newCapabilityName, setNewCapabilityName] = useState('');
  const [addingCapability, setAddingCapability] = useState(false);

  const onDragStart = (e: React.DragEvent, componentId: string) => {
    e.dataTransfer.setData('application/olo-plugin', componentId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const toggleSection = useCallback((sectionId: string) => {
    setOpenSections((prev) => ({ ...prev, [sectionId]: !(prev[sectionId] ?? false) }));
  }, []);

  const capabilityFromApi = components.filter((c) => (c.category || '').toLowerCase() === 'capability');
  const apiCapabilityIds = new Set(capabilityFromApi.map((c) => c.id));
  const capabilityIds = capabilityFromApi.map((c) => c.id);

  const addCapability = useCallback(async () => {
    const name = newCapabilityName.trim().toUpperCase().replace(/\s+/g, '_');
    if (!name || !onAddCapability) return;
    if (apiCapabilityIds.has(name)) return;
    setAddingCapability(true);
    try {
      await onAddCapability(newCapabilityName.trim());
      setNewCapabilityName('');
    } finally {
      setAddingCapability(false);
    }
  }, [newCapabilityName, onAddCapability, apiCapabilityIds]);

  const bySection = new Map<string, ComponentSummary[]>();
  for (const c of components) {
    if ((c.category || '').toLowerCase() === 'capability') continue;
    if ((c.type || '').toLowerCase() === 'plugin') continue;
    const section = (c.category || (c.type === 'container' ? 'control' : 'flow')).toLowerCase();
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section)!.push(c);
  }
  for (const list of bySection.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  const pluginByCategory = groupPluginsByCategory(components, capabilityIds);
  const pluginCount = Array.from(pluginByCategory.values()).reduce((sum, list) => sum + list.length, 0);
  const sections = SECTION_ORDER.filter((s) => s === 'capability' || s === 'plugin' || bySection.has(s));
  const otherCategories = [...bySection.keys()].filter((k) => !SECTION_ORDER.includes(k)).sort();
  const allSectionIds = [...sections, ...otherCategories];

  /** Flow and Control are open by default so components are visible; Capability and Plugins stay collapsed. */
  const defaultOpenForSection = (sectionId: string) =>
    sectionId === 'flow' || sectionId === 'control';

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
        {c.displayName ?? c.name}
      </span>
    </div>
  );

  return (
    <aside
      style={{
        width: '100%',
        minWidth: 0,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border)',
        padding: 12,
        overflowY: 'auto',
        flex: 1,
      }}
    >
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase' }}>
        Components — drag to canvas
      </div>
      {allSectionIds.map((sectionId) => {
        if (sectionId === 'capability') {
          return (
            <CollapsibleSection
              key="capability"
              sectionId="capability"
              title={`Capability (${capabilityFromApi.length})`}
              defaultOpen={false}
              isOpen={openSections.capability ?? false}
              onToggle={toggleSection}
            >
              {capabilityFromApi.map(renderItem)}
              {onAddCapability && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="New capability name"
                    value={newCapabilityName}
                    onChange={(e) => setNewCapabilityName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCapability()}
                    style={{
                      flex: 1,
                      minWidth: 100,
                      padding: '6px 8px',
                      fontSize: '0.85rem',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      background: 'var(--bg-elevated)',
                      color: 'var(--text)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => addCapability()}
                    disabled={addingCapability}
                    style={{
                      padding: '6px 10px',
                      fontSize: '0.85rem',
                      border: '1px solid var(--accent)',
                      borderRadius: 6,
                      background: 'var(--accent)',
                      color: 'white',
                      cursor: addingCapability ? 'wait' : 'pointer',
                    }}
                  >
                    {addingCapability ? 'Adding…' : 'Add'}
                  </button>
                </div>
              )}
            </CollapsibleSection>
          );
        }
        if (sectionId === 'plugin') {
          if (pluginCount === 0) return null;
          return (
            <CollapsibleSection
              key="plugin"
              sectionId="plugin"
              title={`Plugins (${pluginCount})`}
              defaultOpen={false}
              isOpen={openSections.plugin ?? false}
              onToggle={toggleSection}
            >
              <div style={{ marginLeft: 4 }}>
                {Array.from(pluginByCategory.entries())
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([componentName, list]) => {
                    const subKey = `plugin:${componentName}`;
                    return (
                      <CollapsibleSection
                        key={subKey}
                        sectionId={subKey}
                        title={`${componentName} (${list.length})`}
                        defaultOpen={false}
                        isOpen={openSections[subKey] ?? false}
                        onToggle={toggleSection}
                      >
                        {list.map(renderItem)}
                      </CollapsibleSection>
                    );
                  })}
              </div>
            </CollapsibleSection>
          );
        }
        const list = bySection.get(sectionId) ?? [];
        if (list.length === 0) return null;
        return (
          <CollapsibleSection
            key={sectionId}
            sectionId={sectionId}
            title={`${sectionTitle(sectionId)} (${list.length})`}
            defaultOpen={defaultOpenForSection(sectionId)}
            isOpen={openSections[sectionId] ?? undefined}
            onToggle={toggleSection}
          >
            {list.map(renderItem)}
          </CollapsibleSection>
        );
      })}
      {components.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No components loaded.</div>
      )}
      {components.length > 0 && allSectionIds.every((id) => {
        if (id === 'capability') return capabilityFromApi.length === 0;
        if (id === 'plugin') return pluginCount === 0;
        return (bySection.get(id) ?? []).length === 0;
      }) && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 8 }}>
          No sections match. Check component type/category from API.
        </div>
      )}
    </aside>
  );
}
