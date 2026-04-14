import TankSelector from './TankSelector'
import { TankSpecification } from '../data/tankSpecifications'
import { useUnitConversion } from '../hooks/useUnitConversion'

interface ModCheckParams {
  o2: number
  he: number
  ppo2: number
  tankSizeL: number
  selectedTankId?: string
}

interface ModCheckTankConfigProps {
  modCheckParams: ModCheckParams
  onModCheckParamsChange: (params: ModCheckParams) => void
}

export default function ModCheckTankConfig({ modCheckParams, onModCheckParamsChange }: ModCheckTankConfigProps) {
  const { preferences } = useUnitConversion()
  
  const updateParam = (key: keyof ModCheckParams, value: number) => {
    onModCheckParamsChange({ ...modCheckParams, [key]: value })
  }

  const handleTankSelect = (tank: TankSpecification) => {
    onModCheckParamsChange({
      ...modCheckParams,
      tankSizeL: tank.waterVolumeL,
      selectedTankId: tank.id
    })
  }

  return (
    <div className="bg-gray-700 p-3 sm:p-4 rounded">
      <TankSelector
        selectedTankId={modCheckParams.selectedTankId}
        onTankSelect={handleTankSelect}
        units={preferences.volume === 'liters' ? 'metric' : 'imperial'}
        allowTwinsets={true}
        showCommonOnly={false}
        compactView={false}
        label="Tank Configuration"
        showPressure={true}
        showMaterial={true}
      />
      <div className="mt-3">
        <label className="block text-yellow-400 text-xs sm:text-sm mb-2">Manual Tank Size ({preferences.volume === 'liters' ? 'L' : 'ft³'})</label>
        <input
          type="number"
          min="1"
          max="50"
          step="0.1"
          value={modCheckParams.tankSizeL}
          onChange={(e) => updateParam('tankSizeL', Number(e.target.value) || 0)}
          className="w-full bg-gray-600 border border-gray-500 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-center text-sm sm:text-base"
          placeholder="Override tank size"
        />
      </div>
    </div>
  )
}