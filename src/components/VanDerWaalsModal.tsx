import { useUnitConversion } from '../hooks/useUnitConversion'

interface VanDerWaalsModalProps {
  isOpen: boolean
  onClose: () => void
}

const VanDerWaalsModal = ({ isOpen, onClose }: VanDerWaalsModalProps) => {
  const { convertPressure, convertTemperature } = useUnitConversion();
  
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg p-6 max-w-xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-orange-400">Real Gas Calculations</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 text-sm text-gray-300">
          <div>
            <p>
              At high pressures, gases don&apos;t behave ideally. Molecules have size and attract each other, 
              which changes how pressure and volume relate. The Van der Waals equation corrects for these effects, 
              giving more accurate results than the ideal gas law.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-blue-400 mb-2">Why Our Results Differ</h4>
            <p>
              Most online dive blending calculators use a <span className="font-semibold text-red-400">linear approximation </span> 
              when mixing gases. We use the more accurate (and more complicated) <span className="font-semibold text-green-400">quadratic mixing rule </span> 
              for the attraction term (<i>a</i>). This better reflects how oxygen, nitrogen, and helium interact under 
              pressure. The result is more realistic — but it may differ slightly from calculators that use linear assumptions.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-blue-400 mb-2">When It Matters Most</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Tank pressures above ~{convertPressure(150).formatted}</li>
              <li>Cold fills (below {convertTemperature(10).formatted})</li>
              <li>Helium-rich trimix blends</li>
              <li>When accuracy of ±1% really matters</li>
            </ul>
          </div>

          <div className="bg-yellow-900 bg-opacity-30 p-3 rounded border-l-4 border-yellow-500">
            <h4 className="font-semibold text-yellow-400 mb-2">⚠️ Remember</h4>
            <ul className="list-disc list-inside space-y-1 text-yellow-100">
              <li>These corrections are only applied in partial-pressure blending</li>
              <li>Always confirm with an analyzer before diving</li>
              <li>Helium behaves closest to ideal — O₂ and N₂ show the biggest deviations</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white transition-colors"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  )
}

export default VanDerWaalsModal