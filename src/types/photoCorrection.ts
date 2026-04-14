export interface EditingSettings {
  brightness: number      // -100 to 100
  contrast: number        // -100 to 100
  saturation: number      // -100 to 100
  warmth: number         // -100 to 100 (color temperature)
  tint: number           // -100 to 100 (magenta/green)
  highlights: number     // -100 to 100
  shadows: number        // -100 to 100
  vibrance: number       // -100 to 100
  clarity: number        // -100 to 100
  redBoost: number       // Underwater specific
  blueReduction: number  // Underwater specific
  greenReduction: number // Underwater specific
  // Noise reduction and sharpening
  noiseReduction: number // 0 to 100 (bilateral filter strength)
  spatialSigma: number   // 0 to 100 (bilateral filter spatial sigma)
  textureSigma: number   // 0 to 100 (bilateral filter texture sigma) 
  sharpening: number     // 0 to 200 (unsharp mask strength)
  sharpenRadius: number  // 0 to 50 (unsharp mask radius)
  sharpenThreshold: number // 0 to 100 (unsharp mask threshold)
}

export interface CameraPreset {
  id: string
  name: string
  description: string
  category: string
  settings: Partial<EditingSettings>
}

export interface ImageWithPreview {
  file: File
  preview: string
  id: string
  processed?: {
    url: string
    result: ProcessingResult
  }
  processing?: boolean
  rotation?: number
  settings?: Partial<EditingSettings>
}

export interface ProcessingResult {
  success: boolean
  processedImageUrl?: string
  originalImageUrl: string
  method: 'canvas' | 'webgl'
  processingTime: number
  error?: string
}