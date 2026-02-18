import React, { useCallback, useEffect } from 'react';
import type { Node, Edge } from '@xyflow/react';

export interface ContextMenuState {
  /** Screen position for menu (position: fixed) */
  clientX: number;
  clientY: number;
  /** Right-click on a node: show "Connect to" options */
  nodeId: string | null;
  /** Right-click on an edge */
  edgeId: string | null;
}

export interface CanvasContextMenuProps {
  state: ContextMenuState | null;
  onClose: () => void;
  nodes: Node[];
  edges: Edge[];
  onConnect: (sourceId: string, targetId: string) => void;
  /** If provided, "Connect to" options are disabled when this returns false (e.g. group child restriction). */
  canConnectTo?: (sourceId: string, targetId: string) => boolean;
  onCopy: () => void;
  onPaste: (position: { x: number; y: number }) => void;
  onDelete: () => void;
  hasClipboard: boolean;
}

export function CanvasContextMenu({
  state,
  onClose,
  nodes,
  edges,
  onConnect,
  canConnectTo,
  onCopy,
  onPaste,
  onDelete,
  hasClipboard,
}: CanvasContextMenuProps) {
  const selectedNodeIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
  const selectedEdgeIds = new Set(edges.filter((e) => e.selected).map((e) => e.id));
  const hasSelection = selectedNodeIds.size > 0 || selectedEdgeIds.size > 0;
  const sourceNodeId = state?.nodeId ?? null;
  const otherNodes = nodes.filter((n) => n.id !== sourceNodeId);

  const handleConnect = useCallback(
    (targetId: string) => {
      if (sourceNodeId) onConnect(sourceNodeId, targetId);
      onClose();
    },
    [sourceNodeId, onConnect, onClose]
  );

  const handlePaste = useCallback(() => {
    onPaste({ x: 0, y: 0 });
    onClose();
  }, [onPaste, onClose]);

  const handleDelete = useCallback(() => {
    onDelete();
    onClose();
  }, [onDelete, onClose]);

  const handleCopy = useCallback(() => {
    onCopy();
    onClose();
  }, [onCopy, onClose]);

  useEffect(() => {
    if (!state) return;
    const onPointerDown = () => onClose();
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('contextmenu', onContextMenu);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, [state, onClose]);

  if (!state) return null;

  const style: React.CSSProperties = {
    position: 'fixed',
    left: state.clientX,
    top: state.clientY,
    zIndex: 1000,
    minWidth: 180,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    padding: '4px 0',
    listStyle: 'none',
    margin: 0,
    fontFamily: 'inherit',
    fontSize: '0.9rem',
  };

  const itemStyle: React.CSSProperties = {
    padding: '8px 14px',
    cursor: 'pointer',
    color: 'var(--text)',
    display: 'block',
    width: '100%',
    textAlign: 'left',
    border: 'none',
    background: 'none',
  };

  const itemHover = {
    ...itemStyle,
    background: 'var(--border)',
  };

  const submenuStyle: React.CSSProperties = {
    ...style,
    left: state.clientX + 180,
    top: state.clientY,
    maxHeight: 280,
    overflowY: 'auto' as const,
  };

  const showConnectTo = sourceNodeId != null && otherNodes.length > 0;
  const showCopy = hasSelection || sourceNodeId != null || state.edgeId != null;
  const showPaste = hasClipboard;
  const showDelete = hasSelection || sourceNodeId != null || state.edgeId != null;

  return (
    <ul className="canvas-context-menu" style={style} role="menu">
      {showConnectTo && (
        <li role="none" style={{ position: 'relative' }}>
          <button
            type="button"
            role="menuitem"
            style={itemStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--border)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '';
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            Connect to →
          </button>
          <ul style={submenuStyle} role="menu" className="canvas-context-submenu">
            {otherNodes.map((n) => {
              const allowed = canConnectTo == null || canConnectTo(sourceNodeId!, n.id);
              return (
                <li key={n.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    style={{
                      ...itemStyle,
                      ...(allowed ? {} : { opacity: 0.6, cursor: 'not-allowed' }),
                    }}
                    title={allowed ? undefined : 'Group may have only one IF/Iterator and one Fork/Join as direct children'}
                    disabled={!allowed}
                    onMouseEnter={(e) => {
                      if (allowed) e.currentTarget.style.background = 'var(--border)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '';
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (allowed) handleConnect(n.id);
                    }}
                  >
                    {(n.data?.label as string) ?? n.id}
                  </button>
                </li>
              );
            })}
          </ul>
        </li>
      )}
      {showCopy && (
        <li role="none">
          <button
            type="button"
            role="menuitem"
            style={itemStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--border)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '';
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
          >
            Copy
          </button>
        </li>
      )}
      {showPaste && (
        <li role="none">
          <button
            type="button"
            role="menuitem"
            style={itemStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--border)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '';
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              handlePaste();
            }}
          >
            Paste
          </button>
        </li>
      )}
      {showDelete && (
        <li role="none">
          <button
            type="button"
            role="menuitem"
            style={{ ...itemStyle, color: 'var(--danger)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--border)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '';
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
          >
            Delete
          </button>
        </li>
      )}
      {!showConnectTo && !showCopy && !showPaste && !showDelete && (
        <li role="none" style={{ ...itemStyle, cursor: 'default', color: 'var(--text-muted)' }}>
          No actions
        </li>
      )}
    </ul>
  );
}
