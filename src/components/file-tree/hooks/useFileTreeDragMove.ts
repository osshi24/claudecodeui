import { useCallback, useState } from 'react';
import type { DragEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../../../utils/api';
import type { Project } from '../../../types/app';
import { FILE_TREE_MOVE_MIME } from '../constants/constants';
import type { FileTreeNode } from '../types/types';
import { getParentDirectory, isValidMoveDestination } from '../utils/fileTreeUtils';

export type UseFileTreeDragMoveOptions = {
  selectedProject: Project | null;
  /** Absolute path of the project directory, used when dropping outside any node. */
  projectRoot: string;
  onRefresh: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
};

export type UseFileTreeDragMoveResult = {
  draggedPath: string | null;
  dropTargetDir: string | null;
  isMoving: boolean;
  handleDragStart: (item: FileTreeNode, event: DragEvent<HTMLElement>) => void;
  handleDragEnd: () => void;
  /** Pass null as the target to mean "the project root". */
  handleDragOverTarget: (target: FileTreeNode | null, event: DragEvent<HTMLElement>) => void;
  handleDropOnTarget: (target: FileTreeNode | null, event: DragEvent<HTMLElement>) => void;
};

/** True when the drag carries tree nodes rather than files from the OS. */
export const isInternalMoveDrag = (dataTransfer: DataTransfer | null): boolean =>
  Boolean(dataTransfer) && Array.from(dataTransfer!.types).includes(FILE_TREE_MOVE_MIME);

export function useFileTreeDragMove({
  selectedProject,
  projectRoot,
  onRefresh,
  showToast,
}: UseFileTreeDragMoveOptions): UseFileTreeDragMoveResult {
  const { t } = useTranslation();
  const [draggedItem, setDraggedItem] = useState<FileTreeNode | null>(null);
  const [dropTargetDir, setDropTargetDir] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  // Dropping onto a folder moves into it; dropping onto a file moves next to it,
  // which is the behaviour file managers and editors already train users to expect.
  const resolveDestination = useCallback(
    (target: FileTreeNode | null) => {
      if (!target) {
        return projectRoot;
      }
      return target.type === 'directory' ? target.path : getParentDirectory(target.path);
    },
    [projectRoot],
  );

  const handleDragStart = useCallback((item: FileTreeNode, event: DragEvent<HTMLElement>) => {
    event.stopPropagation();
    setDraggedItem(item);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(FILE_TREE_MOVE_MIME, item.path);
    // Some browsers refuse to start a drag without a standard format present.
    event.dataTransfer.setData('text/plain', item.path);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDropTargetDir(null);
  }, []);

  const handleDragOverTarget = useCallback(
    (target: FileTreeNode | null, event: DragEvent<HTMLElement>) => {
      if (!draggedItem) {
        // An upload drag from outside; leave it to the upload drop zone.
        return;
      }

      // Claim the event either way so an ancestor row cannot also light up.
      event.stopPropagation();

      const destination = resolveDestination(target);
      if (!isValidMoveDestination(draggedItem, destination)) {
        // Without preventDefault the browser rejects the drop and shows the
        // "not allowed" cursor, so invalid targets need no further handling.
        setDropTargetDir(null);
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTargetDir(destination);
    },
    [draggedItem, resolveDestination],
  );

  const handleDropOnTarget = useCallback(
    async (target: FileTreeNode | null, event: DragEvent<HTMLElement>) => {
      if (!draggedItem) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const item = draggedItem;
      const destination = resolveDestination(target);
      setDraggedItem(null);
      setDropTargetDir(null);

      if (!selectedProject || !isValidMoveDestination(item, destination)) {
        return;
      }

      setIsMoving(true);
      try {
        const response = await api.moveFile(selectedProject.projectId, {
          sourcePath: item.path,
          targetDir: destination,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to move');
        }

        showToast(
          item.type === 'directory'
            ? t('fileTree.toast.folderMoved', 'Folder moved')
            : t('fileTree.toast.fileMoved', 'File moved'),
          'success',
        );
        onRefresh();
      } catch (err) {
        showToast((err as Error).message, 'error');
      } finally {
        setIsMoving(false);
      }
    },
    [draggedItem, onRefresh, resolveDestination, selectedProject, showToast, t],
  );

  return {
    draggedPath: draggedItem?.path ?? null,
    dropTargetDir,
    isMoving,
    handleDragStart,
    handleDragEnd,
    handleDragOverTarget,
    handleDropOnTarget,
  };
}
