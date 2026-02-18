/**
 * Minimal React Flow with 2 nodes and 1 edge for testing edge visibility.
 * Open http://localhost:5173/minimal-flow.html
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ReactFlow, Background, Controls, MarkerType, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './index.css';

const initialNodes = [
  { id: 'a', type: 'default', position: { x: 0, y: 0 }, data: { label: 'Node A' }, sourcePosition: 'right' as const, targetPosition: 'left' as const },
  { id: 'b', type: 'default', position: { x: 200, y: 0 }, data: { label: 'Node B' }, sourcePosition: 'right' as const, targetPosition: 'left' as const },
];
const initialEdges = [
  { id: 'e-a-b', source: 'a', target: 'b', type: 'smoothstep', style: { strokeWidth: 4, stroke: '#6366f1' }, markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--accent)' } },
];

function MinimalFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        className="react-flow"
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        defaultEdgeOptions={{ type: 'smoothstep', style: { strokeWidth: 4, stroke: '#6366f1' }, markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--accent)' } }}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<MinimalFlow />);
