import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * ChapterKicker (design.md §4, §6, §9): kicker + numeral, vermilion rule
 * wipe (scaleX 0→1, 500ms, ease-atlas), then title words rise
 * (stagger 60ms), then the standfirst. Reveals once via IntersectionObserver.
 */

export type ChapterAccent = 'vermilion' | 'ochre' | 'seaweed' | 'indigo' | 'gold'

const ACCENT_VARS: Record<ChapterAccent, string> = {
  vermilion: 'var(--accent)',
  ochre: 'var(--ochre)',
  seaweed: 'var(--seaweed)',
  indigo: 'var(--indigo)',
  gold: 'var(--gold)',
}

export interface ChapterKickerProps {
  /** Chapter numeral, e.g. "03". Omit for prologue/interlude/epilogue. */
  numeral?: string
  /** Kicker line, e.g. "A MERCATOR WORLD". Rendered as `CHAPTER 03 · A MERCATOR WORLD`. */
  kicker: string
  /** Fraunces chapter title. */
  title: string
  /** 2–3 sentence standfirst, 22px Source Serif italic-leaning. */
  standfirst?: string
  /** Rule + numeral accent color (chapter color). Default vermilion. */
  accent?: ChapterAccent
  /** id for the title element — pair with the section's aria-labelledby. */
  titleId?: string
  className?: string
}

export default function ChapterKicker({
  numeral,
  kicker,
  title,
  standfirst,
  accent = 'vermilion',
  titleId,
  className,
}: ChapterKickerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [revealed, setRevealed] = useState(false)
  const words = useMemo(() => title.split(' '), [title])
  const accentVar = ACCENT_VARS[accent]

  useEffect(() => {
    const el = ref.current
    if (!el || revealed) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRevealed(true)
          io.disconnect()
        }
      },
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [revealed])

  return (
    <div ref={ref} className={`${revealed ? 'is-revealed ' : ''}${className ?? ''}`}>
      <p className="kicker">
        {numeral ? (
          <>
            <span style={{ color: accentVar }}>CHAPTER {numeral}</span>
            <span aria-hidden> · </span>
            {kicker}
          </>
        ) : (
          <span style={{ color: accentVar }}>{kicker}</span>
        )}
      </p>
      <div
        className="ck-rule mt-5 h-[2px] w-24"
        style={{ background: accentVar }}
        aria-hidden
      />
      <h2
        id={titleId}
        className="ck-title display-tight mt-6 font-display text-chapter"
        style={{ color: 'var(--fg)', fontWeight: 400 }}
      >
        {words.map((w, i) => (
          <span key={i} className="ck-line" style={{ display: 'inline-block' }}>
            <span
              className="ck-inner"
              style={{ transitionDelay: `${500 + i * 60}ms` }}
            >
              {w}
              {i < words.length - 1 ? ' ' : ''}
            </span>
          </span>
        ))}
      </h2>
      {standfirst && (
        <p
          className="ck-standfirst mt-6 max-w-measure font-body text-standfirst italic"
          style={{ color: 'var(--fg-2)' }}
        >
          {standfirst}
        </p>
      )}
    </div>
  )
}
