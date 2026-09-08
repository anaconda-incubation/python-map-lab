import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { authagraphPoint } from '@/projection/authagraph'
import { lessons } from '../pythonLessons'

describe('AuthaGraph lesson verification', () => {
  it('provides the complete implementation and reproducible cross-language checks', () => {
    const lesson = lessons.find(l => l.id === 'authagraph')!
    expect(lesson.supportCode).toContain('SPDX-License-Identifier: MPL-2.0')
    expect(lesson.supportCode).toContain('def unfold_rectangle(')
    // Run this generated script in the site's Python editor to compare the
    // NumPy port with the existing canonical TypeScript projection.
    const inputs: number[][] = [], expected: number[][] = []
    for (let lat=-85;lat<=85;lat+=17) for(let lon=-180;lon<=180;lon+=30) {
      const lo=lon*Math.PI/180, la=lat*Math.PI/180
      inputs.push([lo,la]);const p=authagraphPoint(lo,la);expected.push([p.x,p.y])
    }
    const verify = `${lesson.code}\n\ncheck = np.array(${JSON.stringify(inputs)})\nexpected = np.array(${JSON.stringify(expected)})\nactual = np.column_stack(project(check[:, 0], check[:, 1]))\nassert np.allclose(actual, expected, atol=1e-8), np.max(np.abs(actual-expected))\nprint("PASS: ${inputs.length} AuthaGraph points match the canonical projection")\n`
    if(process.env.AUTHAGRAPH_REVIEW_OUT) writeFileSync(process.env.AUTHAGRAPH_REVIEW_OUT,verify)
    expect(inputs.length).toBe(143)
  })
})
