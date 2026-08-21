export interface TankSpecification {
  id: string
  name: string
  commonName: string
  /** True internal (water) volume of the cylinder, in litres. */
  waterVolumeL: number
  /**
   * Free-gas capacity rating in cubic feet — the "80" in AL80.
   *
   * NOTE: despite the field name, this is NOT a water volume expressed in
   * cubic feet. An AL80 has a water volume of 11.1 L (0.39 cu ft) and a
   * capacity rating of 77.4 cu ft; the two differ by the compression ratio.
   * The name is retained because it is referenced throughout the UI; it should
   * be renamed to `ratedCapacityCuFt` in a future breaking change.
   */
  waterVolumeCuFt: number
  /** Stamped service/working pressure, bar. */
  workingPressureBar: number
  /** Stamped service/working pressure, psi. */
  workingPressurePSI: number
  /**
   * The pressure at which `waterVolumeCuFt` is quoted, in bar, when it differs
   * from `workingPressureBar`.
   *
   * US "low pressure" steel cylinders are the reason this exists: a Faber LP85
   * is stamped 2400 psi but is universally sold as an "85" because the rating
   * is quoted at the +10% overfill pressure the DOT special permit allows.
   * Rating an LP85 at its stamped 165 bar gives only ~72 cu ft.
   *
   * When absent, the rating is quoted at `workingPressureBar`.
   */
  ratingPressureBar?: number
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
  //
  // DATA CORRECTION (Phase 1, F12). Every figure in this block was wrong.
  // Source: Worthington/XS Scuba steel cylinder specification sheet, whose
  // capacity column is footnoted "* at 2640 psi / * at 182 bar", and the Faber
  // Italy factory database, which marks these DOT 3AA cylinders
  // "W.P. 2640 PSI (INCLUDING 10% OVERFILLING)".
  //
  // - Service pressure was listed as 165 bar / 2400 psi. The marked service
  //   pressure IS 2640 psi (182 bar); the 10% overfill is included in the
  //   marking rather than being an exemption applied on top of a 2400 psi tank.
  // - Water volumes were each roughly 10% too small, having evidently been
  //   back-derived from the marketing name at the wrong pressure. They are one
  //   size step low throughout.
  // - "LP104" and "LP120" are not real models. The actual Worthington products
  //   are the LP108 and LP121; the ids are retained so saved user selections
  //   keep resolving, but the display names now match the real cylinders.
  //
  // CAVEAT: the Worthington sheet notes these models are out of production.
  // Current Faber-branded US LP cylinders may use slightly different volumes.
  {
    id: 'steel-85-lp',
    name: 'Steel 85 LP',
    commonName: 'Steel Low Pressure 85',
    waterVolumeL: 13.0,
    waterVolumeCuFt: 82.9,
    workingPressureBar: 182,
    workingPressurePSI: 2640,
    material: 'steel',
    type: 'single',
    region: 'universal'
  },
  {
    id: 'steel-95-lp',
    name: 'Steel 95 LP',
    commonName: 'Steel Low Pressure 95',
    waterVolumeL: 15.0,
    waterVolumeCuFt: 93.3,
    workingPressureBar: 182,
    workingPressurePSI: 2640,
    material: 'steel',
    type: 'single',
    region: 'imperial'
  },
  {
    id: 'steel-104-lp',
    name: 'Steel LP108',
    commonName: 'Steel Low Pressure 108',
    waterVolumeL: 17.0,
    waterVolumeCuFt: 108.6,
    workingPressureBar: 182,
    workingPressurePSI: 2640,
    material: 'steel',
    type: 'single',
    region: 'imperial'
  },
  {
    id: 'steel-120-lp',
    name: 'Steel LP121',
    commonName: 'Steel Low Pressure 121',
    waterVolumeL: 19.0,
    waterVolumeCuFt: 120.0,
    workingPressureBar: 182,
    workingPressurePSI: 2640,
    material: 'steel',
    type: 'single',
    region: 'imperial'
  },

  // Steel Tanks (High Pressure)
  //
  // DATA CORRECTION (Phase 1, F12). Source: Faber steel cylinder specification
  // sheet (237 bar / 3442 psi models).
  //
  // The published capacities are ~5% BELOW the ideal-gas figure because air is
  // less compressible than ideal at 237 bar (Z ~ 1.05, confirmed by
  // back-solving Faber's own numbers). The previous entries ignored this, so
  // they overstated available gas — a non-conservative error for gas planning.
  //
  // "HP130" is not a Faber model; the 8-inch cylinder is the HP133. Worthington
  // sells a separate X8-130 at 16.0 L, which is a different tank.
  {
    id: 'steel-100-hp',
    name: 'Steel 100 HP',
    commonName: 'Steel High Pressure 100',
    waterVolumeL: 12.9,
    waterVolumeCuFt: 101.3,
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
    waterVolumeL: 15.0,
    waterVolumeCuFt: 117.8,
    workingPressureBar: 237,
    workingPressurePSI: 3442,
    material: 'steel',
    type: 'single',
    region: 'imperial'
  },
  {
    id: 'steel-130-hp',
    name: 'Steel HP133',
    commonName: 'Steel High Pressure 133',
    waterVolumeL: 17.0,
    waterVolumeCuFt: 135.5,
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
    waterVolumeL: 19.0,
    waterVolumeCuFt: 150.9,
    workingPressureBar: 237,
    workingPressurePSI: 3442,
    material: 'steel',
    type: 'single',
    region: 'imperial'
  },

  // European/Metric Steel Tanks
  //
  // DATA CORRECTION (Phase 1, F12). Every capacity here was understated by
  // ~13%, consistent with having been computed at a 200 bar fill pressure and
  // then labelled 232 bar. (A 12 L at 200 bar is 83.6 cu ft; the entry read 86.)
  //
  // EN/ISO cylinders are named by water volume and their free-gas figure is
  // quoted as the simple product volume x pressure: 12 L x 232 bar = 2784 L =
  // 97 cu ft. There is no alternate convention that yields the previous 86.
  {
    id: 'steel-10l-232',
    name: '10L Steel',
    commonName: '10 Liter Steel',
    waterVolumeL: 10.0,
    waterVolumeCuFt: 81,
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
    waterVolumeCuFt: 97,
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
    waterVolumeCuFt: 121,
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
    waterVolumeCuFt: 146,
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
    waterVolumeCuFt: 162,
    workingPressureBar: 232,
    workingPressurePSI: 3364,
    material: 'steel',
    type: 'single',
    region: 'metric'
  },

  // High Pressure European Tanks (300 bar)
  //
  // DATA CORRECTION (Phase 1, F12). Both entries previously carried their
  // 232 bar namesakes' ratings verbatim — 12 L was listed as 86 cu ft at both
  // 232 and 300 bar, and 15 L as 108 at both. A cylinder of the same water
  // volume necessarily holds more gas at a higher pressure, so these were
  // copied rows.
  //
  // The EN/ISO simple product V x P gives 12 L x 300 = 3600 L = 127 cu ft, but
  // that convention ignores compressibility, and at 300 bar air is markedly
  // less compressible than ideal (Z = 1.09). The real stored volume is 9%
  // lower. The Z-corrected figures are used here because overstating available
  // gas is the non-conservative direction for dive planning:
  //   12 L -> 115.1 cu ft, 15 L -> 143.9 cu ft (air at 15 C)
  //
  // UNVERIFIED against a manufacturer sheet: European 300 bar cylinders are
  // sold by water volume, so a published cubic-foot figure may not exist.
  {
    id: 'steel-12l-300',
    name: '12L HP Steel',
    commonName: '12L High Pressure Steel',
    waterVolumeL: 12.0,
    waterVolumeCuFt: 115.1,
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
    waterVolumeCuFt: 143.9,
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
    waterVolumeCuFt: 194,
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
    waterVolumeCuFt: 242,
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
    waterVolumeCuFt: 292,
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
    // Was 's19-catalina', which matches no entry — the Catalina pony bottle's
    // id is 's19', so it silently never appeared in the common-tanks list.
    's19'
  ]
  return tankSpecifications.filter(tank => commonTankIds.includes(tank.id))
}