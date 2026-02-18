import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  reconnectEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
  type Connection,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeTypes,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { CanvasState, CanvasNode, CanvasEdge, ComponentSummary } from '../types';
import { CanvasContextMenu, type ContextMenuState } from './CanvasContextMenu';

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

function PluginNode({ data }: { data: { label?: string; icon?: string; _swimLane?: boolean } }) {
  const isLane = data._swimLane === true;
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Handle type="target" position={Position.Left} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 8,
          paddingRight: 8,
          ...(isLane && {
            borderLeft: '3px solid var(--accent)',
            paddingLeft: 6,
            background: 'rgba(99, 102, 241, 0.08)',
            margin: -10,
            padding: '10px 10px 10px 14px',
            borderRadius: 8,
          }),
        }}
      >
        <span>{ICONS[data.icon ?? ''] ?? '🧩'}</span>
        <span>{data.label ?? 'Node'}</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes: NodeTypes = { plugin: PluginNode };

/** Group with ASYNC or async component: display as Fork (FORK). */
function isForkDisplay(pluginId: string, data: Record<string, unknown>): boolean {
  if (pluginId === 'async') return true;
  if (pluginId === 'group' && (data?.executionMode as string) === 'ASYNC') return true;
  return false;
}

function toFlowNode(n: CanvasNode, components: ComponentSummary[]): Node {
  const comp = components.find((c) => c.id === n.pluginId);
  const data = {
    label: (n.data?.label as string) ?? comp?.name ?? n.pluginId,
    icon: comp?.icon ?? 'extension',
    pluginId: n.pluginId,
    ...n.data,
  };
  if (isForkDisplay(n.pluginId, data)) {
    const L = (data.label as string) ?? '';
    if (L === 'Group' || L === 'Async' || L === 'Async group') data.label = 'Fork (FORK)';
    data.icon = 'fork_right';
  }
  return {
    id: n.id,
    type: 'plugin',
    position: n.position,
    data,
    sourcePosition: 'right',
    targetPosition: 'left',
  };
}

const EDGE_STYLE = { strokeWidth: 3, stroke: '#6366f1' };
/* Use CSS variable for marker color so marker id has no '#' (url('#id') would break with # in id). */
const MARKER_COLOR = 'var(--accent)';

function toFlowEdge(e: CanvasEdge): Edge {
  return {
    id: e.id ?? `e-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    style: EDGE_STYLE,
    markerEnd: { type: MarkerType.ArrowClosed, color: MARKER_COLOR },
    zIndex: 0,
    selectable: true,
    reconnectable: true,
    interactionWidth: 24,
  };
}

function toCanvasNode(n: Node): CanvasNode {
  const data = n.data as Record<string, unknown>;
  return {
    id: n.id,
    pluginId: (data?.pluginId as string) ?? 'unknown',
    position: n.position,
    data,
  };
}

function toCanvasEdge(e: Edge): CanvasEdge {
  return { id: e.id, source: e.source, target: e.target };
}

/** Group may have at most one child of type IF/Iterator and at most one FORK and one JOIN. */
const GROUP_CHILD_IF_ITERATOR: string[] = ['condition', 'loop'];
const GROUP_CHILD_FORK_JOIN: string[] = ['fork', 'join'];

function getPluginId(node: Node | undefined): string | undefined {
  return (node?.data as Record<string, unknown>)?.pluginId as string | undefined;
}

/** Returns true if adding targetId as a child of groupId is allowed (group child restriction). */
function canGroupAddChild(
  nodes: Node[],
  currentChildIds: string[],
  targetId: string
): boolean {
  const targetNode = nodes.find((n) => n.id === targetId);
  const newPluginId = getPluginId(targetNode);
  if (!newPluginId) return true;
  const currentPluginIds = currentChildIds
    .map((id) => getPluginId(nodes.find((n) => n.id === id)))
    .filter((p): p is string => p != null);
  if (GROUP_CHILD_IF_ITERATOR.includes(newPluginId))
    return !currentPluginIds.some((p) => GROUP_CHILD_IF_ITERATOR.includes(p));
  if (GROUP_CHILD_FORK_JOIN.includes(newPluginId))
    return !currentPluginIds.includes(newPluginId);
  return true;
}

/** Returns true if connecting from sourceId to targetId is allowed (enforces group child restriction when source is a group). */
function canConnect(
  nodes: Node[],
  edges: Edge[],
  sourceId: string,
  targetId: string,
  excludeEdgeId?: string
): boolean {
  const sourceNode = nodes.find((n) => n.id === sourceId);
  if (getPluginId(sourceNode) !== 'group') return true;
  const currentChildIds = edges
    .filter((e) => e.source === sourceId && e.id !== excludeEdgeId)
    .map((e) => e.target);
  return canGroupAddChild(nodes, currentChildIds, targetId);
}

interface ConfigCanvasProps {
  canvasState: CanvasState;
  canvasStateKey: number;
  onCanvasChange: (state: CanvasState) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  components: ComponentSummary[];
}

export function ConfigCanvas({
  canvasState,
  canvasStateKey,
  onCanvasChange,
  selectedNodeId,
  onSelectNode,
  components,
}: ConfigCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(
    canvasState.nodes.map((n) => toFlowNode(n, components))
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    canvasState.edges.map(toFlowEdge)
  );
  const skipNextSyncRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [clipboard, setClipboard] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    skipNextSyncRef.current = true;
    setNodes(canvasState.nodes.map((n) => toFlowNode(n, components)));
    setEdges(canvasState.edges.map(toFlowEdge));
  }, [canvasStateKey]);

  const nodesWithSelection = nodes.map((n) => ({
    ...n,
    selected: n.id === selectedNodeId,
  }));

  const syncToParent = useCallback(
    (newNodes: Node[], newEdges: Edge[]) => {
      onCanvasChange({
        nodes: newNodes.map(toCanvasNode),
        edges: newEdges.map(toCanvasEdge),
      });
    },
    [onCanvasChange]
  );

  useEffect(() => {
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    syncToParent(nodes, edges);
  }, [nodes, edges, syncToParent]);

  const onNodesChangeWrap: OnNodesChange = useCallback((changes) => {
    onNodesChange(changes);
  }, [onNodesChange]);

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      if (!canConnect(nodes, edges, conn.source, conn.target)) {
        const targetNode = nodes.find((n) => n.id === conn.target);
        const pid = getPluginId(targetNode);
        const kind =
          GROUP_CHILD_IF_ITERATOR.includes(pid ?? '')
            ? 'IF/Iterator'
            : GROUP_CHILD_FORK_JOIN.includes(pid ?? '')
              ? 'Fork/Join'
              : 'plugin';
        alert(`This group may have only one ${kind} as a direct child.`);
        return;
      }
      setEdges((eds) => addEdge(conn, eds));
    },
    [nodes, edges, setEdges]
  );

  const onReconnect = useCallback(
    (_: React.MouseEvent | React.TouchEvent, edge: Edge, connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (!canConnect(nodes, edges, connection.source, connection.target, edge.id)) {
        const targetNode = nodes.find((n) => n.id === connection.target);
        const pid = getPluginId(targetNode);
        const kind =
          GROUP_CHILD_IF_ITERATOR.includes(pid ?? '')
            ? 'IF/Iterator'
            : GROUP_CHILD_FORK_JOIN.includes(pid ?? '')
              ? 'Fork/Join'
              : 'plugin';
        alert(`This group may have only one ${kind} as a direct child.`);
        return;
      }
      setEdges((eds) => reconnectEdge(edge, connection, eds));
    },
    [nodes, edges, setEdges]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const componentId = e.dataTransfer.getData('application/olo-plugin');
      if (!componentId) return;
      const bounds = (e.target as HTMLElement).getBoundingClientRect();
      const position = {
        x: e.clientX - bounds.left - 75,
        y: e.clientY - bounds.top - 20,
      };
      const nodeId = `node-${Date.now()}`;
      const comp = components.find((c) => c.id === componentId);
      const isCapability =
        componentId.startsWith('capability:') ||
        (comp?.category ?? '').toLowerCase() === 'capability';
      const capName = componentId.startsWith('capability:')
        ? componentId.slice('capability:'.length)
        : componentId;
      let newNode: Node;
      if (isCapability) {
        newNode = {
          id: nodeId,
          type: 'plugin',
          position,
          data: {
            label: comp?.name ?? capName,
            icon: 'account_tree',
            pluginId: 'group',
            _capability: capName,
          },
          sourcePosition: 'right',
          targetPosition: 'left',
        };
      } else {
        newNode = {
          id: nodeId,
          type: 'plugin',
          position,
          data: {
            label: comp?.name ?? componentId,
            icon: comp?.icon ?? 'extension',
            pluginId: componentId,
          },
          sourcePosition: 'right',
          targetPosition: 'left',
        };
      }
      setNodes((nds) => {
        const next = [...nds, newNode];
        setEdges((eds) => {
          syncToParent(next, eds);
          return eds;
        });
        return next;
      });
    },
    [components, setNodes, setEdges, syncToParent]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectNode(node.id);
    },
    [onSelectNode]
  );

  const onPaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  const onEdgeClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  const onPaneContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ clientX: e.clientX, clientY: e.clientY, nodeId: null, edgeId: null });
  }, []);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    setContextMenu({ clientX: e.clientX, clientY: e.clientY, nodeId: node.id, edgeId: null });
  }, []);

  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge) => {
    e.preventDefault();
    setContextMenu({ clientX: e.clientX, clientY: e.clientY, nodeId: null, edgeId: edge.id });
  }, []);

  const handleContextConnect = useCallback(
    (sourceId: string, targetId: string) => {
      if (!canConnect(nodes, edges, sourceId, targetId)) {
        const targetNode = nodes.find((n) => n.id === targetId);
        const pid = getPluginId(targetNode);
        const kind =
          GROUP_CHILD_IF_ITERATOR.includes(pid ?? '')
            ? 'IF/Iterator'
            : GROUP_CHILD_FORK_JOIN.includes(pid ?? '')
              ? 'Fork/Join'
              : 'plugin';
        alert(`This group may have only one ${kind} as a direct child.`);
        return;
      }
      setEdges((eds) => {
        const exists = eds.some((e) => e.source === sourceId && e.target === targetId);
        if (exists) return eds;
        return addEdge({ source: sourceId, target: targetId }, eds);
      });
    },
    [nodes, edges, setEdges]
  );

  const handleContextCopy = useCallback(() => {
    const selNodes = nodes.filter((n) => n.selected || n.id === contextMenu?.nodeId);
    const nodeIds = new Set(selNodes.map((n) => n.id));
    const copyNodes =
      selNodes.length > 0
        ? selNodes
        : contextMenu?.nodeId
          ? nodes.filter((n) => n.id === contextMenu.nodeId)
          : [];
    let copyEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
    if (contextMenu?.edgeId && nodeIds.size === 0) {
      const edge = edges.find((e) => e.id === contextMenu.edgeId);
      if (edge) copyEdges = [edge];
    }
    setClipboard(copyNodes.length > 0 || copyEdges.length > 0 ? { nodes: copyNodes, edges: copyEdges } : null);
  }, [nodes, edges, contextMenu?.nodeId, contextMenu?.edgeId]);

  const handleContextPaste = useCallback(
    (_position: { x: number; y: number }) => {
      if (!clipboard || (clipboard.nodes.length === 0 && clipboard.edges.length === 0)) return;
      const clip = clipboard;
      const offset = 80;
      const idMap = new Map<string, string>();
      const newNodes: Node[] = clip.nodes.map((n, i) => {
        const newId = `node-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`;
        idMap.set(n.id, newId);
        return {
          ...n,
          id: newId,
          position: { x: n.position.x + offset, y: n.position.y + offset },
          selected: false,
        };
      });
      const newEdges: Edge[] = clip.edges
        .map((e) => {
          const src = idMap.get(e.source);
          const tgt = idMap.get(e.target);
          if (src && tgt) return { ...e, id: `e-${src}-${tgt}`, source: src, target: tgt };
          return null;
        })
        .filter((e): e is Edge => e != null);
      setNodes((nds) => [...nds, ...newNodes]);
      setEdges((eds) => [...eds, ...newEdges]);
    },
    [clipboard, setNodes, setEdges]
  );

  const handleContextDelete = useCallback(() => {
    const selNodeIds = new Set(nodes.filter((n) => n.selected || n.id === contextMenu?.nodeId).map((n) => n.id));
    const selEdgeIds = new Set(edges.filter((e) => e.selected || e.id === contextMenu?.edgeId).map((e) => e.id));
    setNodes((nds) => nds.filter((n) => !selNodeIds.has(n.id)));
    setEdges((eds) => eds.filter((e) => !selEdgeIds.has(e.id) && !selNodeIds.has(e.source) && !selNodeIds.has(e.target)));
    onSelectNode(null);
  }, [nodes, edges, contextMenu?.nodeId, contextMenu?.edgeId, onSelectNode, setNodes, setEdges]);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <CanvasContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        nodes={nodesWithSelection}
        edges={edges}
        onConnect={handleContextConnect}
        canConnectTo={(src, tgt) => canConnect(nodes, edges, src, tgt)}
        onCopy={handleContextCopy}
        onPaste={handleContextPaste}
        onDelete={handleContextDelete}
        hasClipboard={clipboard != null && (clipboard.nodes.length > 0 || clipboard.edges.length > 0)}
      />
      <ReactFlow
        className="react-flow"
        nodes={nodesWithSelection}
        edges={edges}
        onNodesChange={onNodesChangeWrap}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { strokeWidth: 3, stroke: '#6366f1' },
          markerEnd: { type: MarkerType.ArrowClosed, color: MARKER_COLOR },
          zIndex: 0,
          selectable: true,
          reconnectable: true,
          interactionWidth: 24,
        }}
        fitView
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        style={{ background: 'var(--bg-dark)' }}
        nodesDraggable
        nodesConnectable
        connectOnClick={false}
        elementsSelectable
        edgesReconnectable
        edgesFocusable
        elevateEdgesOnSelect={true}
        selectNodesOnDrag={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--border)" gap={16} />
        <Controls />
        <MiniMap
          nodeColor="var(--node-bg)"
          maskColor="rgba(0,0,0,0.6)"
        />
        <Panel position="top-left" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          Drop plugins here · Connect with edges
        </Panel>
      </ReactFlow>
    </div>
  );
}
