import type { DragEvent } from 'react';
import type { LucideIcon } from 'lucide-react';

export type FileTreeViewMode = 'simple' | 'compact' | 'detailed';

export type FileTreeItemType = 'file' | 'directory';

export interface FileTreeNode {
  name: string;
  type: FileTreeItemType;
  path: string;
  size?: number;
  modified?: string;
  permissionsRwx?: string;
  children?: FileTreeNode[];
  [key: string]: unknown;
}

/** Drag-to-move wiring handed down to every row. */
export interface FileTreeDragMove {
  draggedPath: string | null;
  dropTargetDir: string | null;
  handleDragStart: (item: FileTreeNode, event: DragEvent<HTMLElement>) => void;
  handleDragEnd: () => void;
  handleDragOverTarget: (target: FileTreeNode | null, event: DragEvent<HTMLElement>) => void;
  handleDropOnTarget: (target: FileTreeNode | null, event: DragEvent<HTMLElement>) => void;
}

export interface FileTreeImageSelection {
  name: string;
  path: string;
  projectPath?: string;
  // DB projectId; used by ImageViewer to build the raw content URL.
  projectId: string;
}

export interface FileIconData {
  icon: LucideIcon;
  color: string;
}

export type FileIconMap = Record<string, FileIconData>;
