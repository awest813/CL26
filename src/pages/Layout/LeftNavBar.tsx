import { NavLink } from 'react-router-dom';

const navGroups = [
  {
    label: 'Career Mode',
    links: [
      { to: '/career', label: 'Career HQ', description: 'Recruiting + progression' },
      { to: '/career/setup', label: 'Career Setup', description: 'Coach profile + school selection' },
    ],
  },
  {
    label: 'Season Center',
    links: [
      { to: '/', label: 'Dashboard', description: 'Global status and next action' },
      { to: '/season', label: 'Season Dashboard', description: 'Sim control and key metrics' },
      { to: '/season/standings', label: 'Standings', description: 'Conference races' },
      { to: '/playoffs', label: 'Playoffs', description: 'Top-12 bracket view' },
    ],
  },
  {
    label: 'League Tools',
    links: [
      { to: '/rankings', label: 'Rankings', description: 'Top 25 + playoff projection' },
      { to: '/conferences', label: 'Conferences', description: 'All schools and divisions' },
      { to: '/exhibition', label: 'Exhibition', description: 'Single game sandbox' },
    ],
  },
];

function LeftNavBar() {
  return (
    <nav className="leftNav">
      <div className="menuTitleRow">
        <h2>Navigation</h2>
        <span className="badge">Session 3</span>
      </div>
      {navGroups.map((group) => (
        <section key={group.label} className="menuGroup">
          <h3>{group.label}</h3>
          {group.links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === '/'}>
              <span className="menuLabel">{link.label}</span>
              <small>{link.description}</small>
            </NavLink>
          ))}
        </section>
      ))}
    </nav>
  );
}

export default LeftNavBar;
