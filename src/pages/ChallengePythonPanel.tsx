import PythonPanel, { type PythonPanelProps } from '@/chapters/PythonPanel'
import { challengeSamples, checkMollweide } from './mollweideChecks'
export default function ChallengePythonPanel(props: PythonPanelProps) {
  return (
    <PythonPanel
      {...props}
      filename="mollweide.py"
      checkResult={{ samples: challengeSamples, evaluate: checkMollweide }}
    />
  )
}
