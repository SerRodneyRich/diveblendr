/**
 * Underwater Color Correction Algorithms
 * Based on research of underwater photography physics and community solutions
 */

export interface CorrectionParams {
  redBoost: number        // 0.0 to 2.0, default 1.3
  blueReduction: number   // 0.0 to 1.0, default 0.8
  greenReduction: number  // 0.0 to 1.0, default 0.9
  contrast: number        // 0.0 to 2.0, default 1.2
  brightness: number      // -1.0 to 1.0, default 0.1
  saturation: number      // 0.0 to 2.0, default 1.2
  depth: number          // Depth in feet for automatic adjustments (algorithm calibrated for feet)
}

export const DEFAULT_CORRECTION: CorrectionParams = {
  redBoost: 1.4,
  blueReduction: 0.7,
  greenReduction: 0.8,  // Reduce green more aggressively
  contrast: 1.15,
  brightness: 0.08,
  saturation: 1.1,
  depth: 15
}

/**
 * Apply red channel restoration based on blue/green channel data
 * This compensates for red wavelength absorption underwater
 */
export function restoreRedChannel(
  imageData: ImageData, 
  redBoost: number = 1.4
): ImageData {
  const data = imageData.data
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    
    // Use only blue channel for red restoration to avoid green tint
    // Blue is more reliable underwater as it penetrates deepest
    const redFromBlue = b * 0.15
    
    // Restore red channel more conservatively
    const restoredRed = Math.min(255, r * redBoost + redFromBlue)
    data[i] = restoredRed
  }
  
  return imageData
}

/**
 * Reduce blue and green dominance typical in underwater photos
 */
export function reduceBlueGreenCast(
  imageData: ImageData,
  blueReduction: number = 0.8,
  greenReduction: number = 0.9
): ImageData {
  const data = imageData.data
  
  for (let i = 0; i < data.length; i += 4) {
    data[i + 1] = Math.min(255, data[i + 1] * greenReduction) // Green
    data[i + 2] = Math.min(255, data[i + 2] * blueReduction)  // Blue
  }
  
  return imageData
}

/**
 * Enhance contrast and brightness to counteract underwater haze
 */
export function enhanceContrastBrightness(
  imageData: ImageData,
  contrast: number = 1.2,
  brightness: number = 0.1
): ImageData {
  const data = imageData.data
  const brightnessOffset = brightness * 255
  
  for (let i = 0; i < data.length; i += 4) {
    // Apply contrast and brightness to RGB channels
    for (let j = 0; j < 3; j++) {
      let pixel = data[i + j]
      
      // Apply contrast (center around 128)
      pixel = (pixel - 128) * contrast + 128
      
      // Apply brightness
      pixel += brightnessOffset
      
      // Clamp to valid range
      data[i + j] = Math.max(0, Math.min(255, pixel))
    }
  }
  
  return imageData
}

/**
 * Gray World Algorithm for automatic white balance correction
 * Assumes the average color of the image should be neutral gray
 */
export function grayWorldCorrection(imageData: ImageData): ImageData {
  const data = imageData.data
  let totalR = 0, totalG = 0, totalB = 0
  let pixelCount = 0
  
  // Calculate average RGB values
  for (let i = 0; i < data.length; i += 4) {
    totalR += data[i]
    totalG += data[i + 1] 
    totalB += data[i + 2]
    pixelCount++
  }
  
  const avgR = totalR / pixelCount
  const avgG = totalG / pixelCount
  const avgB = totalB / pixelCount
  const grayValue = (avgR + avgG + avgB) / 3
  
  // Calculate scaling factors
  const scaleR = grayValue / avgR
  const scaleG = grayValue / avgG
  const scaleB = grayValue / avgB
  
  // Apply correction
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, data[i] * scaleR)       // Red
    data[i + 1] = Math.min(255, data[i + 1] * scaleG) // Green
    data[i + 2] = Math.min(255, data[i + 2] * scaleB) // Blue
  }
  
  return imageData
}

/**
 * Adjust saturation to enhance color vibrancy
 */
export function adjustSaturation(
  imageData: ImageData,
  saturation: number = 1.2
): ImageData {
  const data = imageData.data
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    
    // Calculate luminance (grayscale value)
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b
    
    // Adjust saturation
    data[i] = Math.min(255, Math.max(0, luminance + (r - luminance) * saturation))
    data[i + 1] = Math.min(255, Math.max(0, luminance + (g - luminance) * saturation))
    data[i + 2] = Math.min(255, Math.max(0, luminance + (b - luminance) * saturation))
  }
  
  return imageData
}

/**
 * Comprehensive underwater correction combining multiple techniques
 */
export function applyUnderwaterCorrection(
  imageData: ImageData,
  params: Partial<CorrectionParams> = {}
): ImageData {
  const correctionParams = { ...DEFAULT_CORRECTION, ...params }
  
  // Apply corrections in order for best results
  restoreRedChannel(imageData, correctionParams.redBoost)
  reduceBlueGreenCast(imageData, correctionParams.blueReduction, correctionParams.greenReduction)
  enhanceContrastBrightness(imageData, correctionParams.contrast, correctionParams.brightness)
  adjustSaturation(imageData, correctionParams.saturation)
  
  return imageData
}

/**
 * Convert depth from meters to feet for use with depth-based corrections
 * @param depthInMeters Depth in meters
 * @returns Depth in feet
 */
export function metersToFeet(depthInMeters: number): number {
  return depthInMeters * 3.28084
}

/**
 * Get depth-based automatic correction parameters
 * Based on typical underwater color loss at various depths
 * @param depth Depth in feet (use metersToFeet() to convert if needed)
 */
export function getDepthBasedCorrection(depth: number): Partial<CorrectionParams> {
  if (depth <= 10) {
    // Shallow water - minimal correction needed
    return {
      redBoost: 1.2,
      blueReduction: 0.9,
      greenReduction: 0.9,
      contrast: 1.1,
      brightness: 0.05,
      saturation: 1.05
    }
  } else if (depth <= 30) {
    // Medium depth - moderate correction
    return {
      redBoost: 1.4,
      blueReduction: 0.75,
      greenReduction: 0.8,  // More aggressive green reduction
      contrast: 1.15,
      brightness: 0.08,
      saturation: 1.1
    }
  } else if (depth <= 60) {
    // Deeper water - stronger correction
    return {
      redBoost: 1.6,
      blueReduction: 0.65,
      greenReduction: 0.7,  // Strong green reduction for deep photos
      contrast: 1.2,
      brightness: 0.12,
      saturation: 1.15
    }
  } else {
    // Very deep - maximum correction but balanced
    return {
      redBoost: 1.7,
      blueReduction: 0.6,
      greenReduction: 0.65, // Very strong green reduction
      contrast: 1.25,
      brightness: 0.15,
      saturation: 1.2
    }
  }
}