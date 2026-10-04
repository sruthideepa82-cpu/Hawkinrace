export function Logo({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  return (
    <h1 className={`logo logo-${size}`} aria-label="HAWKINS: NITRO RUN">
      <span className="logo-top">HAWKINS:</span>
      <span className="logo-main">NITRO RUN</span>
    </h1>
  );
}
