/**
 * Main Underwater Photo Processing Engine
 * Handles Canvas and WebGL processing with automatic fallbacks
 */

import { 
  detectWebGLSupport, 
  createWebGLContext, 
  type WebGLCapabilities 
} from './webglDetection'
import { 
  applyUnderwaterCorrection, 
  getDepthBasedCorrection,
  type CorrectionParams,
  DEFAULT_CORRECTION
} from './underwaterCorrection'
import { 
  applyImageEnhancement,
  type EnhancementSettings,
  getDefaultEnhancementSettings
} from './imageEnhancement'

export interface ProcessingOptions {
  method?: 'auto' | 'canvas' | 'webgl'
  corrections?: Partial<CorrectionParams>
  enhancements?: Partial<EnhancementSettings>
  preset?: 'gopro_shallow' | 'gopro_deep' | 'custom' | 'auto'
  maxTileSize?: number
  onProgress?: (progress: number) => void
}

export interface ProcessingResult {
  success: boolean
  processedImageUrl?: string
  originalImageUrl: string
  method: 'canvas' | 'webgl'
  processingTime: number
  error?: string
}

export class UnderwaterProcessor {
  private webglCapabilities: WebGLCapabilities
  private maxTileSize: number

  constructor() {
    this.webglCapabilities = detectWebGLSupport()
    this.maxTileSize = 2048 // Safe default for most devices
    
    console.log('UnderwaterProcessor initialized:', {
      webglSupported: this.webglCapabilities.supported,
      webglVersion: this.webglCapabilities.version,
      maxTextureSize: this.webglCapabilities.maxTextureSize
    })
  }

  /**
   * Process an image file with underwater corrections
   */
  async processImage(
    imageFile: File, 
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const startTime = performance.now()
    const originalUrl = URL.createObjectURL(imageFile)

    try {
      // Load image
      const img = await this.loadImage(imageFile)
      
      // Determine processing method
      const method = this.selectProcessingMethod(options.method || 'auto', img.width, img.height)
      
      // Get correction and enhancement parameters
      const corrections = this.getCorrectionParams(options)
      const enhancements = this.getEnhancementParams(options)
      
      // Process image
      let processedCanvas: HTMLCanvasElement
      if (method === 'webgl' && this.webglCapabilities.supported) {
        processedCanvas = await this.processWithWebGL(img, corrections, enhancements, options)
      } else {
        processedCanvas = await this.processWithCanvas(img, corrections, enhancements, options)
      }
      
      // Convert to blob and create URL
      const blob = await this.canvasToBlob(processedCanvas)
      const processedUrl = URL.createObjectURL(blob)
      
      const processingTime = performance.now() - startTime
      
      return {
        success: true,
        processedImageUrl: processedUrl,
        originalImageUrl: originalUrl,
        method,
        processingTime
      }
    } catch (error) {
      const processingTime = performance.now() - startTime
      console.error('Image processing failed:', error)
      
      return {
        success: false,
        originalImageUrl: originalUrl,
        method: 'canvas',
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Load image file into HTMLImageElement
   */
  private loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = URL.createObjectURL(file)
    })
  }

  /**
   * Select optimal processing method based on capabilities and image size
   */
  private selectProcessingMethod(
    requested: 'auto' | 'canvas' | 'webgl', 
    width: number, 
    height: number
  ): 'canvas' | 'webgl' {
    if (requested === 'canvas') return 'canvas'
    if (requested === 'webgl' && this.webglCapabilities.supported) return 'webgl'
    
    // Auto selection based on capabilities and image size
    if (!this.webglCapabilities.supported) return 'canvas'
    
    const imageSize = width * height
    const webglThreshold = 1920 * 1080 // Use WebGL for images larger than 1080p
    
    return imageSize > webglThreshold ? 'webgl' : 'canvas'
  }

  /**
   * Get correction parameters based on options and presets
   */
  private getCorrectionParams(options: ProcessingOptions): CorrectionParams {
    const baseParams = { ...DEFAULT_CORRECTION }
    
    // Apply preset corrections
    if (options.preset) {
      const presetParams = this.getPresetCorrections(options.preset)
      Object.assign(baseParams, presetParams)
    }
    
    // Apply custom corrections
    if (options.corrections) {
      Object.assign(baseParams, options.corrections)
    }
    
    return baseParams
  }

  /**
   * Get enhancement parameters based on options
   */
  private getEnhancementParams(options: ProcessingOptions): EnhancementSettings {
    const baseParams = getDefaultEnhancementSettings()
    
    // Apply custom enhancements
    if (options.enhancements) {
      Object.assign(baseParams, options.enhancements)
    }
    
    return baseParams
  }

  /**
   * Get predefined correction presets
   */
  private getPresetCorrections(preset: string): Partial<CorrectionParams> {
    switch (preset) {
      case 'gopro_shallow':
        return getDepthBasedCorrection(10)
      case 'gopro_deep':
        return getDepthBasedCorrection(40)
      case 'auto':
        return getDepthBasedCorrection(20) // Medium depth default
      default:
        return {}
    }
  }

  /**
   * Process image using Canvas API (CPU-based)
   */
  private async processWithCanvas(
    img: HTMLImageElement, 
    corrections: CorrectionParams,
    enhancements: EnhancementSettings,
    options: ProcessingOptions
  ): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get canvas context')
    }
    
    // Draw original image
    ctx.drawImage(img, 0, 0)
    
    // Process in tiles if image is large
    if (img.width > this.maxTileSize || img.height > this.maxTileSize) {
      return this.processTiled(canvas, corrections, enhancements, options)
    }
    
    // Process entire image at once for smaller images
    const imageData = ctx.getImageData(0, 0, img.width, img.height)
    applyUnderwaterCorrection(imageData, corrections)
    await applyImageEnhancement(imageData, enhancements, options.onProgress)
    ctx.putImageData(imageData, 0, 0)
    
    return canvas
  }

  /**
   * Process large images in tiles to avoid memory issues
   */
  private async processTiled(
    canvas: HTMLCanvasElement,
    corrections: CorrectionParams,
    enhancements: EnhancementSettings,
    options: ProcessingOptions
  ): Promise<HTMLCanvasElement> {
    const ctx = canvas.getContext('2d')!
    const { width, height } = canvas
    const tileSize = options.maxTileSize || this.maxTileSize
    
    const tilesX = Math.ceil(width / tileSize)
    const tilesY = Math.ceil(height / tileSize)
    const totalTiles = tilesX * tilesY
    let processedTiles = 0
    
    for (let y = 0; y < tilesY; y++) {
      for (let x = 0; x < tilesX; x++) {
        const tileX = x * tileSize
        const tileY = y * tileSize
        const tileWidth = Math.min(tileSize, width - tileX)
        const tileHeight = Math.min(tileSize, height - tileY)
        
        // Process this tile
        const imageData = ctx.getImageData(tileX, tileY, tileWidth, tileHeight)
        applyUnderwaterCorrection(imageData, corrections)
        await applyImageEnhancement(imageData, enhancements)
        ctx.putImageData(imageData, tileX, tileY)
        
        processedTiles++
        
        // Report progress
        if (options.onProgress) {
          options.onProgress((processedTiles / totalTiles) * 100)
        }
        
        // Yield to prevent blocking UI
        if (processedTiles % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }
    }
    
    return canvas
  }

  /**
   * Process image using WebGL (GPU-accelerated)
   * TODO: Implement WebGL shaders for better performance
   */
  private async processWithWebGL(
    img: HTMLImageElement,
    corrections: CorrectionParams,
    enhancements: EnhancementSettings,
    options: ProcessingOptions
  ): Promise<HTMLCanvasElement> {
    // For now, fall back to Canvas processing
    // WebGL shader implementation would go here
    console.log('WebGL processing requested, falling back to Canvas')
    return this.processWithCanvas(img, corrections, enhancements, options)
  }

  /**
   * Convert canvas to blob for download/display
   */
  private canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to create blob from canvas'))
        }
      }, 'image/jpeg', 0.92) // High quality JPEG
    })
  }

  /**
   * Get processor capabilities and status
   */
  getCapabilities() {
    return {
      webgl: this.webglCapabilities,
      maxTileSize: this.maxTileSize,
      supportedFormats: ['image/jpeg', 'image/png', 'image/webp']
    }
  }

  /**
   * Clean up resources
   */
  dispose() {
    // Clean up any WebGL contexts or other resources
    console.log('UnderwaterProcessor disposed')
  }
}