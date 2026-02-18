import { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
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
  );
}

const nodeTypes: NodeTypes = { plugin: PluginNode };

function toFlowNode(n: CanvasNode, components: ComponentSummary[]): Node {
  const comp = components.find((c) => c.id === n.pluginId);
  const data = {
    label: (n.data?.label as string) ?? comp?.name ?? n.pluginId,
    icon: comp?.icon ?? 'extension',
    pluginId: n.pluginId,
    ...n.data,
  };
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

  useEffect(() => {
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
    syncToParent(nodes, edges);
  }, [nodes, edges]);

  const onNodesChangeWrap: OnNodesChange = useCallback((changes) => {
    onNodesChange(changes);
  }, [onNodesChange]);

  const onConnect = useCallback(
    (conn: Connection) => {
      setEdges((eds) => addEdge(conn, eds));
    },
    [setEdges]
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
      const newNode: Node = {
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

  return (
    <div
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <ReactFlow
        className="react-flow"
        nodes={nodesWithSelection}
        edges={edges}
        onNodesChange={onNodesChangeWrap}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { strokeWidth: 3, stroke: '#6366f1' },
          markerEnd: { type: MarkerType.ArrowClosed, color: MARKER_COLOR },
          zIndex: 0,
        }}
        fitView
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        style={{ background: 'var(--bg-dark)' }}
        nodesDraggable
        nodesConnectable
        connectOnClick={false}
        elementsSelectable
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
