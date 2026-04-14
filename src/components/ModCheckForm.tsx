import TankSelector from './TankSelector'
import { TankSpecification } from '../data/tankSpecifications'

interface ModCheckParams {
  o2: number
  he: number
  ppo2: number
  tankSizeL: number
  selectedTankId?: string
}

interface ModCheckFormProps {
  modCheckParams: ModCheckParams
  onModCheckParamsChange: (params: ModCheckParams) => void
}

export default function ModCheckForm({ modCheckParams, onModCheckParamsChange }: ModCheckFormProps) {
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div>
          <label className="block text-yellow-400 text-xs sm:text-sm mb-2">Oxygen (O₂) %</label>
          <input
            type="number"
            min="8"
            max="100"
            value={modCheckParams.o2}
            onChange={(e) => updateParam('o2', Number(e.target.value) || 0)}
            className="w-full bg-gray-700 border-2 border-yellow-400 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-center text-sm sm:text-base"
          />
        </div>
        
        <div>
          <label className="block text-yellow-400 text-xs sm:text-sm mb-2">Helium (He) %</label>
          <input
            type="number"
            min="0"
            max="95"
            value={modCheckParams.he}
            onChange={(e) => updateParam('he', Number(e.target.value) || 0)}
            className="w-full bg-gray-700 border-2 border-yellow-400 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-center text-sm sm:text-base"
          />
        </div>
      </div>

      <div className="bg-gray-700 p-3 sm:p-4 rounded">
        <label className="block text-yellow-400 font-semibold mb-2 text-sm sm:text-base">Target PPO₂</label>
        <input
          type="range"
          min="0.8"
          max="1.6"
          step="0.1"
          value={modCheckParams.ppo2}
          onChange={(e) => updateParam('ppo2', Number(e.target.value) || 0)}
          className="w-full mb-2"
        />
        <input
          type="number"
          min="0.8"
          max="1.6"
          step="0.1"
          value={modCheckParams.ppo2}
          onChange={(e) => updateParam('ppo2', Number(e.target.value) || 0)}
          className="w-full bg-gray-900 border-2 border-yellow-400 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-yellow-400 font-bold text-center text-sm sm:text-base"
        />
      </div>

    </div>
  )
}