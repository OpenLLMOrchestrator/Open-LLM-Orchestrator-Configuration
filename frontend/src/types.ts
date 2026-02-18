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
}

/** UI component: Start, End, Group, or Plugin (from components/ and plugins/ folders). */
export interface ComponentSummary {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  type: string;
  category?: string;
}

export interface PluginSchema {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  type?: string;
  category?: string;
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
