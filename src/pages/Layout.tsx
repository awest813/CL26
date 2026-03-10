import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Footer from './Layout/Footer';
import Header from './Layout/Header';
import LeftNavBar from './Layout/LeftNavBar';
import RightNavBar from './Layout/RightNavBar';
import { useSeasonSanityCheck } from '../hooks/useSeasonSanityCheck';
import './style.css';

function Layout() {
  const { isValid, error } = useSeasonSanityCheck();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  return (
    <main className={`layout ${isMenuOpen ? 'layout-menuOpen' : ''}`}>
      <Header />
      {!isValid && (
        <div className="statusBanner statusBanner-warning" role="status" aria-live="polite">
          ⚠️ Application State Warning: {error}
        </div>
      )}
      <div className="menuBarMobile">
        <button
          type="button"
          className="menuToggleButton"
          onClick={() => setIsMenuOpen((current) => !current)}
          aria-expanded={isMenuOpen}
          aria-controls="app-primary-menu"
          aria-label={isMenuOpen ? 'Close primary navigation menu' : 'Open primary navigation menu'}
        >
          {isMenuOpen ? '✕ Close Menu' : '☰ Open Menu'}
        </button>
      </div>
      <div className="layoutBody">
        <div id="app-primary-menu">
          <LeftNavBar isMenuOpen={isMenuOpen} onNavigate={() => setIsMenuOpen(false)} />
        </div>
        <div className="childBody">
          <Outlet />
          <Footer />
        </div>
        <RightNavBar />
      </div>
    </main>
  );
}

export default Layout;
