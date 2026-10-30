interface Props {
  /** Indeterminate sliding line (design-system scan-line). */
  running?: boolean;
  /** Determinate 0–1 fill, drawn under the sliding line. */
  value?: number;
  label?: string;
}

export function ScanLine({ running = false, value, label }: Props) {
  const determinate = typeof value === "number";
  return (
    <div
      className={`scanline ${running ? "" : "is-idle"}`}
      role="progressbar"
      aria-label={label ?? "Progress"}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? Math.round((value as number) * 100) : undefined}
      aria-busy={running}
    >
      {determinate && (
        <div className="scanline__fill" style={{ transform: `scaleX(${Math.min(Math.max(value as number, 0), 1)})`, opacity: 0.35 }} />
      )}
      <div className="scanline__run" />
    </div>
  );
}
