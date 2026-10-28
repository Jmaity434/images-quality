/**
 * SuperLens Real-Time Image Quality Extender Engine
 * WebGL-accelerated Anti-Aliasing, Bilateral De-pixelation, and Adaptive Sharpening Pipeline.
 */

class ImageEnhancerEngine {
  constructor() {
    this.canvas = null;
    this.gl = null;
    this.program = null;
    this.texture = null;
    this.isWebGLSupported = false;
    this.sourceImage = null;

    // Shader attribute and uniform locations
    this.locations = {};
    
    this._initEngine();
  }

  _initEngine() {
    this.canvas = document.createElement('canvas');
    const glOptions = {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true
    };

    this.gl = this.canvas.getContext('webgl', glOptions) || this.canvas.getContext('experimental-webgl', glOptions);
    if (this.gl) {
      this.isWebGLSupported = this._initShaders();
    }
  }

  _initShaders() {
    const gl = this.gl;

    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    // Multi-pass inspired Edge-Directed De-pixelation & Super-Resolution Shader
    const fsSource = `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform vec2 u_resolution;
      
      uniform float u_depixel;   // 0.0 to 1.0 (anti-aliasing & pixel boundary smoothing)
      uniform float u_sharpen;   // 0.0 to 1.0 (unsharp mask edge enhancement)
      uniform float u_clarity;   // 0.0 to 1.0 (local contrast)
      uniform float u_denoise;   // 0.0 to 1.0 (bilateral noise suppression)
      uniform float u_vibrance;  // 0.0 to 1.0 (color vibrance boost)

      // Convert RGB to Luminance
      float rgb2lum(vec3 c) {
        return dot(c, vec3(0.299, 0.587, 0.114));
      }

      void main() {
        vec2 onePixel = vec2(1.0) / u_resolution;
        vec2 tc = v_texCoord;

        // Sample center pixel
        vec4 centerCol = texture2D(u_image, tc);
        float lumM = rgb2lum(centerCol.rgb);

        // 4-tap direct cross neighbors
        vec4 colN = texture2D(u_image, tc + vec2(0.0, -onePixel.y));
        vec4 colS = texture2D(u_image, tc + vec2(0.0, onePixel.y));
        vec4 colW = texture2D(u_image, tc + vec2(-onePixel.x, 0.0));
        vec4 colE = texture2D(u_image, tc + vec2(onePixel.x, 0.0));

        // 4-tap diagonal corner neighbors
        vec4 colNW = texture2D(u_image, tc + vec2(-onePixel.x, -onePixel.y));
        vec4 colNE = texture2D(u_image, tc + vec2(onePixel.x, -onePixel.y));
        vec4 colSW = texture2D(u_image, tc + vec2(-onePixel.x, onePixel.y));
        vec4 colSE = texture2D(u_image, tc + vec2(onePixel.x, onePixel.y));

        float lumN = rgb2lum(colN.rgb);
        float lumS = rgb2lum(colS.rgb);
        float lumW = rgb2lum(colW.rgb);
        float lumE = rgb2lum(colE.rgb);

        // ==========================================
        // 1. SUB-PIXEL ANTI-ALIASING & DE-PIXELATION
        // ==========================================
        // Detect gradient along horizontal and vertical axes
        float edgeHoriz = abs(lumN + lumS - 2.0 * lumM);
        float edgeVert = abs(lumW + lumE - 2.0 * lumM);
        float edgeMag = edgeHoriz + edgeVert;

        // Directional sub-pixel blend (eliminates blocky staircases)
        vec4 crossBlur = (colN + colS + colW + colE) * 0.25;
        vec4 diagBlur = (colNW + colNE + colSW + colSE) * 0.25;
        vec4 smoothAverage = mix(crossBlur, diagBlur, 0.35);

        // De-pixelated base: blend center with edge-aware smooth filter
        float depixelWeight = clamp(u_depixel * 0.85, 0.0, 0.85);
        vec4 depixelated = mix(centerCol, smoothAverage, depixelWeight * clamp(edgeMag * 4.0, 0.15, 1.0));

        // ==========================================
        // 2. BILATERAL DENOISE / COMPRESSION REMOVAL
        // ==========================================
        vec3 bilateralSum = centerCol.rgb;
        float totalWeight = 1.0;
        float spatialFactor = 0.8;
        float rangeSigma = max(0.04, (1.05 - u_denoise * 0.7));

        vec4 neighbors[8];
        neighbors[0] = colN; neighbors[1] = colS; neighbors[2] = colW; neighbors[3] = colE;
        neighbors[4] = colNW; neighbors[5] = colNE; neighbors[6] = colSW; neighbors[7] = colSE;

        for (int i = 0; i < 8; i++) {
          float dist = distance(centerCol.rgb, neighbors[i].rgb);
          float w = exp(-dist / rangeSigma) * spatialFactor;
          bilateralSum += neighbors[i].rgb * w;
          totalWeight += w;
        }
        vec3 denoised = bilateralSum / totalWeight;
        vec3 cleanBase = mix(depixelated.rgb, denoised, u_denoise * 0.65);

        // ==========================================
        // 3. ADAPTIVE HIGH-FREQUENCY SHARPENING
        // ==========================================
        // Unsharp mask Laplacian: High-pass = Center - Low-pass
        vec3 blurSurround = (colN.rgb + colS.rgb + colW.rgb + colE.rgb +
                             colNW.rgb + colNE.rgb + colSW.rgb + colSE.rgb) / 8.0;
        vec3 highPass = cleanBase - blurSurround;

        // Limit halo amplification on hard contrast boundaries
        vec3 haloClamp = clamp(highPass, -0.2, 0.2);
        float sharpenAmt = u_sharpen * 1.6;
        vec3 sharpened = cleanBase + haloClamp * sharpenAmt;

        // ==========================================
        // 4. MICRO-CONTRAST & TEXTURE CLARITY
        // ==========================================
        // Midtone S-curve enhancement
        vec3 contrasted = sharpened;
        if (u_clarity > 0.01) {
          vec3 midToneDiff = sharpened - vec3(0.5);
          contrasted = clamp(sharpened + midToneDiff * (u_clarity * 0.35), 0.0, 1.0);
        }

        // ==========================================
        // 5. COLOR VIBRANCE BOOST
        // ==========================================
        vec3 finalCol = contrasted;
        if (u_vibrance > 0.01) {
          float maxC = max(finalCol.r, max(finalCol.g, finalCol.b));
          float minC = min(finalCol.r, min(finalCol.g, finalCol.b));
          float sat = maxC - minC;
          // Apply more boost to unsaturated regions
          float boost = (1.0 - sat) * u_vibrance * 0.45;
          finalCol = mix(vec3(rgb2lum(finalCol)), finalCol, 1.0 + boost);
        }

        gl_FragColor = vec4(clamp(finalCol, 0.0, 1.0), centerCol.a);
      }
    `;

    const vertShader = this._compileShader(gl.VERTEX_SHADER, vsSource);
    const fragShader = this._compileShader(gl.FRAGMENT_SHADER, fsSource);

    if (!vertShader || !fragShader) return false;

    const program = gl.createProgram();
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Shader Link Error:', gl.getProgramInfoLog(program));
      return false;
    }

    this.program = program;
    gl.useProgram(program);

    // Look up uniforms
    this.locations = {
      position: gl.getAttribLocation(program, 'a_position'),
      texCoord: gl.getAttribLocation(program, 'a_texCoord'),
      image: gl.getUniformLocation(program, 'u_image'),
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      depixel: gl.getUniformLocation(program, 'u_depixel'),
      sharpen: gl.getUniformLocation(program, 'u_sharpen'),
      clarity: gl.getUniformLocation(program, 'u_clarity'),
      denoise: gl.getUniformLocation(program, 'u_denoise'),
      vibrance: gl.getUniformLocation(program, 'u_vibrance')
    };

    // Full-screen Quad Buffer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1
    ]), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(this.locations.position);
    gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 0, 0);

    // Texture coords (flip Y for WebGL convention)
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0.0, 1.0,
      1.0, 1.0,
      0.0, 0.0,
      0.0, 0.0,
      1.0, 1.0,
      1.0, 0.0
    ]), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(this.locations.texCoord);
    gl.vertexAttribPointer(this.locations.texCoord, 2, gl.FLOAT, false, 0, 0);

    return true;
  }

  _compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader Compile Error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  /**
   * Load source image element or bitmap into GPU texture
   */
  setImage(imageElement) {
    this.sourceImage = imageElement;
    if (!this.gl || !this.isWebGLSupported) return;

    const gl = this.gl;
    if (this.texture) {
      gl.deleteTexture(this.texture);
    }

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    // Clamp to edge & linear filtering for smooth sub-pixel sampling
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageElement);
  }

  /**
   * Render enhanced image to target canvas
   * @param {HTMLCanvasElement} targetCanvas 
   * @param {Object} params { depixel, sharpen, clarity, denoise, vibrance, upscaleFactor }
   */
  renderToCanvas(targetCanvas, params) {
    if (!this.sourceImage) return;

    const originalW = this.sourceImage.naturalWidth || this.sourceImage.width;
    const originalH = this.sourceImage.naturalHeight || this.sourceImage.height;
    const upscaleFactor = params.upscaleFactor || 1;

    // Calculate exact target dimensions (Aspect ratio is 100% strictly preserved!)
    const targetW = Math.round(originalW * upscaleFactor);
    const targetH = Math.round(originalH * upscaleFactor);

    if (targetCanvas.width !== targetW || targetCanvas.height !== targetH) {
      targetCanvas.width = targetW;
      targetCanvas.height = targetH;
    }

    if (this.isWebGLSupported && this.gl && this.program) {
      const gl = this.gl;

      if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
        this.canvas.width = targetW;
        this.canvas.height = targetH;
      }

      gl.viewport(0, 0, targetW, targetH);
      gl.useProgram(this.program);

      // Bind texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.uniform1i(this.locations.image, 0);

      // Uniforms
      gl.uniform2f(this.locations.resolution, targetW, targetH);
      gl.uniform1f(this.locations.depixel, (params.depixel ?? 80) / 100);
      gl.uniform1f(this.locations.sharpen, (params.sharpen ?? 75) / 100);
      gl.uniform1f(this.locations.clarity, (params.clarity ?? 65) / 100);
      gl.uniform1f(this.locations.denoise, (params.denoise ?? 70) / 100);
      gl.uniform1f(this.locations.vibrance, (params.vibrance ?? 30) / 100);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Copy rendered result to destination canvas
      const ctx = targetCanvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(this.canvas, 0, 0, targetW, targetH);
    } else {
      // Fallback 2D Canvas enhancement if WebGL is unavailable
      this._renderCanvas2DFallback(targetCanvas, params, targetW, targetH);
    }
  }

  /**
   * Optimized 2D multi-pass fallback for browsers without WebGL
   */
  _renderCanvas2DFallback(targetCanvas, params, targetW, targetH) {
    const ctx = targetCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Step 1: Smooth upsample
    ctx.drawImage(this.sourceImage, 0, 0, targetW, targetH);

    // Step 2: Unsharp masking & contrast via pixel manipulation
    try {
      const imgData = ctx.getImageData(0, 0, targetW, targetH);
      const data = imgData.data;
      const sharpenAmt = ((params.sharpen ?? 70) / 100) * 0.8;
      const vibrance = ((params.vibrance ?? 30) / 100) * 0.3;

      for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        // Micro-contrast
        r = (r - 128) * (1 + sharpenAmt * 0.25) + 128;
        g = (g - 128) * (1 + sharpenAmt * 0.25) + 128;
        b = (b - 128) * (1 + sharpenAmt * 0.25) + 128;

        // Vibrance
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = (max - min) / 255;
        const vBoost = (1 - sat) * vibrance;
        const avg = (r + g + b) / 3;

        data[i] = Math.min(255, Math.max(0, r + (r - avg) * vBoost));
        data[i + 1] = Math.min(255, Math.max(0, g + (g - avg) * vBoost));
        data[i + 2] = Math.min(255, Math.max(0, b + (b - avg) * vBoost));
      }
      ctx.putImageData(imgData, 0, 0);
    } catch (e) {
      console.warn('Canvas 2D fallback imageData skipped:', e);
    }
  }

  /**
   * Export high-resolution image in requested format (PNG, JPEG, WEBP)
   * Aspect ratio is strictly identical to source image.
   */
  exportImage(targetCanvas, format = 'png', quality = 0.98) {
    return new Promise((resolve, reject) => {
      let mimeType = 'image/png';
      if (format === 'jpeg' || format === 'jpg') mimeType = 'image/jpeg';
      else if (format === 'webp') mimeType = 'image/webp';

      targetCanvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create image blob'));
          return;
        }
        resolve(blob);
      }, mimeType, quality);
    });
  }

  /**
   * Helper to compute greatest common divisor for aspect ratio calculation
   */
  static getAspectRatio(w, h) {
    if (!w || !h) return 'Unknown';
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(w, h);
    const rw = w / divisor;
    const rh = h / divisor;

    // Check for common photography/video standards
    const ratio = w / h;
    if (Math.abs(ratio - 16 / 9) < 0.02) return '16:9';
    if (Math.abs(ratio - 4 / 3) < 0.02) return '4:3';
    if (Math.abs(ratio - 1) < 0.01) return '1:1 (Square)';
    if (Math.abs(ratio - 9 / 16) < 0.02) return '9:16 (Vertical)';
    if (Math.abs(ratio - 3 / 2) < 0.02) return '3:2';
    if (Math.abs(ratio - 2 / 3) < 0.02) return '2:3';
    if (Math.abs(ratio - 21 / 9) < 0.03) return '21:9 (Ultrawide)';

    return `${rw}:${rh}`;
  }
}

window.ImageEnhancerEngine = ImageEnhancerEngine;
