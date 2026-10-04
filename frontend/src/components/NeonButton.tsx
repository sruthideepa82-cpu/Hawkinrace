import type { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
}

export function NeonButton({ variant = 'primary', className = '', ...rest }: Props) {
  return <button type="button" className={`neon-btn ${variant} ${className}`} {...rest} />;
}
