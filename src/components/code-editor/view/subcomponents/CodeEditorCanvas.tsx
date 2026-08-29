import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Code2, Copy, ExternalLink, Loader2, Maximize2, Minimize2, Pencil, Redo2, Save, Trash2, Undo2, X } from 'lucide-react';

import { api } from '../../../../utils/api';
import { CANVAS_MESSAGE_SOURCE, isDesignCanvas, withCanvasEditShim, withVisualEditorBridge, type CanvasMessage, type VisualEditorCommand } from '../../utils/designCanvas';
import type { CodeEditorFile } from '../../types/types';

type Props = {
  file: CodeEditorFile; content: string; projectId: string | undefined;
  onClose: () => void; onShowCode: () => void; onContentSaved: (content: string) => void; isSidebar: boolean; isExpanded: boolean;
  onToggleExpand: (() => void) | null; onPopOut: (() => void) | null;
};
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Provider-independent visual editor for the actual HTML file. */
export default function CodeEditorCanvas({ file, content, projectId, onClose, onShowCode, onContentSaved, isSidebar, isExpanded, onToggleExpand, onPopOut }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const seededCanvas = isDesignCanvas(content);
  const blobUrl = useMemo(() => URL.createObjectURL(new Blob([
    seededCanvas ? withCanvasEditShim(content) : withVisualEditorBridge(content),
  ], { type: 'text/html' })), [content, seededCanvas]);

  useEffect(() => () => URL.revokeObjectURL(blobUrl), [blobUrl]);

  const persist = useCallback(async (page: string) => {
    if (!projectId) { setSaveState('error'); return; }
    setSaveState('saving');
    try {
      const response = await api.saveFile(projectId, file.path, page);
      if (!response.ok) throw new Error(`Save failed (${response.status})`);
      onContentSaved(page);
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1800);
    } catch { setSaveState('error'); }
  }, [file.path, onContentSaved, projectId]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = event.data as CanvasMessage | undefined;
      if (message?.source !== CANVAS_MESSAGE_SOURCE) return;
      if (message.type === 'save' && typeof message.page === 'string') void persist(message.page);
      if (message.type === 'selection') setSelectedTag(message.tag);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [persist]);

  const command = useCallback((value: VisualEditorCommand) => {
    iframeRef.current?.contentWindow?.postMessage({ source: CANVAS_MESSAGE_SOURCE, type: 'command', command: value }, '*');
  }, []);
  const popOut = useCallback(() => {
    const popup = window.open(blobUrl, '_blank', 'noopener,noreferrer');
    if (popup) popup.opener = null;
  }, [blobUrl]);

  return <div className="flex h-full w-full flex-col bg-background">
    <div className="flex flex-shrink-0 flex-wrap items-center gap-1 border-b border-border/60 px-2 py-2">
      <span className="mr-2 max-w-40 truncate text-sm font-medium">{file.name}</span>
      {!seededCanvas && <>
        <Tool title="Undo" onClick={() => command({ type: 'undo' })}><Undo2 /></Tool>
        <Tool title="Redo" onClick={() => command({ type: 'redo' })}><Redo2 /></Tool>
        <Tool title="Edit text (or double-click)" disabled={!selectedTag} onClick={() => command({ type: 'edit-text' })}><Pencil /></Tool>
        <Tool title="Duplicate" disabled={!selectedTag} onClick={() => command({ type: 'duplicate' })}><Copy /></Tool>
        <Tool title="Delete" disabled={!selectedTag} onClick={() => command({ type: 'delete' })}><Trash2 /></Tool>
        <Tool title="Bold" disabled={!selectedTag} onClick={() => command({ type: 'style', property: 'font-weight', value: '700' })}><Bold /></Tool>
        <Tool title="Align left" disabled={!selectedTag} onClick={() => command({ type: 'style', property: 'text-align', value: 'left' })}><AlignLeft /></Tool>
        <Tool title="Align center" disabled={!selectedTag} onClick={() => command({ type: 'style', property: 'text-align', value: 'center' })}><AlignCenter /></Tool>
        <Tool title="Align right" disabled={!selectedTag} onClick={() => command({ type: 'style', property: 'text-align', value: 'right' })}><AlignRight /></Tool>
        <ColorTool label="Text" disabled={!selectedTag} onChange={(value) => command({ type: 'style', property: 'color', value })} />
        <ColorTool label="Fill" disabled={!selectedTag} onChange={(value) => command({ type: 'style', property: 'background-color', value })} />
      </>}
      <div className="ml-auto flex items-center gap-1">
        {selectedTag && <span className="hidden rounded bg-muted px-2 py-1 font-mono text-[10px] sm:inline">{selectedTag}</span>}
        <span className="px-1 text-[11px] text-muted-foreground">{saveState === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{saveState === 'saved' && 'Saved'}{saveState === 'error' && 'Save failed'}</span>
        {!seededCanvas && <Tool title="Save HTML" onClick={() => command({ type: 'save' })}><Save /></Tool>}
        <Tool title="Source code" onClick={onShowCode}><Code2 /></Tool>
        <Tool title="Open preview in new window" onClick={popOut}><ExternalLink /></Tool>
        {isSidebar && onToggleExpand && <Tool title={isExpanded ? 'Collapse panel' : 'Expand panel'} onClick={onToggleExpand}>{isExpanded ? <Minimize2 /> : <Maximize2 />}</Tool>}
        {isSidebar && onPopOut && <Tool title="Open editor full window" onClick={onPopOut}><ExternalLink /></Tool>}
        <Tool title="Close" onClick={onClose}><X /></Tool>
      </div>
    </div>
    <div className="border-b border-border/50 bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground">{seededCanvas ? 'Design canvas' : 'Click an element to select it. Double-click text to edit it directly.'}</div>
    <iframe ref={iframeRef} src={blobUrl} title={file.name} sandbox="allow-forms allow-modals allow-popups allow-scripts" className="min-h-0 w-full flex-1 border-0 bg-white" />
  </div>;
}

function Tool({ title, onClick, disabled = false, children }: { title: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35 [&_svg]:h-4 [&_svg]:w-4">{children}</button>;
}
function ColorTool({ label, disabled, onChange }: { label: string; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="flex h-8 items-center gap-1 rounded border border-border px-1.5 text-[11px] text-muted-foreground">{label}<input aria-label={`${label} color`} type="color" disabled={disabled} className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0" onChange={(event) => onChange(event.target.value)} /></label>;
}
