import type { ReactNode } from 'react';
import { HashLink } from '../router/HashLink';
import type { Screen } from '../router/routes';
import './main-menu.css';

const ITEMS: { id: string; label: string; to: Screen; icon: ReactNode }[] = [
  { 
    id: 'race', label: 'RACE', to: 'character',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
  },
  { 
    id: 'garage', label: 'GARAGE', to: 'garage',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
  },
  { 
    id: 'leaderboard', label: 'LEADERBOARD', to: 'leaderboard',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
  },
  { 
    id: 'settings', label: 'SETTINGS', to: 'settings',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
  },
];

export function MainMenuPage() {
  return (
    <div className="main-menu-layout">
      {/* Cinematic Hero Background */}
      <div className="hero-background">
        <img src="/assets/nitro-run-main-menu.jpg" alt="Cinematic Racing" className="hero-img" />
        <div className="hero-glass-panel"></div>
        <div className="hero-gradient-overlay"></div>
        <div className="hero-fog-overlay"></div>
        <div className="hero-grain"></div>
      </div>

      <div className="main-menu-content">
        <div className="menu-header">
          <div className="player-profile">
            <span className="profile-icon"></span>
            GUEST_DRIVER_01
          </div>
        </div>

        <div className="menu-center">
          <div className="menu-brand">
            <div className="brand-subtitle">HAWKINS:</div>
            <h1 className="brand-title">NITRO RUN</h1>
            <div className="brand-tagline">THE NIGHT IS YOURS.</div>
          </div>

          <nav className="cinematic-nav" aria-label="Main menu">
            {ITEMS.map((item) => (
              <HashLink key={item.id} to={item.to} className="cinematic-nav-item">
                <span className="nav-accent-line"></span>
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </HashLink>
            ))}
          </nav>
        </div>

        <div className="menu-footer">
          <div className="build-version">v1.2.0.4 - HAWKINS DEV BUILD</div>
        </div>
      </div>
    </div>
  );
}