import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { api } from '../../../utils/api';
import type { Project } from '../../../types/app';
import type { CodeEditorDiffInfo, CodeEditorFile } from '../types/types';
import { isWrappableHtml } from '../utils/designCanvas';

const baseName = (path: string) => path.replace(/\\/g, '/').split('/').pop() || path;

type UseEditorSidebarOptions = {
  selectedProject: Project | null;
  isMobile: boolean;
  initialWidth?: number;
};

export const useEditorSidebar = ({
  selectedProject,
  isMobile,
  initialWidth = 600,
}: UseEditorSidebarOptions) => {
  const [editingFile, setEditingFile] = useState<CodeEditorFile | null>(null);
  const [editorWidth, setEditorWidth] = useState(initialWidth);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [hasManualWidth, setHasManualWidth] = useState(false);
  const resizeHandleRef = useRef<HTMLDivElement | null>(null);
  /** Identifies the most recent open, so a slow wrap cannot hijack a newer file. */
  const openTokenRef = useRef(0);
  // Keep this in a ref as well as state: a pointer can be released before
  // React has committed the state update that starts a resize.
  const isResizingRef = useRef(false);
  const resizingPointerIdRef = useRef<number | null>(null);

  const stopResizing = useCallback(() => {
    isResizingRef.current = false;
    resizingPointerIdRef.current = null;
    setIsResizing(false);
  }, []);

  const handleFileOpen = useCallback(
    (filePath: string, diffInfo: CodeEditorDiffInfo | null = null) => {
      const openToken = ++openTokenRef.current;
      const projectId = selectedProject?.projectId;

      setEditingFile({
        name: baseName(filePath),
        path: filePath,
        // DB projectId is forwarded to the editor so it can read/save files
        // via `/api/projects/:projectId/file` endpoints.
        projectId,
        diffInfo,
      });

      // Every HTML page is upgraded to a design canvas, so the full editor is
      // available however the file was reached — file tree, chat, or the
      // project's entry page. This is the one place that decides, which is why
      // callers only ever hand over the source path.
      //
      // The plain preview shown above stays on screen while the canvas builds,
      // and remains if the design payload is unavailable.
      if (!projectId || !isWrappableHtml(filePath)) return;

      void api.wrapHtmlAsCanvas(projectId, filePath)
        .then(async (response) => {
          if (!response.ok) {
            // Falling back to the plain preview is correct, but doing it in
            // total silence is not: the page still opens and looks fine, so
            // the missing canvas tooling reads as a broken editor rather than
            // an unavailable payload. Name the reason the server gave.
            const reason = await response.json().then(
              (body: { error?: string }) => body?.error,
              () => null,
            );
            console.warn(
              `[DesignCanvas] ${filePath} opened as a plain preview: `
              + `${reason ?? `wrap failed (${response.status})`}.`
              + (reason === 'design_payload_unavailable'
                ? ' The /design skill payload is not on disk — run /design once, or copy it to .claude/skills/design.'
                : ''),
            );
            return;
          }
          const { canvasPath } = await response.json() as { canvasPath?: string };
          // A newer open superseded this one; leave the editor where it is.
          if (!canvasPath || canvasPath === filePath || openTokenRef.current !== openToken) return;

          setEditingFile({
            name: baseName(canvasPath),
            path: canvasPath,
            projectId,
            // Forces the visual view, so a canvas never lands as raw source
            // just because the editor was last left showing code.
            diffInfo: { ...diffInfo, visualRefreshKey: Date.now() },
          });
        })
        .catch((error) => {
          console.error('Could not build the design canvas:', error);
        });
    },
    [selectedProject?.projectId],
  );

  const handleCloseEditor = useCallback(() => {
    setEditingFile(null);
    setEditorExpanded(false);
  }, []);

  const handleToggleEditorExpand = useCallback(() => {
    setEditorExpanded((previous) => !previous);
  }, []);

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isMobile) {
        return;
      }

      // Capture the pointer on the handle. The editor panel hosts iframes
      // (previews, the design canvas), and a drag that crosses one would
      // otherwise deliver its move and release events to the iframe's document
      // instead of ours — the release would never arrive and the panel would
      // keep following the cursor after the button was let go.
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture is best-effort; the iframe guard below still applies.
      }

      // After first drag interaction, the editor width is user-controlled.
      setHasManualWidth(true);
      isResizingRef.current = true;
      resizingPointerIdRef.current = event.pointerId;
      setIsResizing(true);
      event.preventDefault();
    },
    [isMobile],
  );

  useEffect(() => {
    const handleMouseMove = (event: globalThis.PointerEvent) => {
      if (!isResizingRef.current || event.pointerId !== resizingPointerIdRef.current) {
        return;
      }

      // A missed pointerup can happen when the release occurs outside the
      // browser window. The next move is enough to recover instead of leaving
      // the panel attached to the cursor.
      if ((event.buttons & 1) === 0) {
        stopResizing();
        return;
      }

      // Get the main container (parent of EditorSidebar's parent) that contains both left content and editor
      const editorContainer = resizeHandleRef.current?.parentElement;
      const mainContainer = editorContainer?.parentElement;
      if (!mainContainer) {
        return;
      }

      const containerRect = mainContainer.getBoundingClientRect();
      // Calculate new editor width: distance from mouse to right edge of main container
      const newWidth = containerRect.right - event.clientX;

      const minWidth = 300;
      const maxWidth = containerRect.width * 0.8;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setEditorWidth(newWidth);
      }
    };

    const handleMouseUp = (event: globalThis.PointerEvent) => {
      if (event.pointerId === resizingPointerIdRef.current) {
        stopResizing();
      }
    };

    // These listeners stay registered for the life of the mounted sidebar.
    // Registering them only after `setIsResizing(true)` leaves a small window
    // where a quick pointerup is missed before React runs the effect.
    document.addEventListener('pointermove', handleMouseMove);
    document.addEventListener('pointerup', handleMouseUp, true);
    document.addEventListener('pointercancel', handleMouseUp, true);
    window.addEventListener('blur', stopResizing);

    return () => {
      document.removeEventListener('pointermove', handleMouseMove);
      document.removeEventListener('pointerup', handleMouseUp, true);
      document.removeEventListener('pointercancel', handleMouseUp, true);
      window.removeEventListener('blur', stopResizing);
    };
  }, [stopResizing]);

  useEffect(() => {
    // Second guard, for pointers that never reached capture (older Safari, a
    // synthetic drag): an iframe cannot swallow what it cannot be hit by.
    const frames = Array.from(document.querySelectorAll('iframe'));

    if (isResizing) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      frames.forEach((frame) => { frame.style.pointerEvents = 'none'; });
    }

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      frames.forEach((frame) => { frame.style.pointerEvents = ''; });
    };
  }, [isResizing]);

  return {
    editingFile,
    editorWidth,
    editorExpanded,
    hasManualWidth,
    resizeHandleRef,
    handleFileOpen,
    handleCloseEditor,
    handleToggleEditorExpand,
    handleResizeStart,
    stopResizing,
  };
};
