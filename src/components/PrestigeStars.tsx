import { formatPrestige, prestigeStars, prestigeTier } from '../sim/prestige';
import StarRow from './StarRow';

type PrestigeStarsProps = {
  prestige: number;
  /** Show the tier name ("National power") after the stars. */
  showTier?: boolean;
  /** Show the 1–100 prestige after the stars. */
  showValue?: boolean;
  size?: 'sm' | 'md';
};

/** A program's prestige as five stars in half steps, with the tier and number on request. */
function PrestigeStars({ prestige, showTier = false, showValue = false, size = 'sm' }: PrestigeStarsProps) {
  const stars = prestigeStars(prestige);
  const tier = prestigeTier(stars);
  const label = `${stars} of 5 stars, ${tier.toLowerCase()} (prestige ${formatPrestige(prestige)})`;
  return (
    <span className={`prestigeStars prestigeStars-${size}`} title={label}>
      <StarRow stars={stars} label={label} />
      {showTier && <span className="prestigeTier">{tier}</span>}
      {showValue && <span className="prestigeValue">{formatPrestige(prestige)}</span>}
    </span>
  );
}

export default PrestigeStars;
