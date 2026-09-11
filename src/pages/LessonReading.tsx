import { lessonStories } from './lessonStories'
import type { Lesson } from './pythonLessons'

export function EqualEarthNote() {
  return (
    <aside className="pf-constant-note">
      <h3>Where do A₁, A₂, A₃, and A₄ come from?</h3>
      <p>
        They are the published polynomial coefficients chosen by Equal Earth’s designers, Bojan
        Šavrič, Tom Patterson, and Bernhard Jenny. The designers used least-squares fitting to turn
        their chosen spacing of parallels into a smooth polynomial. The aim was a familiar,
        Robinson-like outline that also preserves relative areas.
      </p>
      <p>
        These are design coefficients, not physical constants. They control F(θ), the vertical
        spacing. Pairing F with its derivative in x is what preserves area. Changing a coefficient
        creates your own variant; it is no longer the published Equal Earth projection.
      </p>
      <a
        href="https://shadedrelief.com/ee_proj/EEp_Math_and_Implementation_details_%202019-04-16.pdf"
        target="_blank"
        rel="noopener noreferrer"
      >
        Read the published equations ↗
      </a>
      <a
        href="https://www.equal-earth.com/NACIS_slides.pdf"
        target="_blank"
        rel="noopener noreferrer"
      >
        See the designers’ fitting method ↗
      </a>
    </aside>
  )
}

export function LessonStory({ lesson }: { lesson: Lesson }) {
  const story = lessonStories[lesson.id]
  return (
    <section className="pf-story" aria-labelledby="lesson-story-title">
      <p className="pf-eyebrow">Understand {lesson.name}</p>
      <h2 id="lesson-story-title">What is this code actually doing?</h2>
      <div className="pf-story-grid">
        <div>
          <h3>The simple explanation</h3>
          <p>{story.simple}</p>
        </div>
      </div>
    </section>
  )
}
