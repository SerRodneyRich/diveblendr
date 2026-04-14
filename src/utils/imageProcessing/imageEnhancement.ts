/**
 * Image Enhancement Algorithms
 * Bilateral Filtering for noise reduction and Unsharp Masking for sharpening
 * Optimized for underwater photography with high ISO noise
 */

export interface EnhancementSettings {
  // Bilateral Filter (Noise Reduction)
  noiseReduction: number    // 0-100: overall noise reduction strength
  spatialSigma: number      // 0-100: spatial falloff for bilateral filter  
  textureSigma: number      // 0-100: texture/intensity falloff for bilateral filter
  
  // Unsharp Masking (Sharpening)
  sharpening: number        // 0-200: sharpening strength
  sharpenRadius: number     // 0-50: sharpening radius in pixels
  sharpenThreshold: number  // 0-100: sharpening threshold
}

/**
 * Apply bilateral filtering for noise reduction (async version with yielding)
 * Preserves edges while smoothing noise - ideal for high ISO underwater photos
 */
export async function applyBilateralFilter(
  imageData: ImageData, 
  spatialSigma: number, 
  textureSigma: number, 
  strength: number,
  abortSignal?: AbortSignal
): Promise<void> {
  if (strength === 0) return
  
  const { data, width, height } = imageData
  const originalData = new Uint8ClampedArray(data)
  
  // Convert parameters to working ranges
  const spatialSigmaPixels = Math.max(1, (spatialSigma / 100) * 10) // 0.1 to 10 pixels
  const textureSigmaIntensity = Math.max(1, (textureSigma / 100) * 50) // 0.5 to 50 intensity units
  const filterStrength = strength / 100 // 0 to 1
  
  // Use smaller radius for better performance
  const radius = Math.min(Math.ceil(spatialSigmaPixels * 2), 8) // Limit radius to 8 pixels max
  const spatialWeights: number[][] = []
  
  for (let dy = -radius; dy <= radius; dy++) {
    spatialWeights[dy + radius] = []
    for (let dx = -radius; dx <= radius; dx++) {
      const distance = Math.sqrt(dx * dx + dy * dy)
      spatialWeights[dy + radius][dx + radius] = Math.exp(-(distance * distance) / (2 * spatialSigmaPixels * spatialSigmaPixels))
    }
  }
  
  // Process in chunks to avoid blocking UI
  const chunkSize = Math.max(1, Math.floor(width / 20)) // Process 1/20th of image width at a time
  
  for (let y = 0; y < height; y++) {
    for (let xStart = 0; xStart < width; xStart += chunkSize) {
      const xEnd = Math.min(xStart + chunkSize, width)
      
      // Process chunk
      for (let x = xStart; x < xEnd; x++) {
        const centerIdx = (y * width + x) * 4
        const centerR = originalData[centerIdx]
        const centerG = originalData[centerIdx + 1] 
        const centerB = originalData[centerIdx + 2]
        
        let totalR = 0, totalG = 0, totalB = 0
        let totalWeight = 0
        
        // Sample neighborhood
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const ny = y + dy
            const nx = x + dx
            
            // Boundary check
            if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue
            
            const neighborIdx = (ny * width + nx) * 4
            const neighborR = originalData[neighborIdx]
            const neighborG = originalData[neighborIdx + 1]
            const neighborB = originalData[neighborIdx + 2]
            
            // Calculate intensity difference
            const diffR = centerR - neighborR
            const diffG = centerG - neighborG  
            const diffB = centerB - neighborB
            const intensityDiff = Math.sqrt(diffR * diffR + diffG * diffG + diffB * diffB)
            
            // Calculate bilateral weight
            const spatialWeight = spatialWeights[dy + radius][dx + radius]
            const textureWeight = Math.exp(-(intensityDiff * intensityDiff) / (2 * textureSigmaIntensity * textureSigmaIntensity))
            const bilateralWeight = spatialWeight * textureWeight
            
            totalR += neighborR * bilateralWeight
            totalG += neighborG * bilateralWeight  
            totalB += neighborB * bilateralWeight
            totalWeight += bilateralWeight
          }
        }
        
        if (totalWeight > 0) {
          const filteredR = totalR / totalWeight
          const filteredG = totalG / totalWeight
          const filteredB = totalB / totalWeight
          
          // Blend with original based on strength
          data[centerIdx] = Math.round(centerR * (1 - filterStrength) + filteredR * filterStrength)
          data[centerIdx + 1] = Math.round(centerG * (1 - filterStrength) + filteredG * filterStrength)  
          data[centerIdx + 2] = Math.round(centerB * (1 - filterStrength) + filteredB * filterStrength)
        }
      }
      
      // Yield to prevent blocking UI every few chunks
      if (xStart % (chunkSize * 4) === 0) {
        if (abortSignal?.aborted) {
          throw new Error('Enhancement cancelled by user')
        }
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }
  }
}

/**
 * Apply unsharp masking for sharpening
 * Subtracts blurred version from original to enhance edges
 */
export function applyUnsharpMask(
  imageData: ImageData,
  strength: number,
  radius: number, 
  threshold: number
): void {
  if (strength === 0) return
  
  const { data, width, height } = imageData
  const originalData = new Uint8ClampedArray(data)
  
  // Convert parameters
  const sharpenStrength = strength / 100 // 0 to 2
  const blurRadius = Math.max(0.5, (radius / 50) * 5) // 0.01 to 5 pixels
  const sharpenThreshold = (threshold / 100) * 255 // 0 to 255
  
  // Create blurred version using simple box blur
  const blurredData = new Uint8ClampedArray(data)
  applyBoxBlur(blurredData, width, height, blurRadius)
  
  // Apply unsharp mask: original + (original - blurred) * strength
  for (let i = 0; i < data.length; i += 4) {
    const origR = originalData[i]
    const origG = originalData[i + 1]
    const origB = originalData[i + 2]
    
    const blurR = blurredData[i]
    const blurG = blurredData[i + 1] 
    const blurB = blurredData[i + 2]
    
    // Calculate differences
    const diffR = origR - blurR
    const diffG = origG - blurG
    const diffB = origB - blurB
    
    // Apply threshold - only sharpen if difference is significant
    const diffMagnitude = Math.sqrt(diffR * diffR + diffG * diffG + diffB * diffB)
    
    if (diffMagnitude > sharpenThreshold) {
      data[i] = Math.max(0, Math.min(255, origR + diffR * sharpenStrength))
      data[i + 1] = Math.max(0, Math.min(255, origG + diffG * sharpenStrength))
      data[i + 2] = Math.max(0, Math.min(255, origB + diffB * sharpenStrength))
    }
  }
}

/**
 * Simple box blur implementation for unsharp masking
 */
function applyBoxBlur(data: Uint8ClampedArray, width: number, height: number, radius: number): void {
  const tempData = new Uint8ClampedArray(data)
  const kernelSize = Math.max(1, Math.floor(radius * 2) + 1)
  const halfKernel = Math.floor(kernelSize / 2)
  
  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let totalR = 0, totalG = 0, totalB = 0, count = 0
      
      for (let kx = -halfKernel; kx <= halfKernel; kx++) {
        const sampleX = Math.max(0, Math.min(width - 1, x + kx))
        const idx = (y * width + sampleX) * 4
        
        totalR += tempData[idx]
        totalG += tempData[idx + 1]
        totalB += tempData[idx + 2]
        count++
      }
      
      const centerIdx = (y * width + x) * 4
      data[centerIdx] = Math.round(totalR / count)
      data[centerIdx + 1] = Math.round(totalG / count)
      data[centerIdx + 2] = Math.round(totalB / count)
    }
  }
  
  // Vertical pass
  tempData.set(data)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let totalR = 0, totalG = 0, totalB = 0, count = 0
      
      for (let ky = -halfKernel; ky <= halfKernel; ky++) {
        const sampleY = Math.max(0, Math.min(height - 1, y + ky))
        const idx = (sampleY * width + x) * 4
        
        totalR += tempData[idx]
        totalG += tempData[idx + 1] 
        totalB += tempData[idx + 2]
        count++
      }
      
      const centerIdx = (y * width + x) * 4
      data[centerIdx] = Math.round(totalR / count)
      data[centerIdx + 1] = Math.round(totalG / count)
      data[centerIdx + 2] = Math.round(totalB / count)
    }
  }
}

/**
 * Apply all enhancement algorithms in optimal order (async version)
 * 1. Bilateral filtering (noise reduction) first
 * 2. Unsharp masking (sharpening) second
 */
export async function applyImageEnhancement(
  imageData: ImageData, 
  settings: EnhancementSettings,
  onProgress?: (progress: number, stage: string) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  const hasNoise = settings.noiseReduction > 0
  const hasSharpening = settings.sharpening > 0
  
  if (!hasNoise && !hasSharpening) return
  
  // Apply noise reduction first (preserves important edges)
  if (hasNoise) {
    if (abortSignal?.aborted) {
      throw new Error('Enhancement cancelled by user')
    }
    onProgress?.(0, 'Reducing noise...')
    await applyBilateralFilter(
      imageData,
      settings.spatialSigma,
      settings.textureSigma, 
      settings.noiseReduction,
      abortSignal
    )
    onProgress?.(hasSharpening ? 50 : 100, hasSharpening ? 'Noise reduction complete' : 'Enhancement complete')
  }
  
  // Apply sharpening second (enhances cleaned edges)  
  if (hasSharpening) {
    if (abortSignal?.aborted) {
      throw new Error('Enhancement cancelled by user')
    }
    onProgress?.(hasNoise ? 50 : 0, 'Sharpening details...')
    applyUnsharpMask(
      imageData,
      settings.sharpening,
      settings.sharpenRadius,
      settings.sharpenThreshold
    )
    onProgress?.(100, 'Enhancement complete')
  }
}

/**
 * Get default enhancement settings optimized for underwater photography
 */
export function getDefaultEnhancementSettings(): EnhancementSettings {
  return {
    // Conservative noise reduction for underwater shots
    noiseReduction: 25,    // Moderate noise reduction
    spatialSigma: 20,      // Medium spatial smoothing
    textureSigma: 30,      // Medium texture preservation
    
    // Gentle sharpening to restore detail lost in water
    sharpening: 50,        // Moderate sharpening
    sharpenRadius: 15,     // Medium radius for underwater detail
    sharpenThreshold: 10   // Low threshold to sharpen subtle details
  }
}

/**
 * Estimate processing time based on image size and settings
 */
export function estimateProcessingTime(width: number, height: number, settings: EnhancementSettings): number {
  const pixels = width * height
  const megapixels = pixels / (1024 * 1024)
  
  let timeEstimate = 0
  
  // Base time for bilateral filtering (most expensive)
  if (settings.noiseReduction > 0) {
    // Bilateral filter is O(n * r^2) where r is radius
    const radius = Math.min(Math.ceil((settings.spatialSigma / 100) * 10 * 2), 8)
    const kernelSize = (radius * 2 + 1) * (radius * 2 + 1)
    
    // Rough estimation: 0.5 seconds per megapixel per kernel size unit
    timeEstimate += megapixels * kernelSize * 0.1
  }
  
  // Sharpening is much faster
  if (settings.sharpening > 0) {
    timeEstimate += megapixels * 0.2
  }
  
  // Minimum 1 second, maximum 180 seconds (3 minutes)
  return Math.max(1, Math.min(180, Math.round(timeEstimate)))
}

/**
 * Create preview region from center of image (like Photoshop)
 */
export function createPreviewRegion(
  canvas: HTMLCanvasElement, 
  previewSize: number = 400
): { canvas: HTMLCanvasElement, x: number, y: number, width: number, height: number } {
  const { width, height } = canvas
  const ctx = canvas.getContext('2d')!
  
  // Calculate preview region (center of image)
  const centerX = Math.floor(width / 2)
  const centerY = Math.floor(height / 2)
  const halfSize = Math.floor(previewSize / 2)
  
  const x = Math.max(0, Math.min(width - previewSize, centerX - halfSize))
  const y = Math.max(0, Math.min(height - previewSize, centerY - halfSize))
  const w = Math.min(previewSize, width - x)
  const h = Math.min(previewSize, height - y)
  
  // Create preview canvas
  const previewCanvas = document.createElement('canvas')
  previewCanvas.width = w
  previewCanvas.height = h
  const previewCtx = previewCanvas.getContext('2d')!
  
  // Copy region to preview canvas
  const regionData = ctx.getImageData(x, y, w, h)
  previewCtx.putImageData(regionData, 0, 0)
  
  return { canvas: previewCanvas, x, y, width: w, height: h }
}

/**
 * Apply preview region back to main canvas
 */
export function applyPreviewToCanvas(
  mainCanvas: HTMLCanvasElement,
  previewCanvas: HTMLCanvasElement,
  x: number, 
  y: number
): void {
  const ctx = mainCanvas.getContext('2d')!
  const previewData = previewCanvas.getContext('2d')!.getImageData(0, 0, previewCanvas.width, previewCanvas.height)
  ctx.putImageData(previewData, x, y)
}

/**
 * Create overlay canvas showing preview region boundary
 */
export function createPreviewOverlay(
  originalCanvas: HTMLCanvasElement,
  previewRegion: { x: number, y: number, width: number, height: number }
): HTMLCanvasElement {
  const overlayCanvas = document.createElement('canvas')
  overlayCanvas.width = originalCanvas.width
  overlayCanvas.height = originalCanvas.height
  const ctx = overlayCanvas.getContext('2d')!
  
  // Draw the original image first
  ctx.drawImage(originalCanvas, 0, 0)
  
  // Draw preview region border - thick and visible
  ctx.strokeStyle = '#00ff00' // Bright green border for maximum visibility
  ctx.lineWidth = 8 // Very thick border
  ctx.setLineDash([]) // Solid line for better visibility
  ctx.strokeRect(previewRegion.x, previewRegion.y, previewRegion.width, previewRegion.height)
  
  // Add corner indicators - bright and visible
  const cornerSize = 30
  ctx.lineWidth = 6
  ctx.strokeStyle = '#ffff00' // Bright yellow for corners
  
  // Top-left corner
  ctx.beginPath()
  ctx.moveTo(previewRegion.x, previewRegion.y + cornerSize)
  ctx.lineTo(previewRegion.x, previewRegion.y)
  ctx.lineTo(previewRegion.x + cornerSize, previewRegion.y)
  ctx.stroke()
  
  // Top-right corner
  ctx.beginPath()
  ctx.moveTo(previewRegion.x + previewRegion.width - cornerSize, previewRegion.y)
  ctx.lineTo(previewRegion.x + previewRegion.width, previewRegion.y)
  ctx.lineTo(previewRegion.x + previewRegion.width, previewRegion.y + cornerSize)
  ctx.stroke()
  
  // Bottom-left corner
  ctx.beginPath()
  ctx.moveTo(previewRegion.x, previewRegion.y + previewRegion.height - cornerSize)
  ctx.lineTo(previewRegion.x, previewRegion.y + previewRegion.height)
  ctx.lineTo(previewRegion.x + cornerSize, previewRegion.y + previewRegion.height)
  ctx.stroke()
  
  // Bottom-right corner
  ctx.beginPath()
  ctx.moveTo(previewRegion.x + previewRegion.width - cornerSize, previewRegion.y + previewRegion.height)
  ctx.lineTo(previewRegion.x + previewRegion.width, previewRegion.y + previewRegion.height)
  ctx.lineTo(previewRegion.x + previewRegion.width, previewRegion.y + previewRegion.height - cornerSize)
  ctx.stroke()
  
  // Add text label - bright and visible
  ctx.fillStyle = '#ffffff' // White text
  ctx.strokeStyle = '#000000' // Black outline for text
  ctx.lineWidth = 2
  ctx.font = 'bold 18px Arial'
  ctx.textAlign = 'center'
  ctx.strokeText('PREVIEW REGION', previewRegion.x + previewRegion.width / 2, previewRegion.y - 15)
  ctx.fillText('PREVIEW REGION', previewRegion.x + previewRegion.width / 2, previewRegion.y - 15)
  
  return overlayCanvas
}

/**
 * Get enhancement presets for different underwater conditions
 */
export function getUnderwaterEnhancementPresets() {
  return {
    none: {
      noiseReduction: 0,
      spatialSigma: 0, 
      textureSigma: 0,
      sharpening: 0,
      sharpenRadius: 0,
      sharpenThreshold: 0
    },
    
    lightNoise: {
      noiseReduction: 15,
      spatialSigma: 15,
      textureSigma: 25,
      sharpening: 30,
      sharpenRadius: 10,
      sharpenThreshold: 15
    },
    
    moderate: {
      noiseReduction: 30,
      spatialSigma: 25,
      textureSigma: 35,
      sharpening: 60,
      sharpenRadius: 20,
      sharpenThreshold: 10
    },
    
    heavyNoise: {
      noiseReduction: 50,
      spatialSigma: 35,
      textureSigma: 45,
      sharpening: 80,
      sharpenRadius: 25,
      sharpenThreshold: 5
    },
    
    extremeNoise: {
      noiseReduction: 75,
      spatialSigma: 45,
      textureSigma: 55,
      sharpening: 100,
      sharpenRadius: 30,
      sharpenThreshold: 3
    }
  }
}