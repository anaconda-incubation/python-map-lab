export default function CircleGuide({ active, start }: { active: boolean; start: () => void }) {
  return (
    <section className="circle-guide" aria-labelledby="circle-guide-title">
      <p className="eyebrow">Learn to read the map</p>
      <h3 id="circle-guide-title">Follow the circles.</h3>
      <p>
        Imagine the same small circle drawn on Earth in different places. A projection can enlarge
        it, shrink it, or stretch it into an ellipse. These marks make the tradeoffs visible.
      </p>
      <svg
        viewBox="0 0 330 100"
        role="img"
        aria-label="Three examples: an unchanged circle, a larger circle with more area, and a stretched ellipse with the original area."
      >
        <g fill="var(--soft-accent)" stroke="var(--accent)" strokeWidth="2">
          <circle cx="52" cy="40" r="18" />
          <circle cx="161" cy="40" r="29" />
          <ellipse cx="276" cy="40" rx="32" ry="10.125" />
        </g>
        <g fill="currentColor" textAnchor="middle" fontSize="11" fontFamily="Inter, sans-serif">
          <text x="52" y="87">
            Unchanged
          </text>
          <text x="161" y="87">
            More area
          </text>
          <text x="276" y="87">
            Same area, new shape
          </text>
        </g>
      </svg>
      <p className="lesson-small">
        On the globe, circles near the rim look flatter because you see them at an angle. That is
        perspective, before any flat-map distortion. The drawn circles are a finite-size
        illustration of Tissot’s tiny-circle idea.
      </p>
      <button className="primary-button" onClick={start}>
        {active ? 'Restart the circle guide' : 'Show the circles on Earth'} →
      </button>
    </section>
  )
}
