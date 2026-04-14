import { safeRound, RoundingType } from '../utils/safeRounding'
import { calculateCNSPercent } from '../utils/endModCalculations'
import TankVisualization from './TankVisualization'
import { useUnitConversion } from '../hooks/useUnitConversion'

type GasType = 'nitrox' | 'trimix'

interface GasParams {
  oxygen: number
  helium: number
  nitrogen: number
  mod: number
  ppo2: number
  end: number
  tankSizeL: number
  selectedTankId?: string
}

interface AnalysisResultsProps {
  gasType: GasType
  gasParams: GasParams
  actualPPO2: number
  absPressure: number
  calculatedEND: number
  density: number
  isLoading?: boolean
  diveTimeMinutes?: number  // for CNS calculation, default 60 min
}

export default function AnalysisResults({
  gasType,
  gasParams,
  actualPPO2,
  absPressure,
  calculatedEND,
  density,
  isLoading = false,
  diveTimeMinutes = 60
}: AnalysisResultsProps) {
  const { convertPressure, convertDepth, convertDensity, getUnitLabels } = useUnitConversion()
  const unitLabels = getUnitLabels()

  // CNS% calculation — only meaningful when PPO₂ ≥ 0.6
  const cnsPercent = actualPPO2 >= 0.6 ? calculateCNSPercent(actualPPO2, diveTimeMinutes) : null

  const getCNSColor = (cns: number): string => {
    if (cns < 25) return 'text-green-400'
    if (cns < 50) return 'text-yellow-400'
    if (cns < 75) return 'text-orange-400'
    return 'text-red-400'
  }

  const LoadingSpinner = () => (
    <div className="flex items-center justify-center">
      <div className="animate-spin rounded-full h-5 w-5 border-2 border-yellow-400 border-t-transparent"></div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="bg-gray-700 border border-black rounded-lg p-3 sm:p-4 text-center">
          <div className="text-gray-400 text-sm mb-1">Gas Mix</div>
          <div className="text-yellow-400 font-bold">
            {gasType === 'trimix' ?
              `${safeRound(gasParams.oxygen, RoundingType.O2, 0)}/${safeRound(gasParams.helium, RoundingType.HE, 0)}` :
              `EANx${safeRound(gasParams.oxygen, RoundingType.O2, 0)}`
            }
          </div>
        </div>

        <div className="bg-gray-700 border border-black rounded-lg p-3 sm:p-4 text-center">
          <div className="text-gray-400 text-sm mb-1">Current PPO₂</div>
          <div className="text-yellow-400 font-bold">{safeRound(actualPPO2, RoundingType.PPO2, 2)}</div>
        </div>

        <div className="bg-gray-700 border border-black rounded-lg p-3 sm:p-4 text-center">
          <div className="text-gray-400 text-sm mb-1">MOD @ PPO₂</div>
          <div className="text-yellow-400 font-bold">{convertDepth(gasParams.mod, 1).formatted}</div>
        </div>

        <div className="bg-gray-700 border border-black rounded-lg p-3 sm:p-4 text-center">
          <div className="text-gray-400 text-sm mb-1">Abs Pressure @ MOD</div>
          <div className="text-yellow-400 font-bold">{convertPressure(absPressure, 2).formatted}</div>
        </div>

        <div className="bg-gray-700 border border-black rounded-lg p-3 sm:p-4 text-center">
          <div className="text-gray-400 text-sm mb-1">END @ MOD</div>
          <div className="text-yellow-400 font-bold">{convertDepth(calculatedEND, 1).formatted}</div>
        </div>

        <div className="bg-gray-700 border border-black rounded-lg p-3 sm:p-4 text-center">
          <div className="text-gray-400 text-sm mb-1">Gas Density</div>
          <div className="text-yellow-400 font-bold">{convertDensity(safeRound(density, RoundingType.DENSITY)).formatted}</div>
        </div>
      </div>

      {/* CNS% Estimate Card — full-width, only shown when PPO₂ ≥ 0.6 */}
      {cnsPercent !== null && (
        <div className={`bg-gray-700 border border-black rounded-lg p-4 text-center ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="text-gray-400 text-sm mb-1">CNS% Estimate</div>
          <div className={`font-bold text-lg ${getCNSColor(cnsPercent)}`}>
            {cnsPercent}%
            <span className="text-gray-400 text-sm font-normal ml-1">(@ {diveTimeMinutes} min)</span>
          </div>
          <div className="text-gray-500 text-xs mt-1">
            Single-dive estimate. Based on NOAA O₂ exposure table.
          </div>
        </div>
      )}

      {/* Tank Visualization Section */}
      <div className="bg-gray-700 border border-black rounded-lg p-4">
        <h4 className="text-yellow-400 font-semibold mb-3 text-center">Tank Visualization</h4>
        <div className="flex justify-center">
          <TankVisualization
            o2Percent={gasParams.oxygen}
            n2Percent={gasParams.nitrogen}
            hePercent={gasParams.helium}
            totalPressure={absPressure}
            tankSizeL={gasParams.tankSizeL}
            maxPPO2={gasParams.ppo2}
            iconMode={false}
          />
        </div>
      </div>
    </div>
  )
}