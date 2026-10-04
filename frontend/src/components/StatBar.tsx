interface Props {
  label: string;
  value: number;
  max?: number;
}

export function StatBar({ label, value, max = 10 }: Props) {
  return (
    <div className="stat" aria-label={`${label} ${value} of ${max}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-track">
        <span className="stat-fill" style={{ width: `${(value / max) * 100}%` }} />
      </span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
