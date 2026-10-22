import { formatPrestige, prestigeStars, prestigeTier } from '../sim/prestige';

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
      <span className="prestigeStarRow" role="img" aria-label={label}>
        {[1, 2, 3, 4, 5].map((slot) => {
          const fill = stars >= slot ? 'full' : stars >= slot - 0.5 ? 'half' : 'empty';
          return <span key={slot} className={`prestigeStar prestigeStar-${fill}`} aria-hidden="true">★</span>;
        })}
      </span>
      {showTier && <span className="prestigeTier">{tier}</span>}
      {showValue && <span className="prestigeValue">{formatPrestige(prestige)}</span>}
    </span>
  );
}

export default PrestigeStars;
