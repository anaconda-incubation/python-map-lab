export const lessonStories: Record<
  string,
  {
    simple: string
    objective: string
    history: string
    source: string
    sourceLabel: string
  }
> = {
  mercator: {
    simple:
      'Imagine putting the Earth inside a paper tube. Longitude tells us how far to move sideways. Near the poles, the real Earth’s east–west circles get smaller, but our paper stays wide. The logarithm stretches the paper vertically to match. Small angles keep their shape, while countries near the poles look much larger.',
    objective:
      'Help a navigator draw a constant compass bearing as a straight line. Preserving local angles serves that task; comparing continent sizes was not the priority.',
    history:
      'Gerardus Mercator published his navigation-focused world map in 1569. Its useful rectangular grid later became familiar far beyond navigation.',
    source: 'https://pubs.usgs.gov/bul/1532/report.pdf',
    sourceLabel: 'Read the USGS projection guide',
  },
  gallPeters: {
    simple:
      'Think of a country as a piece of stretchy dough. We can make it taller and narrower without adding dough. The cosine shrinks the horizontal direction, and the sine-based vertical formula compensates. Countries keep the right amount of space, but their shapes change.',
    objective:
      'Make area comparisons honest. Africa and Greenland should occupy space in proportion to their actual areas. The price is stretching shapes, especially far from the standard parallels.',
    history:
      'James Gall described this projection in 1855. Arno Peters popularized it in 1973, emphasizing the importance of representing countries in their correct relative sizes. The same cylindrical equal-area family offers many standard-parallel choices.',
    source: 'https://pubs.usgs.gov/pp/1395/report.pdf',
    sourceLabel: 'Read the USGS map-projection manual',
  },
  equalEarth: {
    simple:
      'Instead of forcing the world into a rectangle, let its sides curve. The polynomial decides the vertical position. Its derivative tells us how much that position is stretching locally; dividing by it adjusts the width so the area still balances.',
    objective:
      'Keep true relative areas while giving the world a rounded, readable outline. The coefficients balance appearance and shape distortion; they are design choices, not magic numbers.',
    history:
      'Bojan Šavrič, Tom Patterson, and Bernhard Jenny introduced Equal Earth in 2018. They combined the useful area property with a familiar-looking world-map shape and published the formulas for others to implement.',
    source: 'https://shadedrelief.com/ee_proj/',
    sourceLabel: 'Read the designers’ introduction',
  },
  authagraph: {
    simple:
      'Imagine marking places on a ball. First rotate it so your chosen latitude and longitude will land in the middle of the finished map. Then move the marks onto a four-sided solid and open it into a flat sheet. The code finds the region for each place, flattens it, and arranges the pieces into a rectangle. Changing the center also moves the cuts.',
    objective:
      'Spread distortion across the world. The original orientation keeps Antarctica whole; a custom center can move a cut through it or another continent. Centering a place does not preserve distances from it. Unlike Gall–Peters and Equal Earth, this formulation does not preserve area exactly at every tiny point.',
    history:
      'Hajime Narukawa developed AuthaGraph through a geometric construction. His 2022 paper gives a mathematical formulation using cones and a tetrahedron. That is the formulation here, with a public rectangle arrangement, rather than the original hand-built commercial artwork.',
    source: 'https://doi.org/10.11212/jjca.60.1_1',
    sourceLabel: 'Read Narukawa’s formulation',
  },
}
