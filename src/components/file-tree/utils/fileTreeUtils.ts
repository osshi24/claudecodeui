import type { TFunction } from 'i18next';
import { IMAGE_FILE_EXTENSIONS } from '../constants/constants';
import type { FileTreeNode } from '../types/types';

export function filterFileTree(items: FileTreeNode[], query: string): FileTreeNode[] {
  return items.reduce<FileTreeNode[]>((filteredItems, item) => {
    const matchesName = item.name.toLowerCase().includes(query);
    const filteredChildren =
      item.type === 'directory' && item.children ? filterFileTree(item.children, query) : [];

    if (matchesName || filteredChildren.length > 0) {
      filteredItems.push({
        ...item,
        children: filteredChildren,
      });
    }

    return filteredItems;
  }, []);
}

// During search we auto-expand every directory present in the filtered subtree.
export function collectExpandedDirectoryPaths(items: FileTreeNode[]): string[] {
  const paths: string[] = [];

  const visit = (nodes: FileTreeNode[]) => {
    nodes.forEach((node) => {
      if (node.type === 'directory' && node.children && node.children.length > 0) {
        paths.push(node.path);
        visit(node.children);
      }
    });
  };

  visit(items);
  return paths;
}

/**
 * Every folder in the tree, as an absolute path, depth-first so the list reads
 * in the same order the tree is drawn. Used to pick a move destination.
 */
export function collectDirectoryPaths(items: FileTreeNode[]): string[] {
  const paths: string[] = [];

  const visit = (nodes: FileTreeNode[]) => {
    nodes.forEach((node) => {
      if (node.type !== 'directory') {
        return;
      }
      paths.push(node.path);
      if (node.children) {
        visit(node.children);
      }
    });
  };

  visit(items);
  return paths;
}

/** Parent folder of an absolute path, handling both POSIX and Windows separators. */
export function getParentDirectory(absolutePath: string): string {
  const lastSeparator = Math.max(absolutePath.lastIndexOf('/'), absolutePath.lastIndexOf('\\'));
  return lastSeparator > 0 ? absolutePath.slice(0, lastSeparator) : absolutePath;
}

/**
 * A folder cannot receive an item that already lives in it, and a folder can
 * never be moved inside itself or one of its own descendants. Both arguments
 * are absolute paths, so the project root compares equal to an item's parent
 * when that item sits at the top level.
 */
export function isValidMoveDestination(item: FileTreeNode, destination: string): boolean {
  if (destination === getParentDirectory(item.path)) {
    return false;
  }

  if (item.type === 'directory') {
    return (
      destination !== item.path &&
      !destination.startsWith(`${item.path}/`) &&
      !destination.startsWith(`${item.path}\\`)
    );
  }

  return true;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) {
    return '0 B';
  }

  const base = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const index = Math.floor(Math.log(bytes) / Math.log(base));

  return `${(bytes / Math.pow(base, index)).toFixed(1).replace(/\.0$/, '')} ${sizes[index]}`;
}

export function formatRelativeTime(date: string | undefined, t: TFunction): string {
  if (!date) {
    return '-';
  }

  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return t('fileTree.justNow');
  }

  if (diffInSeconds < 3600) {
    return t('fileTree.minAgo', { count: Math.floor(diffInSeconds / 60) });
  }

  if (diffInSeconds < 86400) {
    return t('fileTree.hoursAgo', { count: Math.floor(diffInSeconds / 3600) });
  }

  if (diffInSeconds < 2592000) {
    return t('fileTree.daysAgo', { count: Math.floor(diffInSeconds / 86400) });
  }

  return past.toLocaleDateString();
}

export function isImageFile(filename: string): boolean {
  const extension = filename.split('.').pop()?.toLowerCase();
  return Boolean(extension && IMAGE_FILE_EXTENSIONS.has(extension));
}

