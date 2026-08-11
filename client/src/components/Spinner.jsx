export function Spinner({ light = false, size = 22, style }) {
  return <span className={`spinner${light ? " spinner-light" : ""}`} style={{ width: size, height: size, ...style }} />;
}

export function LoadingCard({ text = "Loading..." }) {
  return (
    <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
      <Spinner size={18} />
      <span className="muted small bold">{text}</span>
    </div>
  );
}

export function SkeletonCard({ height = 260 }) {
  return <div className="skeleton" style={{ height, borderRadius: 22, border: "1px solid var(--border-2)" }} />;
}
