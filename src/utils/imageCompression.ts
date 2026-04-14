/**
 * Image compression utility for automatic file size reduction
 * Optimized for mobile and desktop with different compression levels
 */

export interface CompressionOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  maxFileSize?: number // in MB
  format?: 'jpeg' | 'webp'
  isMobile?: boolean
}

export interface CompressionResult {
  compressedFile: File
  originalSize: number
  compressedSize: number
  compressionRatio: number
}

/**
 * Detects if the device is mobile based on screen size and user agent
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  
  const screenWidth = window.innerWidth
  const userAgent = navigator.userAgent.toLowerCase()
  
  // Check screen width first (most reliable)
  if (screenWidth <= 768) return true
  
  // Check user agent for mobile indicators
  return /android|iphone|ipad|ipod|blackberry|windows phone|mobile/i.test(userAgent)
}

/**
 * Gets optimal compression settings based on device type and file size
 */
export function getOptimalCompressionSettings(fileSize: number, isMobile: boolean = false): CompressionOptions {
  const fileSizeMB = fileSize / (1024 * 1024)
  
  if (isMobile) {
    // Mobile settings - more aggressive compression
    if (fileSizeMB > 20) {
      return { maxWidth: 1920, maxHeight: 1920, quality: 0.6, format: 'jpeg' }
    } else if (fileSizeMB > 10) {
      return { maxWidth: 2048, maxHeight: 2048, quality: 0.7, format: 'jpeg' }
    } else if (fileSizeMB > 5) {
      return { maxWidth: 2560, maxHeight: 2560, quality: 0.75, format: 'jpeg' }
    } else {
      return { maxWidth: 3072, maxHeight: 3072, quality: 0.8, format: 'jpeg' }
    }
  } else {
    // Desktop settings - less aggressive compression
    if (fileSizeMB > 50) {
      return { maxWidth: 2560, maxHeight: 2560, quality: 0.7, format: 'jpeg' }
    } else if (fileSizeMB > 25) {
      return { maxWidth: 3072, maxHeight: 3072, quality: 0.75, format: 'jpeg' }
    } else if (fileSizeMB > 10) {
      return { maxWidth: 3840, maxHeight: 3840, quality: 0.8, format: 'jpeg' }
    } else {
      return { maxWidth: 4096, maxHeight: 4096, quality: 0.85, format: 'jpeg' }
    }
  }
}

/**
 * Compresses an image file with the specified options
 */
export async function compressImage(
  file: File, 
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    maxWidth = 3840,
    maxHeight = 3840,
    quality = 0.8,
    format = 'jpeg',
    isMobile = false
  } = options

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('Canvas not supported'))
      return
    }

    const img = new Image()
    
    img.onload = () => {
      try {
        // Calculate new dimensions while maintaining aspect ratio
        let { width, height } = img
        
        // Only resize if the image is larger than max dimensions
        if (width > maxWidth || height > maxHeight) {
          const aspectRatio = width / height
          
          if (width > height) {
            width = Math.min(width, maxWidth)
            height = width / aspectRatio
          } else {
            height = Math.min(height, maxHeight)
            width = height * aspectRatio
          }
        }

        // Set canvas dimensions
        canvas.width = width
        canvas.height = height

        // Draw and compress the image
        ctx.drawImage(img, 0, 0, width, height)

        // Convert to blob with specified quality and format
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'))
              return
            }

            // Create new file with compressed blob
            const compressedFile = new File([blob], file.name, {
              type: blob.type,
              lastModified: Date.now()
            })

            const result: CompressionResult = {
              compressedFile,
              originalSize: file.size,
              compressedSize: blob.size,
              compressionRatio: (file.size - blob.size) / file.size
            }

            resolve(result)
          },
          format === 'webp' ? 'image/webp' : 'image/jpeg',
          quality
        )
      } catch (error) {
        reject(error)
      }
    }

    img.onerror = () => {
      reject(new Error('Failed to load image for compression'))
    }

    // Load the image
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Automatically compresses an image if it's larger than optimal size
 * Uses device-specific compression settings
 */
export async function autoCompressImage(file: File): Promise<CompressionResult | null> {
  const fileSizeMB = file.size / (1024 * 1024)
  const mobile = isMobileDevice()
  
  // Thresholds for auto-compression
  const mobileThreshold = 3 // MB
  const desktopThreshold = 8 // MB
  
  const threshold = mobile ? mobileThreshold : desktopThreshold
  
  // Only compress if file is larger than threshold
  if (fileSizeMB <= threshold) {
    return null
  }
  
  const settings = getOptimalCompressionSettings(file.size, mobile)
  return await compressImage(file, settings)
}

/**
 * Processes multiple files with automatic compression
 */
export async function processMultipleImages(files: File[]): Promise<{
  processedFiles: File[]
  compressionStats: Array<CompressionResult | null>
}> {
  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const result = await autoCompressImage(file)
        return result
      } catch (error) {
        console.warn(`Failed to compress ${file.name}:`, error)
        return null
      }
    })
  )

  const processedFiles = files.map((file, index) => {
    const compressionResult = results[index]
    return compressionResult ? compressionResult.compressedFile : file
  })

  return {
    processedFiles,
    compressionStats: results
  }
}

/**
 * Formats compression statistics for display
 */
export function formatCompressionStats(stats: CompressionResult): string {
  const originalSizeMB = (stats.originalSize / (1024 * 1024)).toFixed(1)
  const compressedSizeMB = (stats.compressedSize / (1024 * 1024)).toFixed(1)
  const reductionPercent = (stats.compressionRatio * 100).toFixed(0)
  
  return `${originalSizeMB}MB → ${compressedSizeMB}MB (${reductionPercent}% smaller)`
}