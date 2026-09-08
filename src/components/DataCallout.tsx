import type { ChapterAccent } from '@/components/ChapterKicker'

const ACCENT_VARS: Record<ChapterAccent, string> = {
  vermilion: 'var(--accent)',
  ochre: 'var(--ochre)',
  seaweed: 'var(--seaweed)',
  indigo: 'var(--indigo)',
  gold: 'var(--gold)',
}

/**
 * DataCallout (design.md §9): big-numeral editorial stat block — Fraunces
 * numerals (tabular via tnum) + Inter caption. Used for vote counts, area
 * ratios, distortion scores.
 */
export interface DataCalloutProps {
  /** The numeral, preformatted, e.g. "164" or "14.0×". */
  value: string
  /** Inter caption beneath the numeral. */
  caption: string
  /** Small unit/suffix after the numeral, e.g. "FOR", "km²". */
  suffix?: string
  /** lg = 120–200px hero numerals (UN vote); sm = substat. Default sm. */
  size?: 'lg' | 'sm'
  accent?: ChapterAccent
  className?: string
}

export default function DataCallout({
  value,
  caption,
  suffix,
  size = 'sm',
  accent,
  className,
}: DataCalloutProps) {
  return (
    <div className={className}>
      <div className="flex items-baseline gap-3">
        <span
          className={`data-numeral ${size === 'lg' ? 'text-data' : 'text-data-sm'}`}
          style={accent ? { color: ACCENT_VARS[accent] } : undefined}
        >
          {value}
        </span>
        {suffix && (
          <span
            className="font-ui text-kicker uppercase"
            style={{ color: accent ? ACCENT_VARS[accent] : 'var(--fg-3)' }}
          >
            {suffix}
          </span>
        )}
      </div>
      <p className="mt-3 max-w-[36ch] font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
        {caption}
      </p>
    </div>
  )
}
