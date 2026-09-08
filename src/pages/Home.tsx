import PythonDiscovery from '@/chapters/PythonDiscovery'
import ProjectionExplorer from '@/chapters/ProjectionExplorer'
import Ch00Opening from '@/chapters/Ch00Opening'
import Ch01Impossibility from '@/chapters/Ch01Impossibility'
import Ch02DistortionEngine from '@/chapters/Ch02DistortionEngine'
import Ch03Mercator from '@/chapters/Ch03Mercator'
import Ch04GallPeters from '@/chapters/Ch04GallPeters'
import Ch05EqualEarth from '@/chapters/Ch05EqualEarth'
import Ch06AuthaGraph from '@/chapters/Ch06AuthaGraph'
import Ch07MorphStudio from '@/chapters/Ch07MorphStudio'
import Ch08Scorecard from '@/chapters/Ch08Scorecard'
import Ch09AreaTest from '@/chapters/Ch09AreaTest'
import Ch10MoveACircle from '@/chapters/Ch10MoveACircle'
import Ch11Interlude from '@/chapters/Ch11Interlude'
import Ch12UnitedNations from '@/chapters/Ch12UnitedNations'
import Ch13Ending from '@/chapters/Ch13Ending'
import Ch14Colophon from '@/chapters/Ch14Colophon'

/**
 * The scrollytelling essay (design.md §2, home.md). Chapters are owned by
 * chapter agents — this page only defines their order.
 */
export default function Home() {
  return (
    <article className="atlas-essay" aria-label="Every Flat Map Is a Choice — an interactive essay">
      <Ch00Opening />
      <div className="atlas-handoff" aria-hidden="true" />
      <ProjectionExplorer />
      <PythonDiscovery />
      <Ch01Impossibility />
      <Ch02DistortionEngine />
      <Ch03Mercator />
      <Ch04GallPeters />
      <Ch05EqualEarth />
      <Ch06AuthaGraph />
      <Ch07MorphStudio />
      <Ch08Scorecard />
      <Ch09AreaTest />
      <Ch10MoveACircle />
      <Ch11Interlude />
      <Ch12UnitedNations />
      <Ch13Ending />
      <Ch14Colophon />
    </article>
  )
}
