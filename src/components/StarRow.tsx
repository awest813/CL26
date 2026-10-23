type StarRowProps = {
  /** 1 to 5 in half steps. */
  stars: number;
  /** Read by screen readers and shown on hover. */
  label: string;
};

/** Five stars in half steps; the shared mark for program prestige and coach ratings. */
function StarRow({ stars, label }: StarRowProps) {
  return (
    <span className="prestigeStarRow" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((slot) => {
        const fill = stars >= slot ? 'full' : stars >= slot - 0.5 ? 'half' : 'empty';
        return <span key={slot} className={`prestigeStar prestigeStar-${fill}`} aria-hidden="true">★</span>;
      })}
    </span>
  );
}

export default StarRow;
