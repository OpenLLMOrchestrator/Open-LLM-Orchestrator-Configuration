import { useCallback, useEffect, useRef, useState } from 'react';

const COLLAPSED_WIDTH = 28;
const HANDLE_WIDTH = 10;
const MIN_WIDTH = 160;
const MAX_WIDTH = 520;

interface ResizablePanelProps {
  side: 'left' | 'right';
  width: number;
  onWidthChange: (w: number) => void;
  collapsed: boolean;
  onCollapsedChange: (c: boolean) => void;
  minWidth?: number;
  maxWidth?: number;
  children: React.ReactNode;
}

export function ResizablePanel({
  side,
  width,
  onWidthChange,
  collapsed,
  onCollapsedChange,
  minWidth = MIN_WIDTH,
  maxWidth = MAX_WIDTH,
  children,
}: ResizablePanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      startXRef.current = e.clientX;
      startWidthRef.current = width;
    },
    [width]
  );

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const delta = side === 'left' ? e.clientX - startXRef.current : startXRef.current - e.clientX;
      const next = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
      onWidthChange(next);
    };
    const onUp = () => setIsDragging(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, side, minWidth, maxWidth, onWidthChange]);

  if (collapsed) {
    return (
      <div
        style={{
          width: COLLAPSED_WIDTH,
          flexShrink: 0,
          background: 'var(--bg-panel)',
          borderRight: side === 'left' ? '1px solid var(--border)' : 'none',
          borderLeft: side === 'right' ? '1px solid var(--border)' : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
        onClick={() => onCollapsedChange(false)}
        title={side === 'left' ? 'Expand components' : 'Expand properties'}
      >
        <span
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            transform: 'rotate(180deg)',
            fontSize: '0.7rem',
            color: 'var(--text-muted)',
          }}
        >
          {side === 'left' ? 'Components' : 'Properties'}
        </span>
      </div>
    );
  }

  const handleZone = (
    <div
      style={{
        width: HANDLE_WIDTH,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: isDragging ? 'var(--accent)' : 'transparent',
        borderLeft: side === 'right' ? '1px solid var(--border)' : 'none',
        borderRight: side === 'left' ? '1px solid var(--border)' : 'none',
      }}
    >
      <div
        role="separator"
        aria-label="Resize"
        onMouseDown={handleMouseDown}
        style={{
          flex: 1,
          width: '100%',
          cursor: 'col-resize',
          minHeight: 40,
        }}
      />
      <button
        type="button"
        onClick={() => onCollapsedChange(true)}
        title={side === 'left' ? 'Collapse panel' : 'Collapse panel'}
        style={{
          padding: '4px 2px',
          border: 'none',
          background: 'transparent',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: '0.85rem',
        }}
      >
        {side === 'left' ? '◀' : '▶'}
      </button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexShrink: 0, height: '100%', minWidth: 0 }}>
      {side === 'right' && handleZone}
      <div
        style={{
          width: width - HANDLE_WIDTH,
          minWidth: 0,
          height: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
      {side === 'left' && handleZone}
    </div>
  );
}
