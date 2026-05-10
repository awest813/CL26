import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { IconClose, IconMenu, IconWarning } from '../components/UiIcons';
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
    <div className={`layout ${isMenuOpen ? 'layout-menuOpen' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Header />
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
      <div className="menuBarMobile">
        <button
          type="button"
          className="menuToggleButton"
          onClick={() => setIsMenuOpen((current) => !current)}
          aria-expanded={isMenuOpen}
          aria-controls="app-primary-menu"
        >
          {isMenuOpen ? (
            <>
              <IconClose className="menuToggleIcon" /> Close menu
            </>
          ) : (
            <>
              <IconMenu className="menuToggleIcon" /> Menu
            </>
          )}
        </button>
      </div>
      <div className="layoutBody">
        <div id="app-primary-menu">
          <LeftNavBar isMenuOpen={isMenuOpen} onNavigate={() => setIsMenuOpen(false)} />
        </div>
        <main id="main-content" className="childBody" tabIndex={-1}>
          <Outlet />
          <Footer />
        </main>
        <RightNavBar />
      </div>
    </div>
  );
}

export default Layout;
