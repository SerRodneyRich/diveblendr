export interface TankSpecification {
  id: string
  name: string
  commonName: string
  waterVolumeL: number
  waterVolumeCuFt: number
  workingPressureBar: number
  workingPressurePSI: number
  material: 'aluminum' | 'steel' | 'carbon'
  type: 'single' | 'twinset'
  region: 'metric' | 'imperial' | 'universal'
  manufacturer?: string
  notes?: string
}

export const tankSpecifications: TankSpecification[] = [
  // Aluminum Tanks (Metric/Universal)
  {
    id: 'al80-metric',
    name: 'AL80',
    commonName: 'Aluminum 80',
    waterVolumeL: 11.1,
    waterVolumeCuFt: 77.4,
    workingPressureBar: 207,
    workingPressurePSI: 3000,
    material: 'aluminum',
    type: 'single',
    region: 'universal',
    notes: 'Most common recreational tank worldwide'
  },
  {
    id: 'al100-metric',
    name: 'AL100',
    commonName: 'Aluminum 100',
    waterVolumeL: 13.2,
    waterVolumeCuFt: 100,
    workingPressureBar: 207,
    workingPressurePSI: 3000,
    material: 'aluminum',
    type: 'single',
    region: 'universal'
  },
  {
    id: 'al63',
    name: 'AL63',
    commonName: 'Aluminum 63',
    waterVolumeL: 8.7,
    waterVolumeCuFt: 63,
    workingPressureBar: 207,
    workingPressurePSI: 3000,
    material: 'aluminum',
    type: 'single',
    region: 'universal'
  },

  // Steel Tanks (Low Pressure)
  {
    id: 'steel-85-lp',
    name: 'Steel 85 LP',
    commonName: 'Steel Low Pressure 85',
    waterVolumeL: 11.9,
    waterVolumeCuFt: 85,
    workingPressureBar: 165,
    workingPressurePSI: 2400,
    material: 'steel',
    type: 'single',
    region: 'universal'
  },
  {
    id: 'steel-95-lp',
    name: 'Steel 95 LP',
    commonName: 'Steel Low Pressure 95',
    waterVolumeL: 13.3,
    waterVolumeCuFt: 95,
    workingPressureBar: 165,
    workingPressurePSI: 2400,
    material: 'steel',
    type: 'single',
    region: 'imperial'
  },
  {
    id: 'steel-104-lp',
    name: 'Steel 104 LP',
    commonName: 'Steel Low Pressure 104',
    waterVolumeL: 14.6,
    waterVolumeCuFt: 104,
    workingPressureBar: 165,
    workingPressurePSI: 2400,
    material: 'steel',
    type: 'single',
    region: 'imperial'
  },
  {
    id: 'steel-120-lp',
    name: 'Steel 120 LP',
    commonName: 'Steel Low Pressure 120',
    waterVolumeL: 16.8,
    waterVolumeCuFt: 120,
    workingPressureBar: 165,
    workingPressurePSI: 2400,
    material: 'steel',
    type: 'single',
    region: 'imperial'
  },

  // Steel Tanks (High Pressure)
  {
    id: 'steel-100-hp',
    name: 'Steel 100 HP',
    commonName: 'Steel High Pressure 100',
    waterVolumeL: 12.9,
    waterVolumeCuFt: 100,
    workingPressureBar: 237,
    workingPressurePSI: 3442,
    material: 'steel',
    type: 'single',
    region: 'imperial'
  },
  {
    id: 'steel-117-hp',
    name: 'Steel 117 HP',
    commonName: 'Steel High Pressure 117',
    waterVolumeL: 15.1,
    waterVolumeCuFt: 117,
    workingPressureBar: 237,
    workingPressurePSI: 3442,
    material: 'steel',
    type: 'single',
    region: 'imperial'
  },
  {
    id: 'steel-130-hp',
    name: 'Steel 130 HP',
    commonName: 'Steel High Pressure 130',
    waterVolumeL: 16.8,
    waterVolumeCuFt: 130,
    workingPressureBar: 237,
    workingPressurePSI: 3442,
    material: 'steel',
    type: 'single',
    region: 'imperial'
  },
  {
    id: 'steel-149-hp',
    name: 'Steel 149 HP',
    commonName: 'Steel High Pressure 149',
    waterVolumeL: 19.3,
    waterVolumeCuFt: 149,
    workingPressureBar: 237,
    workingPressurePSI: 3442,
    material: 'steel',
    type: 'single',
    region: 'imperial'
  },

  // European/Metric Steel Tanks
  {
    id: 'steel-10l-232',
    name: '10L Steel',
    commonName: '10 Liter Steel',
    waterVolumeL: 10.0,
    waterVolumeCuFt: 72,
    workingPressureBar: 232,
    workingPressurePSI: 3364,
    material: 'steel',
    type: 'single',
    region: 'metric'
  },
  {
    id: 'steel-12l-232',
    name: '12L Steel',
    commonName: '12 Liter Steel',
    waterVolumeL: 12.0,
    waterVolumeCuFt: 86,
    workingPressureBar: 232,
    workingPressurePSI: 3364,
    material: 'steel',
    type: 'single',
    region: 'metric'
  },
  {
    id: 'steel-15l-232',
    name: '15L Steel',
    commonName: '15 Liter Steel',
    waterVolumeL: 15.0,
    waterVolumeCuFt: 108,
    workingPressureBar: 232,
    workingPressurePSI: 3364,
    material: 'steel',
    type: 'single',
    region: 'metric'
  },
  {
    id: 'steel-18l-232',
    name: '18L Steel',
    commonName: '18 Liter Steel',
    waterVolumeL: 18.0,
    waterVolumeCuFt: 129,
    workingPressureBar: 232,
    workingPressurePSI: 3364,
    material: 'steel',
    type: 'single',
    region: 'metric'
  },
  {
    id: 'steel-20l-232',
    name: '20L Steel',
    commonName: '20 Liter Steel',
    waterVolumeL: 20.0,
    waterVolumeCuFt: 144,
    workingPressureBar: 232,
    workingPressurePSI: 3364,
    material: 'steel',
    type: 'single',
    region: 'metric'
  },

  // High Pressure European Tanks (300 bar)
  {
    id: 'steel-12l-300',
    name: '12L HP Steel',
    commonName: '12L High Pressure Steel',
    waterVolumeL: 12.0,
    waterVolumeCuFt: 86,
    workingPressureBar: 300,
    workingPressurePSI: 4351,
    material: 'steel',
    type: 'single',
    region: 'metric'
  },
  {
    id: 'steel-15l-300',
    name: '15L HP Steel',
    commonName: '15L High Pressure Steel',
    waterVolumeL: 15.0,
    waterVolumeCuFt: 108,
    workingPressureBar: 300,
    workingPressurePSI: 4351,
    material: 'steel',
    type: 'single',
    region: 'metric'
  },

  // Twinsets (Common Configurations)
  {
    id: 'twin-al80',
    name: 'Twin AL80',
    commonName: 'Twinset AL80',
    waterVolumeL: 22.2,
    waterVolumeCuFt: 154.8,
    workingPressureBar: 207,
    workingPressurePSI: 3000,
    material: 'aluminum',
    type: 'twinset',
    region: 'universal'
  },
  {
    id: 'twin-12l',
    name: 'Twin 12L',
    commonName: 'Twinset 12L',
    waterVolumeL: 24.0,
    waterVolumeCuFt: 172,
    workingPressureBar: 232,
    workingPressurePSI: 3364,
    material: 'steel',
    type: 'twinset',
    region: 'metric'
  },
  {
    id: 'twin-15l',
    name: 'Twin 15L',
    commonName: 'Twinset 15L',
    waterVolumeL: 30.0,
    waterVolumeCuFt: 216,
    workingPressureBar: 232,
    workingPressurePSI: 3364,
    material: 'steel',
    type: 'twinset',
    region: 'metric'
  },
  {
    id: 'twin-18l',
    name: 'Twin 18L',
    commonName: 'Twinset 18L',
    waterVolumeL: 36.0,
    waterVolumeCuFt: 259,
    workingPressureBar: 232,
    workingPressurePSI: 3364,
    material: 'steel',
    type: 'twinset',
    region: 'metric'
  },

  // Smaller tanks for bailout/deco
  {
    id: 'al40',
    name: 'AL40',
    commonName: 'Aluminum 40 (Pony)',
    waterVolumeL: 5.7,
    waterVolumeCuFt: 40,
    workingPressureBar: 207,
    workingPressurePSI: 3000,
    material: 'aluminum',
    type: 'single',
    region: 'universal',
    notes: 'Common bailout/pony bottle'
  },
  {
    id: 'al30',
    name: 'AL30',
    commonName: 'Aluminum 30 (Pony)',
    waterVolumeL: 4.3,
    waterVolumeCuFt: 30,
    workingPressureBar: 207,
    workingPressurePSI: 3000,
    material: 'aluminum',
    type: 'single',
    region: 'universal',
    notes: 'Compact pony bottle'
  },
  {
    id: 'al19',
    name: 'AL19',
    commonName: 'Aluminum 19 (Pony)',
    waterVolumeL: 2.7,
    waterVolumeCuFt: 19,
    workingPressureBar: 207,
    workingPressurePSI: 3000,
    material: 'aluminum',
    type: 'single',
    region: 'universal',
    notes: 'Small bailout bottle'
  },

  // S19 Tanks (various manufacturers)
  {
    id: 's19',
    name: 'S19',
    commonName: 'S19 Aluminum',
    waterVolumeL: 2.7,
    waterVolumeCuFt: 19,
    workingPressureBar: 207,
    workingPressurePSI: 3000,
    material: 'aluminum',
    type: 'single',
    region: 'universal',
    manufacturer: 'Catalina',
    notes: 'Pony bottle, Common CCR Tank'
  },
  // Stage/Deco bottles
  {
    id: 'al80-deco',
    name: 'AL80 (Deco)',
    commonName: 'AL80 Deco/Stage',
    waterVolumeL: 11.1,
    waterVolumeCuFt: 77.4,
    workingPressureBar: 207,
    workingPressurePSI: 3000,
    material: 'aluminum',
    type: 'single',
    region: 'universal',
    notes: 'Standard deco/stage bottle'
  },
  {
    id: 'al40-deco',
    name: 'AL40 (Deco)',
    commonName: 'AL40 Deco/Stage',
    waterVolumeL: 5.7,
    waterVolumeCuFt: 40,
    workingPressureBar: 207,
    workingPressurePSI: 3000,
    material: 'aluminum',
    type: 'single',
    region: 'universal',
    notes: 'Lightweight deco bottle'
  }
]

// Helper functions
export const getTankById = (id: string): TankSpecification | undefined => {
  return tankSpecifications.find(tank => tank.id === id)
}

export const getTanksByMaterial = (material: 'aluminum' | 'steel' | 'carbon'): TankSpecification[] => {
  return tankSpecifications.filter(tank => tank.material === material)
}

export const getTanksByType = (type: 'single' | 'twinset'): TankSpecification[] => {
  return tankSpecifications.filter(tank => tank.type === type)
}

export const getTanksByRegion = (region: 'metric' | 'imperial' | 'universal'): TankSpecification[] => {
  return tankSpecifications.filter(tank => tank.region === region || tank.region === 'universal')
}

export const getCommonTanks = (): TankSpecification[] => {
  // Return most commonly used tanks
  const commonTankIds = [
    'al80-metric',
    'steel-12l-232', 
    'steel-15l-232',
    'steel-100-hp',
    'steel-130-hp',
    'twin-12l',
    'al40',
    's19-catalina'
  ]
  return tankSpecifications.filter(tank => commonTankIds.includes(tank.id))
}