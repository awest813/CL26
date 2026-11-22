import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { IconWarning } from '../components/UiIcons';
import SaveStatusBanner from '../components/SaveStatusBanner';
import UpdatePrompt from '../components/UpdatePrompt';
import Footer from './Layout/Footer';
import Header from './Layout/Header';
import LeftNavBar from './Layout/LeftNavBar';
import { useSeasonSanityCheck } from '../hooks/useSeasonSanityCheck';
import { applyDensity, applyTheme } from '../features/settings/settingsSlice';
import { useAppSelector } from '../store/hooks';
import './style.css';

/** Above this width the menu is a sidebar, not a drawer. Matches the 980px breakpoint in style.css. */
const DRAWER_QUERY = '(max-width: 980px)';

function Layout() {
  const { isValid, error } = useSeasonSanityCheck();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const theme = useAppSelector((state) => state.settings.theme);
  const density = useAppSelector((state) => state.settings.density);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    applyDensity(density);
  }, [density]);

  // Scroll targets (the week's result, the hub's jump links) must land below the sticky
  // header, whose height changes with the viewport and its contents. Keep it measured.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('header.header');
    if (!header || typeof ResizeObserver === 'undefined') return undefined;
    const update = () => {
      const bottom = header.getBoundingClientRect().height + (parseFloat(getComputedStyle(header).top) || 0);
      document.documentElement.style.setProperty('--header-clearance', `${Math.ceil(bottom + 12)}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const closeMenu = useCallback((returnFocus: boolean) => {
    setIsMenuOpen(false);
    if (returnFocus) menuButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    setIsMenuOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMenuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeMenu(true);
    }
    // The drawer is gone once the window grows into the sidebar layout.
    const drawerQuery = window.matchMedia(DRAWER_QUERY);
    function onWidthChange(event: MediaQueryListEvent) {
      if (!event.matches) setIsMenuOpen(false);
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // The drawer is modal: the header and the page behind it leave the tab order until it closes.
    const behind = [
      document.querySelector<HTMLElement>('.skip-link'),
      document.querySelector<HTMLElement>('.dynastyHeader'),
      document.getElementById('main-content'),
    ];
    behind.forEach((element) => element?.setAttribute('inert', ''));
    window.addEventListener('keydown', onKeyDown);
    drawerQuery.addEventListener('change', onWidthChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      behind.forEach((element) => element?.removeAttribute('inert'));
      window.removeEventListener('keydown', onKeyDown);
      drawerQuery.removeEventListener('change', onWidthChange);
    };
  }, [isMenuOpen, closeMenu]);

  return (
    <div className={`layout ${isMenuOpen ? 'layout-menuOpen' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Header
        menuOpen={isMenuOpen}
        onToggleMenu={() => setIsMenuOpen((current) => !current)}
        menuButtonRef={menuButtonRef}
      />
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
      <SaveStatusBanner />
      <UpdatePrompt />
      <div className="layoutBody">
        <div id="app-primary-menu">
          <LeftNavBar
            isMenuOpen={isMenuOpen}
            onNavigate={() => setIsMenuOpen(false)}
            onClose={() => closeMenu(true)}
          />
        </div>
        {isMenuOpen && (
          <div className="navBackdrop" aria-hidden="true" onClick={() => closeMenu(true)} />
        )}
        <main id="main-content" className="childBody" tabIndex={-1}>
          <Outlet />
          <Footer />
        </main>
      </div>
    </div>
  );
}

export default Layout;
