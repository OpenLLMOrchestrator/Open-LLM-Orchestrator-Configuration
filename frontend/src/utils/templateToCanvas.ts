import type { CanvasNode, CanvasEdge, CanvasState } from '../types';

const NODE_W = 140;
const NODE_H = 44;
const GAP_X = 50;
const GAP_Y = 56;
const MAIN_ROW_Y = 40;
const CAP_TO_GROUP_DY = 70;
const GROUP_TO_CONTENT_DY = 58;
const SWIM_LANE_DY = 52;

interface ChildNode {
  type: string;
  name?: string;
  pluginType?: string;
}

interface StageConfig {
  type?: string;
  executionMode?: string;
  children?: ChildNode[];
  condition?: string;
  thenGroup?: { children?: ChildNode[] };
  elseGroup?: { children?: ChildNode[] };
  elseifBranches?: Array<{ condition?: string; thenGroup?: { children?: ChildNode[] } }>;
}

interface EngineConfig {
  pipelines?: Record<
    string,
    {
      root?: Record<string, StageConfig>;
      defaultTimeoutSeconds?: number;
    }
  >;
  capabilityOrder?: string[];
  stageOrder?: string[];
}

function pluginLabel(name?: string): string {
  if (!name || typeof name !== 'string') return 'Plugin';
  const parts = name.split(/\./);
  return parts[parts.length - 1] || name;
}

/**
 * Tree: Start → Capability → … → End (main flow).
 * Each Capability → Group. Group → content: single Plugin, or Fork (sync/swim lanes) → lanes → Join (reducer), or Condition (if/else/elseif), or Iterator (loop).
 * If pipelineId is given, uses that pipeline's root; otherwise uses the first pipeline.
 */
export function engineConfigToCanvasState(
  config: EngineConfig,
  pipelineId?: string
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  const pipelines = config.pipelines;
  if (!pipelines || typeof pipelines !== 'object') return { nodes, edges };

  const pipeline =
    pipelineId != null && pipelines[pipelineId]
      ? (pipelines[pipelineId] as { root?: Record<string, StageConfig> })
      : (Object.values(pipelines)[0] as { root?: Record<string, StageConfig> } | undefined);
  if (!pipeline?.root || typeof pipeline.root !== 'object') return { nodes, edges };

  const root = pipeline.root;
  // Use pipeline root key order so UI matches the order as stored in the config (e.g. RETRIEVAL → MODEL → POST_PROCESS).
  const order: string[] = Object.keys(root);

  let baseX = 30;

  // —— Main flow: Start → Cap1 → Cap2 → … → End ——
  const startId = 'node-start';
  nodes.push({
    id: startId,
    pluginId: 'start',
    position: { x: baseX, y: MAIN_ROW_Y },
    data: { label: 'Start' },
  });
  baseX += NODE_W + GAP_X;

  const capIds: string[] = [];
  for (const capName of order) {
    const stage = root[capName];
    if (!stage || typeof stage !== 'object') continue;
    const capId = `cap-${capName}`;
    capIds.push(capId);
    nodes.push({
      id: capId,
      pluginId: 'group',
      position: { x: baseX, y: MAIN_ROW_Y },
      data: { label: capName, _capability: capName, executionMode: stage.executionMode ?? 'SYNC' },
    });
    baseX += NODE_W + GAP_X;
  }

  const endId = 'node-end';
  nodes.push({
    id: endId,
    pluginId: 'end',
    position: { x: baseX, y: MAIN_ROW_Y },
    data: { label: 'End' },
  });

  // Main flow edges
  let mainPrev = startId;
  for (const capId of capIds) {
    edges.push({ id: `e-${mainPrev}-${capId}`, source: mainPrev, target: capId });
    mainPrev = capId;
  }
  edges.push({ id: `e-${mainPrev}-${endId}`, source: mainPrev, target: endId });

  // —— Under each capability: Cap → Group → content (tree with fork/join, condition, iterator) ——
  const groupRowY = MAIN_ROW_Y + CAP_TO_GROUP_DY;
  let capIndex = 0;
  for (const capName of order) {
    const stage = root[capName];
    if (!stage || typeof stage !== 'object') continue;
    const capId = capIds[capIndex];
    const capCenterX = 30 + (NODE_W + GAP_X) * (capIndex + 1) + NODE_W / 2;
    capIndex++;

    const executionMode = stage.executionMode ?? 'SYNC';
    const children = Array.isArray(stage.children) ? stage.children : [];
    const hasCondition = stage.condition != null;
    const isAsyncMultiChild = executionMode === 'ASYNC' && children.length > 1;

    const groupId = `grp-${capName}`;
    if (!isAsyncMultiChild) {
      nodes.push({
        id: groupId,
        pluginId: 'group',
        position: { x: capCenterX - NODE_W / 2, y: groupRowY },
        data: { label: 'Group', executionMode, _capability: capName },
      });
      edges.push({ id: `e-${capId}-${groupId}`, source: capId, target: groupId });
    }

    const contentY = groupRowY + GROUP_TO_CONTENT_DY;

    if (hasCondition) {
      const condId = `cond-${capName}`;
      nodes.push({
        id: condId,
        pluginId: 'condition',
        position: { x: capCenterX - NODE_W / 2, y: contentY },
        data: { label: 'If/Else', conditionPlugin: stage.condition },
      });
      edges.push({ id: `e-${groupId}-${condId}`, source: groupId, target: condId });
      const thenY = contentY + SWIM_LANE_DY;
      const thenId = `then-${capName}`;
      nodes.push({
        id: thenId,
        pluginId: 'group',
        position: { x: capCenterX - NODE_W - GAP_X / 2, y: thenY },
        data: { label: 'Then' },
      });
      edges.push({ id: `e-${condId}-${thenId}`, source: condId, target: thenId });
      const elseId = `else-${capName}`;
      nodes.push({
        id: elseId,
        pluginId: 'group',
        position: { x: capCenterX + GAP_X / 2, y: thenY },
        data: { label: 'Else' },
      });
      edges.push({ id: `e-${condId}-${elseId}`, source: condId, target: elseId });
    } else if (children.length === 0) {
      // no children
    } else if (children.length === 1) {
      const nodeId = `plg-${capName}-0`;
      const pluginId = children[0].name ?? children[0].pluginType ?? 'plugin';
      const label = pluginLabel(children[0].name);
      nodes.push({
        id: nodeId,
        pluginId,
        position: { x: capCenterX - NODE_W / 2, y: contentY },
        data: { label, _pluginName: children[0].name, _pluginType: children[0].pluginType },
      });
      edges.push({ id: `e-${groupId}-${nodeId}`, source: groupId, target: nodeId });
    } else {
      // Multiple children: [Cap or Group] → Fork → lanes (plugins in parallel) → Join (Reducer)
      // When ASYNC, cap connects directly to ASYNC FORK (no intermediate group).
      const forkId = `fork-${capName}`;
      const joinId = `join-${capName}`;
      const joinY = contentY + SWIM_LANE_DY + children.length * SWIM_LANE_DY * 2;
      const forkLabel = executionMode === 'ASYNC' ? 'ASYNC FORK' : 'Sync (Fork)';
      nodes.push({
        id: forkId,
        pluginId: 'fork',
        position: { x: capCenterX - NODE_W / 2, y: contentY },
        data: { label: forkLabel, executionMode, _capability: capName },
      });
      nodes.push({
        id: joinId,
        pluginId: 'reducer',
        position: { x: capCenterX - NODE_W / 2, y: joinY },
        data: { label: 'Join (Reducer)', _capability: capName },
      });
      if (isAsyncMultiChild) {
        edges.push({ id: `e-${capId}-${forkId}`, source: capId, target: forkId });
      } else {
        edges.push({ id: `e-${groupId}-${forkId}`, source: groupId, target: forkId });
      }

      const isSync = executionMode === 'SYNC';
      children.forEach((child, i) => {
        const laneY = contentY + SWIM_LANE_DY + i * SWIM_LANE_DY;
        const laneId = `lane-${capName}-${i}`;
        const pluginNodeId = `plg-${capName}-${i}`;
        const pluginId = child.name ?? child.pluginType ?? 'plugin';
        const label = pluginLabel(child.name);
        nodes.push({
          id: laneId,
          pluginId: 'group',
          position: { x: capCenterX - NODE_W / 2, y: laneY },
          data: { label: 'Group', _swimLane: isSync },
        });
        nodes.push({
          id: pluginNodeId,
          pluginId,
          position: { x: capCenterX - NODE_W / 2, y: laneY + SWIM_LANE_DY },
          data: { label, _pluginName: child.name, _pluginType: child.pluginType },
        });
        edges.push({ id: `e-${forkId}-${laneId}`, source: forkId, target: laneId });
        edges.push({ id: `e-${laneId}-${pluginNodeId}`, source: laneId, target: pluginNodeId });
        edges.push({ id: `e-${pluginNodeId}-${joinId}`, source: pluginNodeId, target: joinId });
      });
    }
  }

  return { nodes, edges };
}

/**
 * Merge positions from existing canvas into computed canvas so stored layout is preserved.
 * For each node in computed, if existing has a node with the same id, use existing position.
 */
export function mergeCanvasPositions(computed: CanvasState, existing: CanvasState): CanvasState {
  if (!existing.nodes.length) return computed;
  const byId = new Map(existing.nodes.map((n) => [n.id, n]));
  const nodes = computed.nodes.map((n) => {
    const existingNode = byId.get(n.id);
    if (existingNode?.position) return { ...n, position: existingNode.position };
    return n;
  });
  return { nodes, edges: computed.edges };
}

export function isEngineConfig(config: unknown): config is EngineConfig {
  if (!config || typeof config !== 'object') return false;
  const c = config as Record<string, unknown>;
  const pipelines = c.pipelines;
  if (!pipelines || typeof pipelines !== 'object') return false;
  const first = Object.values(pipelines)[0] as Record<string, unknown> | undefined;
  return first != null && typeof first === 'object' && 'root' in first && first.root != null;
}
