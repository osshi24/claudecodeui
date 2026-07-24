import { useMemo } from 'react';
import { FolderInput, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '../../../lib/utils';
import { ScrollArea } from '../../../shared/view/ui';
import type { FileTreeNode } from '../types/types';
import { collectDirectoryPaths, isValidMoveDestination } from '../utils/fileTreeUtils';

type FileTreeMoveDialogProps = {
  item: FileTreeNode;
  files: FileTreeNode[];
  /** Absolute path of the project directory, offered as a destination itself. */
  projectRoot: string;
  targetDir: string;
  onTargetDirChange: (targetDir: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
};

export default function FileTreeMoveDialog({
  item,
  files,
  projectRoot,
  targetDir,
  onTargetDirChange,
  onCancel,
  onConfirm,
  isLoading = false,
}: FileTreeMoveDialogProps) {
  const { t } = useTranslation();

  const destinations = useMemo(
    () =>
      [projectRoot, ...collectDirectoryPaths(files)].filter((candidate) =>
        isValidMoveDestination(item, candidate),
      ),
    [files, item, projectRoot],
  );

  const describeDestination = (absolutePath: string) => {
    if (absolutePath === projectRoot) {
      return t('fileTree.move.projectRoot', 'Project root');
    }
    return absolutePath.slice(projectRoot.length).replace(/^[/\\]/, '');
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div className="mx-4 flex max-h-[70vh] w-full max-w-md flex-col rounded-lg border border-border bg-background p-4 shadow-lg">
        <div className="mb-3 flex items-center gap-3">
          <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900/30">
            <FolderInput className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-foreground">
              {t('fileTree.move.title', 'Move to folder')}
            </h3>
            <p className="truncate text-sm text-muted-foreground">{item.name}</p>
          </div>
        </div>

        {destinations.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">
            {t('fileTree.move.noDestinations', 'There is no other folder to move this into.')}
          </p>
        ) : (
          <ScrollArea className="mb-4 max-h-64 flex-1 rounded-md border border-border">
            <div className="p-1">
              {destinations.map((destination) => (
                <button
                  key={destination}
                  type="button"
                  onClick={() => onTargetDirChange(destination)}
                  className={cn(
                    'block w-full truncate rounded px-2 py-1.5 text-left text-sm transition-colors',
                    destination === targetDir
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent',
                  )}
                >
                  {describeDestination(destination)}
                </button>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent"
          >
            {t('buttons.cancel', 'Cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading || !targetDir}
            className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('fileTree.move.confirm', 'Move')}
          </button>
        </div>
      </div>
    </div>
  );
}
