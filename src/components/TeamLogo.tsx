import { teamMark } from '../sim/teamMark';

type TeamLogoProps = {
  team: { id: string; schoolName: string };
  size?: 'sm' | 'md' | 'lg';
};

function TeamLogo({ team, size = 'md' }: TeamLogoProps) {
  const mark = teamMark(team);
  return (
    <span
      className={`teamLogo teamLogo-${size} ${mark.letters.length >= 4 ? 'teamLogo-wide' : ''}`}
      style={{
        backgroundColor: mark.primary,
        color: mark.ink,
        boxShadow: `inset 0 -0.28em 0 ${mark.secondary}`,
      }}
      aria-hidden="true"
    >
      {mark.letters}
    </span>
  );
}

export default TeamLogo;
