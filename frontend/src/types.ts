export interface OloConfig {
  id?: string;
  name: string;
  description?: string;
  templateId?: string;
  canvasJson?: string;
  configJson?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** In-progress template state persisted in Redis (olo:ui:inprogress-template). */
export interface InProgressTemplate {
  templateId?: string | null;
  configName?: string | null;
  canvasJson?: string | null;
  configJson?: string | null;
  selectedPipelineId?: string | null;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  canvasJson?: string;
  configJson?: string;
  builtIn?: boolean;
}

export interface PluginSummary {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  /** When set, use for display instead of name. */
  displayName?: string;
}

/** UI component: Start, End, Group, or Plugin (from components/ and plugins/ folders). */
export interface ComponentSummary {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  type: string;
  category?: string;
  /** When set, use for display instead of name. */
  displayName?: string;
  /** Plugin descriptor id from YAML (same as config id). */
  pluginId?: string;
  /** Plugin version from YAML. */
  version?: string;
  /** FQCN / className for engine (same as config name). */
  className?: string;
  /** Engine plugin type from YAML (e.g. ModelPlugin). */
  pluginType?: string;
}

/** Options from components/global: feature flags and plugins for the Feature flags & settings tab. */
export interface GlobalOptions {
  featureFlags: { id: string; name: string; description?: string }[];
  plugins: { id: string; name: string }[];
}

export interface PluginSchema {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  type?: string;
  category?: string;
  /** When set, use for display instead of name. */
  displayName?: string;
  /** Plugin descriptor id (same as config id). */
  pluginId?: string;
  /** Plugin version. */
  version?: string;
  /** FQCN / className (engine name). */
  className?: string;
  /** Engine plugin type (e.g. ModelPlugin). */
  pluginType?: string;
  /** Capability list from plugin YAML (e.g. [ "MODEL" ]). */
  capability?: string[];
  properties?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface CanvasNode {
  id: string;
  /** Component id (start, end, group, or plugin id from plugins folder). */
  pluginId: string;
  position: { x: number; y: number };
  data?: Record<string, unknown>;
  type?: string;
}

export interface CanvasEdge {
  id?: string;
  source: string;
  target: string;
}

export interface CanvasState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}
