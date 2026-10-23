import { coachStars, coachTier } from '../sim/coachRating';
import StarRow from './StarRow';

type CoachStarsProps = {
  rating: number;
  /** Show the tier name ("Proven") after the stars. */
  showTier?: boolean;
  /** Show the rating number after the stars. */
  showValue?: boolean;
  size?: 'sm' | 'md';
};

/** A coach's rating as five stars in half steps, on the same scale look as program prestige. */
function CoachStars({ rating, showTier = false, showValue = false, size = 'sm' }: CoachStarsProps) {
  const stars = coachStars(rating);
  const tier = coachTier(stars);
  const label = `${stars} of 5 stars, ${tier.toLowerCase()} coach (rating ${Math.round(rating)})`;
  return (
    <span className={`prestigeStars prestigeStars-${size}`} title={label}>
      <StarRow stars={stars} label={label} />
      {showTier && <span className="prestigeTier">{tier}</span>}
      {showValue && <span className="prestigeValue">{Math.round(rating)}</span>}
    </span>
  );
}

export default CoachStars;
