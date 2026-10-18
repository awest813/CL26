import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { IconWarning } from '../components/UiIcons';
import Footer from './Layout/Footer';
import Header from './Layout/Header';
import LeftNavBar from './Layout/LeftNavBar';
import { useSeasonSanityCheck } from '../hooks/useSeasonSanityCheck';
import './style.css';

function Layout() {
  const { isValid, error } = useSeasonSanityCheck();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setIsMenuOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMenuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsMenuOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMenuOpen]);

  return (
    <div className={`layout ${isMenuOpen ? 'layout-menuOpen' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Header menuOpen={isMenuOpen} onToggleMenu={() => setIsMenuOpen((current) => !current)} />
      {!isValid && (
        <div className="statusBanner statusBanner-warning" role="status" aria-live="polite">
          <span className="statusBanner-icon" aria-hidden>
            <IconWarning />
          </span>
          <span>
            <strong>Save data notice.</strong> {error}
          </span>
        </div>
      )}
      <div className="layoutBody">
        <div id="app-primary-menu">
          <LeftNavBar isMenuOpen={isMenuOpen} onNavigate={() => setIsMenuOpen(false)} />
        </div>
        <main id="main-content" className="childBody" tabIndex={-1}>
          <Outlet />
          <Footer />
        </main>
      </div>
    </div>
  );
}

export default Layout;
