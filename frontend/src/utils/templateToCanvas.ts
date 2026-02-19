import type { CanvasNode, CanvasEdge, CanvasState, ComponentSummary } from '../types';

const NODE_W = 140;
const NODE_H = 44;
const GAP_X = 50;
const GAP_Y = 56;
const MAIN_ROW_Y = 40;
const CAP_TO_GROUP_DY = 70;
const GROUP_TO_CONTENT_DY = 58;
const SWIM_LANE_DY = 52;

/** Plugin child in pipeline: same shape as plugin YAML (id, version, name=className, pluginType) plus per-plugin timeouts. */
interface ChildNode {
  type: string;
  /** Plugin id from YAML (e.g. olo-plugin-llm-ollama-1.0.0). */
  id?: string;
  /** Plugin version from YAML (e.g. 1.0.0). */
  version?: string;
  /** FQCN / className for engine to invoke. */
  name?: string;
  /** Engine plugin type (e.g. ModelPlugin, VectorStorePlugin). */
  pluginType?: string;
  /** Optional per-plugin timeout overrides (seconds). */
  scheduleToStartSeconds?: number;
  /** Optional per-plugin timeout overrides (seconds). */
  startToCloseSeconds?: number;
  /** Optional per-plugin timeout overrides (seconds). */
  scheduleToCloseSeconds?: number;
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

interface StageGroupConfig {
  executionMode?: string;
  asyncCompletionPolicy?: string;
  children?: string[];
}

interface PipelineStagesFormat {
  root?: Record<string, StageConfig>;
  /** Same shape as root; used by engine-config when JSON "root" is a capability map (no "type" on root object). */
  rootByCapability?: Record<string, StageConfig>;
  stages?: Array<{ stage: string; groups?: StageGroupConfig[] }>;
  defaultTimeoutSeconds?: number;
}

interface EngineConfig {
  pipelines?: Record<string, PipelineStagesFormat>;
  capabilityOrder?: string[];
  stageOrder?: string[];
}

/** Convert pipeline.stages array to root map so the same rendering path can be used. */
function stagesToRoot(stages: Array<{ stage: string; groups?: StageGroupConfig[] }>): Record<string, StageConfig> {
  const root: Record<string, StageConfig> = {};
  for (const s of stages) {
    if (!s?.stage) continue;
    const groups = Array.isArray(s.groups) ? s.groups : [];
    const first = groups[0];
    const executionMode = first?.executionMode ?? 'SYNC';
    const children: ChildNode[] = (first?.children ?? []).map((ch): ChildNode => {
      if (typeof ch === 'string') return { type: 'PLUGIN', name: ch, pluginType: ch };
      if (ch && typeof ch === 'object' && 'name' in ch) {
        const o = ch as ChildNode;
        return { type: 'PLUGIN', id: o.id, version: o.version, name: o.name ?? 'plugin', pluginType: o.pluginType ?? 'plugin' };
      }
      return { type: 'PLUGIN', name: 'plugin', pluginType: 'plugin' };
    });
    root[s.stage] = { type: 'GROUP', executionMode, children };
  }
  return root;
}

function pluginLabel(name?: string): string {
  if (!name || typeof name !== 'string') return 'Plugin';
  const parts = name.split(/\./);
  return parts[parts.length - 1] || name;
}

/** Read activity.defaultTimeouts from configJson and compute per-plugin timeout defaults. */
function getActivityTimeoutDefaults(configJson: Record<string, unknown>): {
  scheduleToStartSeconds: number;
  startToCloseSeconds: number;
  scheduleToCloseSeconds: number;
} {
  const activity = (configJson.activity && typeof configJson.activity === 'object'
    ? (configJson.activity as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const defaultTimeouts = (activity.defaultTimeouts && typeof activity.defaultTimeouts === 'object'
    ? (activity.defaultTimeouts as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const scheduleToStartSeconds =
    typeof defaultTimeouts.scheduleToStartSeconds === 'number'
      ? (defaultTimeouts.scheduleToStartSeconds as number)
      : 60;
  const startToCloseSeconds =
    typeof defaultTimeouts.startToCloseSeconds === 'number'
      ? (defaultTimeouts.startToCloseSeconds as number)
      : 30;
  const scheduleToCloseSeconds =
    typeof defaultTimeouts.scheduleToCloseSeconds === 'number'
      ? (defaultTimeouts.scheduleToCloseSeconds as number)
      : 300;

  return { scheduleToStartSeconds, startToCloseSeconds, scheduleToCloseSeconds };
}

/** Parse UI pluginId "artifact__fqcn" or "artifact-1.0.0__fqcn" into id, version, name (FQCN). */
function parsePluginId(pluginId: string): { id: string; version?: string; name: string } | null {
  if (!pluginId || typeof pluginId !== 'string') return null;
  const idx = pluginId.indexOf('__');
  if (idx <= 0) return null;
  const left = pluginId.slice(0, idx).trim();
  const name = pluginId.slice(idx + 2).trim();
  if (!name) return null;
  const versionMatch = left.match(/^(.+)-(\d+\.\d+(?:\.\d+)?)$/);
  if (versionMatch) {
    return { id: versionMatch[1], version: versionMatch[2], name };
  }
  return { id: left, name };
}

/** Build UI pluginId from YAML-style child (id + version + name) so component list can resolve it. */
function childToPluginId(child: ChildNode): string {
  const name = child.name ?? child.pluginType ?? 'plugin';
  if (child.id) {
    const prefix = child.version ? `${child.id}-${child.version}` : child.id;
    return `${prefix}__${name}`;
  }
  return name;
}

/** Map capability name to engine pluginType when not stored. */
const CAPABILITY_TO_PLUGIN_TYPE: Record<string, string> = {
  MODEL: 'ModelPlugin',
  MEMORY: 'MemoryPlugin',
  CACHING: 'CachingPlugin',
  RETRIEVAL: 'VectorStorePlugin',
  VECTOR_STORE: 'VectorStorePlugin',
  TOOL: 'ToolPlugin',
  MCP: 'MCPPlugin',
  FILTER: 'FilterPlugin',
  REFINEMENT: 'RefinementPlugin',
  ACCESS: 'AccessControlPlugin',
  ACCESS_CONTROL: 'AccessControlPlugin',
};

/**
 * Tree: Start → Capability → … → End (main flow).
 * Each Capability → Group. Group → content: single Plugin, or Fork (sync/swim lanes) → lanes → Join (reducer), or Condition (if/else/elseif), or Iterator (loop).
 * If pipelineId is given, uses that pipeline's root; otherwise uses the first pipeline.
 */
/** Minimal canvas: Start → End so the canvas is never blank. Exported for use in App on error fallback. */
export function minimalCanvasState(): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const startId = 'node-start';
  const endId = 'node-end';
  return {
    nodes: [
      { id: startId, pluginId: 'start', position: { x: 30, y: MAIN_ROW_Y }, data: { label: 'Start' } },
      { id: endId, pluginId: 'end', position: { x: 30 + NODE_W + GAP_X, y: MAIN_ROW_Y }, data: { label: 'End' } },
    ],
    edges: [{ id: `e-${startId}-${endId}`, source: startId, target: endId }],
  };
}

export function engineConfigToCanvasState(
  config: EngineConfig,
  pipelineId?: string
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  const pipelines = config.pipelines;
  if (!pipelines || typeof pipelines !== 'object') return minimalCanvasState();

  const pipeline = (
    pipelineId != null && pipelines[pipelineId]
      ? pipelines[pipelineId]
      : Object.values(pipelines)[0]
  ) as PipelineStagesFormat | undefined;

  if (!pipeline) return minimalCanvasState();

  let root: Record<string, StageConfig>;
  const rootMap = (pipeline.root && typeof pipeline.root === 'object' && Object.keys(pipeline.root).length > 0)
    ? (pipeline.root as Record<string, StageConfig>)
    : (pipeline.rootByCapability && typeof pipeline.rootByCapability === 'object' && Object.keys(pipeline.rootByCapability).length > 0)
      ? (pipeline.rootByCapability as Record<string, StageConfig>)
      : null;
  if (rootMap) {
    root = rootMap;
  } else if (Array.isArray(pipeline.stages) && pipeline.stages.length > 0) {
    root = stagesToRoot(pipeline.stages);
  } else {
    return minimalCanvasState();
  }

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
      const c = children[0];
      const pluginId = childToPluginId(c);
      const label = pluginLabel(c.name);
      const data: Record<string, unknown> = { label, _pluginName: c.name, _pluginType: c.pluginType };
      if (c.id) data._pluginId = c.id;
      if (c.version) data._pluginVersion = c.version;
      nodes.push({
        id: nodeId,
        pluginId,
        position: { x: capCenterX - NODE_W / 2, y: contentY },
        data,
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
        const pluginId = childToPluginId(child);
        const label = pluginLabel(child.name);
        const data: Record<string, unknown> = { label, _pluginName: child.name, _pluginType: child.pluginType };
        if (child.id) data._pluginId = child.id;
        if (child.version) data._pluginVersion = child.version;
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
          data,
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
  if (first == null || typeof first !== 'object') return false;
  if (first.root != null && typeof first.root === 'object' && Object.keys(first.root as object).length > 0) return true;
  if (first.rootByCapability != null && typeof first.rootByCapability === 'object' && Object.keys(first.rootByCapability as object).length > 0) return true;
  if (Array.isArray(first.stages) && first.stages.length > 0) return true;
  return false;
}

/** Build PLUGIN child with YAML-aligned fields: id, version, name (FQCN), pluginType. Omit pluginType when empty in definition. */
function toChildNode(attrs: {
  id?: string;
  version?: string;
  name: string;
  pluginType?: string;
  scheduleToStartSeconds?: number;
  startToCloseSeconds?: number;
  scheduleToCloseSeconds?: number;
}): ChildNode {
  const name = attrs.name || 'plugin';
  const out: ChildNode = { type: 'PLUGIN', name };
  if (attrs.id) out.id = attrs.id;
  if (attrs.version) out.version = attrs.version;
  if (attrs.pluginType != null && String(attrs.pluginType).trim()) out.pluginType = String(attrs.pluginType).trim();
  if (typeof attrs.scheduleToStartSeconds === 'number') out.scheduleToStartSeconds = attrs.scheduleToStartSeconds;
  if (typeof attrs.startToCloseSeconds === 'number') out.startToCloseSeconds = attrs.startToCloseSeconds;
  if (typeof attrs.scheduleToCloseSeconds === 'number') out.scheduleToCloseSeconds = attrs.scheduleToCloseSeconds;
  return out;
}

/**
 * Build pipeline root (capability → stage config) from current canvas state and flat config.
 * Used when saving/exporting so the full hierarchy designed on the canvas is stored.
 */
const DEBUG_PIPELINE_ROOT = false; // set to true to debug pipeline root build

const SYSTEM_NODE_PLUGIN_IDS = new Set(['start', 'end', 'group', 'fork', 'condition', 'reducer']);

export function canvasStateToPipelineRoot(
  canvasState: CanvasState,
  configJson: Record<string, unknown>,
  components: ComponentSummary[] = []
): Record<string, StageConfig> {
  const { nodes, edges } = canvasState;
  const timeoutDefaults = getActivityTimeoutDefaults(configJson);
  if (DEBUG_PIPELINE_ROOT) {
    console.log('[canvasStateToPipelineRoot] input', {
      nodesCount: nodes.length,
      edgesCount: edges.length,
      nodeIds: nodes.map((n) => n.id),
      nodeIdsCap: nodes.filter((n) => n.id.startsWith('cap-')).map((n) => n.id),
      nodeIdsStartEnd: nodes.filter((n) => n.id === 'node-start' || n.id === 'node-end').map((n) => n.id),
      edgesSample: edges.slice(0, 10).map((e) => ({ source: e.source, target: e.target })),
    });
  }
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const outEdges = new Map<string, string[]>();
  for (const e of edges) {
    const list = outEdges.get(e.source) ?? [];
    list.push(e.target);
    outEdges.set(e.source, list);
  }

  // Main flow: start → cap1 → cap2 → … → end
  const startId = 'node-start';
  const endId = 'node-end';
  const capOrder: string[] = [];
  let current: string | undefined = startId;
  while (current && current !== endId) {
    const targets = outEdges.get(current) ?? [];
    const next = targets.find((t) => t.startsWith('cap-') || t === endId);
    if (DEBUG_PIPELINE_ROOT && (current === startId || current?.startsWith('cap-'))) {
      console.log('[canvasStateToPipelineRoot] main flow step', { current, targets, next });
    }
    if (!next) break;
    if (next.startsWith('cap-')) capOrder.push(next.slice(4));
    current = next;
  }
  if (DEBUG_PIPELINE_ROOT) {
    console.log('[canvasStateToPipelineRoot] capOrder', capOrder, 'hasStartNode:', nodeById.has(startId));
  }

  const root: Record<string, StageConfig> = {};

  // When canvas was built by dragging (node-* IDs), infer one capability from the linear chain start → … → end
  if (capOrder.length === 0) {
    const linearChain: string[] = [];
    let cur: string | undefined = startId;
    const seen = new Set<string>();
    while (cur && cur !== endId) {
      const targets = outEdges.get(cur) ?? [];
      const next = targets.find((t) => t !== endId && !seen.has(t));
      if (!next || next === endId) break;
      seen.add(next);
      linearChain.push(next);
      cur = next;
    }
    if (linearChain.length > 0) {
      const children: ChildNode[] = [];
      for (const nodeId of linearChain) {
        const node = nodeById.get(nodeId);
        const pluginId = (node?.data?.pluginId as string) ?? (node as { pluginId?: string })?.pluginId ?? '';
        if (SYSTEM_NODE_PLUGIN_IDS.has(pluginId)) continue;
        const attrs = getPluginNameAndType(nodeId, node, configJson, undefined, components);
        const stored = (configJson[nodeId] as Record<string, unknown>) ?? {};
        const scheduleToStartSeconds =
          typeof stored.scheduleToStartSeconds === 'number'
            ? (stored.scheduleToStartSeconds as number)
            : timeoutDefaults.scheduleToStartSeconds;
        const startToCloseSeconds =
          typeof stored.startToCloseSeconds === 'number'
            ? (stored.startToCloseSeconds as number)
            : timeoutDefaults.startToCloseSeconds;
        const scheduleToCloseSeconds =
          typeof stored.scheduleToCloseSeconds === 'number'
            ? (stored.scheduleToCloseSeconds as number)
            : timeoutDefaults.scheduleToCloseSeconds;
        children.push(
          toChildNode({
            ...attrs,
            scheduleToStartSeconds,
            startToCloseSeconds,
            scheduleToCloseSeconds,
          })
        );
      }
      if (children.length > 0) {
        root['default'] = { type: 'GROUP', executionMode: 'SYNC', children };
      }
    }
  }

  for (const capName of capOrder) {
    const capId = `cap-${capName}`;
    const targets = outEdges.get(capId) ?? [];
    const groupId = `grp-${capName}`;
    const forkId = `fork-${capName}`;
    const hasGroup = targets.includes(groupId);
    const hasFork = targets.includes(forkId);
    const groupNode = nodeById.get(groupId);
    const forkNode = nodeById.get(forkId);
    const executionMode =
      (groupNode?.data?.executionMode as string) ?? (forkNode?.data?.executionMode as string) ?? 'SYNC';

    if (hasFork && !hasGroup) {
      // ASYNC: cap → fork directly
      const childNodes = collectPluginNodesFromFork(
        nodes,
        edges,
        capName,
        configJson,
        nodeById,
        components,
        timeoutDefaults
      );
      root[capName] = { type: 'GROUP', executionMode: 'ASYNC', children: childNodes };
      continue;
    }
    if (hasGroup) {
      const stage = buildStageFromGroup(
        nodes,
        edges,
        nodeById,
        outEdges,
        capName,
        configJson,
        components,
        timeoutDefaults
      );
      if (DEBUG_PIPELINE_ROOT) {
        console.log('[canvasStateToPipelineRoot] stage for cap', capName, { hasGroup, hasFork, stage: stage ?? null });
      }
      if (stage) root[capName] = stage;
    }
  }
  if (DEBUG_PIPELINE_ROOT) {
    console.log('[canvasStateToPipelineRoot] result root keys', Object.keys(root), 'root', root);
  }
  return root;
}

function getPluginNameAndType(
  nodeId: string,
  node: { data?: Record<string, unknown>; pluginId?: string } | undefined,
  configJson: Record<string, unknown>,
  capName?: string,
  components: ComponentSummary[] = []
): { id?: string; version?: string; name: string; pluginType: string } {
  const stored = configJson[nodeId] as Record<string, unknown> | undefined;
  const pluginId = (node?.data?.pluginId as string) ?? (node as { pluginId?: string })?.pluginId ?? '';

  let id: string | undefined = (stored?.id as string) ?? (node?.data?._pluginId as string);
  let version: string | undefined = (stored?.version as string) ?? (node?.data?._pluginVersion as string);
  let name = (stored?.name as string) ?? (node?.data?._pluginName as string);
  let pluginType = (stored?.pluginType as string) ?? (node?.data?._pluginType as string);

  const comp = components.find((c) => c.id === pluginId);
  if (comp) {
    id = comp.pluginId ?? id;
    version = comp.version ?? version;
    name = comp.className ?? name;
    pluginType = comp.pluginType ?? pluginType;
  }

  if (!name) {
    const parsed = parsePluginId(pluginId);
    if (parsed) {
      if (!id) id = parsed.id;
      if (!version) version = parsed.version;
      if (!name) name = parsed.name;
    }
  }
  if (!name) name = pluginId || 'plugin';
  const pluginTypeFromDef = comp && (comp.pluginType !== undefined && comp.pluginType !== null);
  if (!pluginTypeFromDef && (pluginType === undefined || pluginType === null || String(pluginType).trim() === '')) {
    pluginType =
      (capName ? CAPABILITY_TO_PLUGIN_TYPE[capName] ?? CAPABILITY_TO_PLUGIN_TYPE[capName.toUpperCase()] : undefined) ??
      (stored?.pluginType as string) ??
      (node?.data?._pluginType as string) ??
      pluginId ??
      '';
  }
  const out: { id?: string; version?: string; name: string; pluginType?: string } = {
    name: String(name),
  };
  if (id) out.id = id;
  if (version) out.version = version;
  if (pluginType != null && String(pluginType).trim()) out.pluginType = String(pluginType).trim();
  return out;
}

function collectPluginNodesFromFork(
  nodes: CanvasState['nodes'],
  edges: CanvasState['edges'],
  capName: string,
  configJson: Record<string, unknown>,
  nodeById: Map<string, CanvasState['nodes'][0]>,
  components: ComponentSummary[] = [],
  timeoutDefaults?: {
    scheduleToStartSeconds: number;
    startToCloseSeconds: number;
    scheduleToCloseSeconds: number;
  }
): ChildNode[] {
  const forkId = `fork-${capName}`;
  const outFromFork = edges.filter((e) => e.source === forkId).map((e) => e.target);
  const laneIds = outFromFork.filter((t) => t.startsWith(`lane-${capName}-`));
  laneIds.sort((a, b) => {
    const i = parseInt(a.split('-').pop() ?? '0', 10);
    const j = parseInt(b.split('-').pop() ?? '0', 10);
    return i - j;
  });
  const result: ChildNode[] = [];
  for (const laneId of laneIds) {
    const plgEdge = edges.find((e) => e.source === laneId && e.target.startsWith(`plg-${capName}-`));
    if (!plgEdge) continue;
    const plgId = plgEdge.target;
    const node = nodeById.get(plgId);
    const attrs = getPluginNameAndType(plgId, node, configJson, capName, components);
    const stored = (configJson[plgId] as Record<string, unknown>) ?? {};
    const scheduleToStartSeconds =
      typeof stored.scheduleToStartSeconds === 'number'
        ? (stored.scheduleToStartSeconds as number)
        : timeoutDefaults?.scheduleToStartSeconds ?? 60;
    const startToCloseSeconds =
      typeof stored.startToCloseSeconds === 'number'
        ? (stored.startToCloseSeconds as number)
        : timeoutDefaults?.startToCloseSeconds ?? 30;
    const scheduleToCloseSeconds =
      typeof stored.scheduleToCloseSeconds === 'number'
        ? (stored.scheduleToCloseSeconds as number)
        : timeoutDefaults?.scheduleToCloseSeconds ?? 300;
    result.push(
      toChildNode({
        ...attrs,
        scheduleToStartSeconds,
        startToCloseSeconds,
        scheduleToCloseSeconds,
      })
    );
  }
  return result;
}

function buildStageFromGroup(
  nodes: CanvasState['nodes'],
  edges: CanvasState['edges'],
  nodeById: Map<string, CanvasState['nodes'][0]>,
  outEdges: Map<string, string[]>,
  capName: string,
  configJson: Record<string, unknown>,
  components: ComponentSummary[] = [],
  timeoutDefaults?: {
    scheduleToStartSeconds: number;
    startToCloseSeconds: number;
    scheduleToCloseSeconds: number;
  }
): StageConfig | null {
  const groupId = `grp-${capName}`;
  const targets = outEdges.get(groupId) ?? [];
  const condId = `cond-${capName}`;
  const forkId = `fork-${capName}`;
  const plgSingleId = `plg-${capName}-0`;
  const groupNode = nodeById.get(groupId);
  const executionMode = (groupNode?.data?.executionMode as string) ?? 'SYNC';

  if (targets.includes(condId)) {
    const condNode = nodeById.get(condId);
    const conditionPlugin = (condNode?.data?.conditionPlugin as string) ?? (configJson[condId] as Record<string, unknown>)?.name ?? '';
    const thenChildren = collectChildrenFromGroupNode(
      nodes,
      edges,
      `then-${capName}`,
      configJson,
      capName,
      components,
      timeoutDefaults
    );
    const elseChildren = collectChildrenFromGroupNode(
      nodes,
      edges,
      `else-${capName}`,
      configJson,
      capName,
      components,
      timeoutDefaults
    );
    return {
      type: 'GROUP',
      executionMode,
      condition: conditionPlugin || undefined,
      thenGroup: thenChildren.length ? { children: thenChildren } : undefined,
      elseGroup: elseChildren.length ? { children: elseChildren } : undefined,
    };
  }
  if (targets.includes(plgSingleId)) {
    const node = nodeById.get(plgSingleId);
    const attrs = getPluginNameAndType(plgSingleId, node, configJson, capName, components);
    const stored = (configJson[plgSingleId] as Record<string, unknown>) ?? {};
    const scheduleToStartSeconds =
      typeof stored.scheduleToStartSeconds === 'number'
        ? (stored.scheduleToStartSeconds as number)
        : timeoutDefaults?.scheduleToStartSeconds ?? 60;
    const startToCloseSeconds =
      typeof stored.startToCloseSeconds === 'number'
        ? (stored.startToCloseSeconds as number)
        : timeoutDefaults?.startToCloseSeconds ?? 30;
    const scheduleToCloseSeconds =
      typeof stored.scheduleToCloseSeconds === 'number'
        ? (stored.scheduleToCloseSeconds as number)
        : timeoutDefaults?.scheduleToCloseSeconds ?? 300;
    return {
      type: 'GROUP',
      executionMode,
      children: [
        toChildNode({
          ...attrs,
          scheduleToStartSeconds,
          startToCloseSeconds,
          scheduleToCloseSeconds,
        }),
      ],
    };
  }
  if (targets.includes(forkId)) {
    const children = collectPluginNodesFromFork(
      nodes,
      edges,
      capName,
      configJson,
      nodeById,
      components,
      timeoutDefaults
    );
    return { type: 'GROUP', executionMode, children };
  }
  return { type: 'GROUP', executionMode, children: [] };
}

function collectChildrenFromGroupNode(
  nodes: CanvasState['nodes'],
  edges: CanvasState['edges'],
  groupNodeId: string,
  configJson: Record<string, unknown>,
  capName?: string,
  components: ComponentSummary[] = [],
  timeoutDefaults?: {
    scheduleToStartSeconds: number;
    startToCloseSeconds: number;
    scheduleToCloseSeconds: number;
  }
): ChildNode[] {
  const out = edges.filter((e) => e.source === groupNodeId).map((e) => e.target);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const result: ChildNode[] = [];
  for (const targetId of out) {
    if (targetId.startsWith('plg-')) {
      const node = nodeById.get(targetId);
      const attrs = getPluginNameAndType(targetId, node, configJson, capName, components);
      const stored = (configJson[targetId] as Record<string, unknown>) ?? {};
      const scheduleToStartSeconds =
        typeof stored.scheduleToStartSeconds === 'number'
          ? (stored.scheduleToStartSeconds as number)
          : timeoutDefaults?.scheduleToStartSeconds ?? 60;
      const startToCloseSeconds =
        typeof stored.startToCloseSeconds === 'number'
          ? (stored.startToCloseSeconds as number)
          : timeoutDefaults?.startToCloseSeconds ?? 30;
      const scheduleToCloseSeconds =
        typeof stored.scheduleToCloseSeconds === 'number'
          ? (stored.scheduleToCloseSeconds as number)
          : timeoutDefaults?.scheduleToCloseSeconds ?? 300;
      result.push(
        toChildNode({
          ...attrs,
          scheduleToStartSeconds,
          startToCloseSeconds,
          scheduleToCloseSeconds,
        })
      );
    }
  }
  return result;
}

/**
 * Build config JSON with the current pipeline's root set from the canvas.
 * Use this before save/export so the full hierarchy is stored.
 */
export function buildConfigWithPipelineRootFromCanvas(
  configJson: Record<string, unknown>,
  canvasState: CanvasState,
  pipelineId: string,
  components: ComponentSummary[] = []
): Record<string, unknown> {
  const root = canvasStateToPipelineRoot(canvasState, configJson, components);
  if (DEBUG_PIPELINE_ROOT) {
    console.log('[buildConfigWithPipelineRootFromCanvas]', { pipelineId, rootKeys: Object.keys(root), root });
  }
  const pipelines = (configJson.pipelines && typeof configJson.pipelines === 'object'
    ? { ...(configJson.pipelines as Record<string, unknown>) }
    : {}) as Record<string, Record<string, unknown>>;
  const pipeline = pipelines[pipelineId] ? { ...pipelines[pipelineId] } : {};
  pipeline.root = root as unknown as Record<string, unknown>;
  pipelines[pipelineId] = pipeline;
  return { ...configJson, pipelines };
}
