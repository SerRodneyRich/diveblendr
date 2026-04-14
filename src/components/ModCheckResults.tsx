import { memo } from 'react'
import { calculateMOD, calculateEND, calculateGasDensity, calculateAbsolutePressure } from '../utils/endModCalculations'
import TankVisualization from './TankVisualization'
import { useUnitConversion } from '../hooks/useUnitConversion'

interface ModCheckParams {
  o2: number
  he: number
  ppo2: number
  tankSizeL: number
  selectedTankId?: string
}

interface ModCheckResultsProps {
  modCheckParams: ModCheckParams
}

const ModCheckResults = memo(function ModCheckResults({ modCheckParams }: ModCheckResultsProps) {
  const { convertDepth, convertDensity } = useUnitConversion();
  // Ensure safe parameter values and handle empty/invalid inputs
  const safeO2 = Math.max(0, Math.min(100, modCheckParams.o2 || 0))
  const safeHe = Math.max(0, Math.min(100, modCheckParams.he || 0))
  const safePPO2 = Math.max(0.16, Math.min(1.6, modCheckParams.ppo2 || 1.4))
  const safeNitrogen = Math.max(0, Math.min(100, 100 - safeO2 - safeHe))
  
  const mixture = {
    oxygen: safeO2,
    helium: safeHe,
    nitrogen: safeNitrogen
  }
  
  // Calculate values with error handling
  let modCheckMOD = 0
  let modCheckAbsPressure = 1.0
  let modCheckEND = 0
  let modCheckDensity = 0
  
  try {
    if (safeO2 > 0 && safePPO2 > 0) {
      modCheckMOD = calculateMOD(mixture, safePPO2)
      modCheckAbsPressure = calculateAbsolutePressure(modCheckMOD)
      modCheckEND = calculateEND(mixture, modCheckMOD)
      modCheckDensity = calculateGasDensity(mixture, modCheckMOD)
    }
  } catch (error) {
    console.warn('MOD check calculation failed, using default values:', error)
    // Values remain at their safe defaults
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-700 border border-black rounded-lg p-4 text-center">
          <div className="text-gray-400 text-sm mb-1">Gas Mix</div>
          <div className="flex items-center justify-center gap-2">
            <TankVisualization
              o2Percent={safeO2}
              n2Percent={safeNitrogen}
              hePercent={safeHe}
              totalPressure={modCheckAbsPressure}
              tankSizeL={modCheckParams.tankSizeL}
              maxPPO2={safePPO2}
              iconMode={true}
            />
            <div className="text-yellow-400 font-bold">
              {safeHe > 0 ? 
                `${safeO2}/${safeHe}` : 
                `EANx${safeO2}`
              }
            </div>
          </div>
        </div>
        
        <div className="bg-gray-700 border border-black rounded-lg p-4 text-center">
          <div className="text-gray-400 text-sm mb-1">MOD</div>
          <div className="text-yellow-400 font-bold">{convertDepth(modCheckMOD).formatted}</div>
        </div>
        
        <div className="bg-gray-700 border border-black rounded-lg p-4 text-center">
          <div className="text-gray-400 text-sm mb-1">Gas Density</div>
          <div className="text-yellow-400 font-bold">{convertDensity(modCheckDensity).formatted}</div>
        </div>
        
        <div className="bg-gray-700 border border-black rounded-lg p-4 text-center">
          <div className="text-gray-400 text-sm mb-1">END</div>
          <div className="text-yellow-400 font-bold">{convertDepth(modCheckEND).formatted}</div>
        </div>
      </div>
    </div>
  )
})

export default ModCheckResults