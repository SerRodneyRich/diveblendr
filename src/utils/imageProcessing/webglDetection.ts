/**
 * WebGL Detection and Capability Testing
 * Detects WebGL support and falls back to Canvas if needed
 */

export interface WebGLCapabilities {
  supported: boolean
  version: '1' | '2' | null
  maxTextureSize: number
  maxRenderbufferSize: number
  extensions: string[]
}

export function detectWebGLSupport(): WebGLCapabilities {
  const canvas = document.createElement('canvas')
  
  try {
    // Try WebGL 2.0 first
    let gl: WebGL2RenderingContext | WebGLRenderingContext | null = canvas.getContext('webgl2')
    let version: '1' | '2' | null = null
    
    if (gl) {
      version = '2'
    } else {
      // Fall back to WebGL 1.0
      gl = canvas.getContext('webgl') as WebGLRenderingContext | null
      if (!gl) {
        gl = canvas.getContext('experimental-webgl') as WebGLRenderingContext | null
      }
      if (gl) {
        version = '1'
      }
    }

    if (!gl) {
      return {
        supported: false,
        version: null,
        maxTextureSize: 0,
        maxRenderbufferSize: 0,
        extensions: []
      }
    }

    // Get capabilities
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE)
    const maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)
    const extensions = gl.getSupportedExtensions() || []

    return {
      supported: true,
      version,
      maxTextureSize,
      maxRenderbufferSize,
      extensions
    }
  } catch (error) {
    console.warn('WebGL detection failed:', error)
    return {
      supported: false,
      version: null,
      maxTextureSize: 0,
      maxRenderbufferSize: 0,
      extensions: []
    }
  } finally {
    // Clean up
    canvas.remove()
  }
}

export function createWebGLContext(canvas: HTMLCanvasElement): WebGLRenderingContext | WebGL2RenderingContext | null {
  try {
    // Try WebGL 2.0 first for better performance
    let gl = canvas.getContext('webgl2', {
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true
    }) as WebGL2RenderingContext | null

    if (gl) {
      return gl
    }

    // Fall back to WebGL 1.0
    gl = canvas.getContext('webgl', {
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true
    }) as WebGL2RenderingContext | null

    if (!gl) {
      gl = canvas.getContext('experimental-webgl', {
        alpha: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true
      }) as WebGL2RenderingContext | null
    }

    return gl
  } catch (error) {
    console.warn('Failed to create WebGL context:', error)
    return null
  }
}

export function checkWebGLError(gl: WebGLRenderingContext | WebGL2RenderingContext, operation: string): boolean {
  const error = gl.getError()
  if (error !== gl.NO_ERROR) {
    console.error(`WebGL error in ${operation}:`, error)
    return false
  }
  return true
}