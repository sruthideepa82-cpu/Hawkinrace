interface Props {
  label: string;
  value: number;
  max?: number;
}

export function StatBar({ label, value, max = 10 }: Props) {
  const blocks = Array.from({ length: max }, (_, i) => i < value);
  return (
    <div className="stat" aria-label={`${label} ${value} of ${max}`}>
      <span className="stat-label">{label}</span>
      <div className="stat-blocks" style={{ display: 'flex', gap: '2px' }}>
        {blocks.map((filled, i) => (
          <span 
            key={i} 
            style={{
              flex: 1,
              height: '6px',
              backgroundColor: filled ? 'var(--accent)' : 'rgba(255, 255, 255, 0.15)',
              boxShadow: filled ? '0 0 6px var(--accent)' : 'none'
            }} 
          />
        ))}
      </div>
      <span className="stat-value">{value}</span>
    </div>
  );
}
