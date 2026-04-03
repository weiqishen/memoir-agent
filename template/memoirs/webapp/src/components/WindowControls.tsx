/**
 * WindowControls — rendered only when running inside pywebview (desktop app).
 * Accepts isMaximized + onToggleMaximize from parent so the header double-click
 * and the button stay in sync.
 */

/** Maximize icon: empty square □ */
const MaximizeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10">
    <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
);

/** Restore icon: two overlapping squares ⧉ */
const RestoreIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10">
    <rect x="2.5" y="0.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
    <rect x="0.5" y="2.5" width="7" height="7" fill="var(--bg-primary)" stroke="currentColor" strokeWidth="1" />
  </svg>
);

interface Props {
  isMaximized:       boolean;
  onToggleMaximize:  () => void;
}

export function WindowControls({ isMaximized, onToggleMaximize }: Props) {
  const api = () => (window as any).pywebview?.api;

  return (
    <div className="window-controls" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button className="wc-btn wc-min" onClick={() => api()?.minimize()} title="最小化">
        <svg width="10" height="1" viewBox="0 0 10 1">
          <rect width="10" height="1" fill="currentColor" />
        </svg>
      </button>

      <button className="wc-btn wc-max" onClick={onToggleMaximize}
        title={isMaximized ? '还原' : '最大化'}>
        {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>

      <button className="wc-btn wc-close" onClick={() => api()?.close()} title="关闭">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
          <line x1="10" y1="0" x2="0"  y2="10" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  );
}
