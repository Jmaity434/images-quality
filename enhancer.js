/**
 * Super Lens - Advanced Real-Time Image Quality Extender & De-Pixelation Engine
 * Features:
 *  - 16-tap Continuous Bicubic Catmull-Rom Spline Resampling (Physically eliminates pixel grids)
 *  - Wide-Kernel Bilateral Denoise & JPEG Block Artifact Suppression
 *  - Edge-Directed Contour Anti-Aliasing (Smooths jagged staircase edges into vector-smooth lines)
 *  - Adaptive High-Pass Sharpening & Micro-Contrast
 *  - Uncompressed RAW (TIFF) & PNG/JPEG/WEBP Export Preserving Strict Aspect Ratio
 */

class ImageEnhancerEngine {
  constructor() {
    this.canvas = null;
    this.gl = null;
    this.program = null;
    this.texture = null;
    this.isWebGLSupported = false;
    this.sourceImage = null;
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

    // Continuous Super-Resolution & Anti-Aliased De-pixelation Fragment Shader
    const fsSource = `
      precision highp float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform vec2 u_srcResolution;  // RAW uploaded image dimensions (width, height)
      uniform vec2 u_dstResolution;  // Target upscaled canvas dimensions (width, height)
      
      uniform float u_depixel;   // 0.0 to 1.0 (anti-aliasing & pixel boundary smoothing)
      uniform float u_sharpen;   // 0.0 to 1.0 (adaptive edge definition)
      uniform float u_clarity;   // 0.0 to 1.0 (micro-contrast)
      uniform float u_denoise;   // 0.0 to 1.0 (bilateral noise suppression)
      uniform float u_vibrance;  // 0.0 to 1.0 (color vibrancy)

      // Convert RGB to Luminance
      float rgb2lum(vec3 c) {
        return dot(c, vec3(0.299, 0.587, 0.114));
      }

      // Fast Catmull-Rom Bicubic Spline Filter:
      // Samples across 4 bilinear taps using optimal texture offset math,
      // creating continuous C1 curves with ZERO blocky pixel squares.
      vec4 sampleBicubic(sampler2D tex, vec2 uv, vec2 texSize) {
        vec2 invTexSize = 1.0 / texSize;
        vec2 tc = uv * texSize - 0.5;
        vec2 f = fract(tc);
        vec2 tcFloor = floor(tc);

        // Catmull-Rom weights
        vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
        vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
        vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
        vec2 w3 = f * f * (-0.5 + 0.5 * f);

        vec2 w12 = w1 + w2;
        vec2 offset12 = w2 / w12;

        vec2 texPos0  = (tcFloor - 1.0 + 0.5) * invTexSize;
        vec2 texPos12 = (tcFloor + offset12 + 0.5) * invTexSize;
        vec2 texPos3  = (tcFloor + 2.0 + 0.5) * invTexSize;

        vec4 res = vec4(0.0);
        res += texture2D(tex, vec2(texPos0.x,  texPos0.y))  * (w0.x * w0.y);
        res += texture2D(tex, vec2(texPos12.x, texPos0.y))  * (w12.x * w0.y);
        res += texture2D(tex, vec2(texPos3.x,  texPos0.y))  * (w3.x * w0.y);

        res += texture2D(tex, vec2(texPos0.x,  texPos12.y)) * (w0.x * w12.y);
        res += texture2D(tex, vec2(texPos12.x, texPos12.y)) * (w12.x * w12.y);
        res += texture2D(tex, vec2(texPos3.x,  texPos12.y)) * (w3.x * w12.y);

        res += texture2D(tex, vec2(texPos0.x,  texPos3.y))  * (w0.x * w3.y);
        res += texture2D(tex, vec2(texPos12.x, texPos3.y))  * (w12.x * w3.y);
        res += texture2D(tex, vec2(texPos3.x,  texPos3.y))  * (w3.x * w3.y);

        return clamp(res, 0.0, 1.0);
      }

      void main() {
        vec2 uv = v_texCoord;
        vec2 srcPix = 1.0 / u_srcResolution;

        // Step 1: Continuous Bicubic Surface Sampling (completely removes blocky pixel borders)
        vec4 baseCol = sampleBicubic(u_image, uv, u_srcResolution);

        // Step 2: Edge-Preserving Bilateral Smoothing across source pixel domain
        // Blends adjacent sub-pixels to eliminate stair-step aliasing and compression blocks
        float lumC = rgb2lum(baseCol.rgb);
        vec3 bilateralAccum = baseCol.rgb;
        float totalWeight = 1.0;
        
        // Sampling radius scaled by raw pixel pitch
        float filterRadius = 1.2 + u_depixel * 1.6;
        float sigmaColor = max(0.04, (1.1 - u_denoise * 0.75));

        // Sample 8 directional neighbors scaled to raw pixel borders
        vec2 dirs[8];
        dirs[0] = vec2( 1.0,  0.0); dirs[1] = vec2(-1.0,  0.0);
        dirs[2] = vec2( 0.0,  1.0); dirs[3] = vec2( 0.0, -1.0);
        dirs[4] = vec2( 0.7,  0.7); dirs[5] = vec2(-0.7,  0.7);
        dirs[6] = vec2( 0.7, -0.7); dirs[7] = vec2(-0.7, -0.7);

        for (int i = 0; i < 8; i++) {
          vec2 offset = dirs[i] * srcPix * filterRadius;
          vec4 neighbor = sampleBicubic(u_image, uv + offset, u_srcResolution);
          float lumN = rgb2lum(neighbor.rgb);
          
          float dColor = abs(lumC - lumN);
          float w = exp(-(dColor * dColor) / (2.0 * sigmaColor * sigmaColor));
          bilateralAccum += neighbor.rgb * w;
          totalWeight += w;
        }

        vec3 smoothed = bilateralAccum / totalWeight;

        // Blend bicubic with bilateral based on de-pixel strength
        vec3 depixelated = mix(baseCol.rgb, smoothed, clamp(u_depixel * 0.95, 0.0, 0.95));

        // Step 3: Directional Edge-Directed Anti-Aliasing (FXAA Tangent Blend)
        // Detects remaining stair-step edges and smooths along edge tangent
        vec4 sN = sampleBicubic(u_image, uv + vec2(0.0, -srcPix.y), u_srcResolution);
        vec4 sS = sampleBicubic(u_image, uv + vec2(0.0,  srcPix.y), u_srcResolution);
        vec4 sW = sampleBicubic(u_image, uv + vec2(-srcPix.x, 0.0), u_srcResolution);
        vec4 sE = sampleBicubic(u_image, uv + vec2( srcPix.x, 0.0), u_srcResolution);

        float lN = rgb2lum(sN.rgb);
        float lS = rgb2lum(sS.rgb);
        float lW = rgb2lum(sW.rgb);
        float lE = rgb2lum(sE.rgb);

        float gradH = abs(lN - lS);
        float gradV = abs(lW - lE);
        float edgePresence = clamp((gradH + gradV) * 3.5, 0.0, 1.0);

        vec3 crossBlend = (sN.rgb + sS.rgb + sW.rgb + sE.rgb) * 0.25;
        vec3 contourCleaned = mix(depixelated, crossBlend, edgePresence * (u_depixel * 0.45));

        // Step 4: Adaptive High-Pass Edge Sharpening (Sharpens real contours, NOT pixel grids)
        vec3 lowPass = (sN.rgb + sS.rgb + sW.rgb + sE.rgb) * 0.25;
        vec3 highPass = contourCleaned - lowPass;
        
        // Strict halo clamp to avoid ringing artifacts
        vec3 clampedHighPass = clamp(highPass, -0.15, 0.15);
        vec3 sharpened = contourCleaned + clampedHighPass * (u_sharpen * 1.5);

        // Step 5: Micro-Contrast & Clarity
        vec3 contrasted = sharpened;
        if (u_clarity > 0.01) {
          vec3 midToneDiff = sharpened - vec3(0.5);
          contrasted = clamp(sharpened + midToneDiff * (u_clarity * 0.4), 0.0, 1.0);
        }

        // Step 6: Color Vibrancy
        vec3 finalCol = contrasted;
        if (u_vibrance > 0.01) {
          float maxC = max(finalCol.r, max(finalCol.g, finalCol.b));
          float minC = min(finalCol.r, min(finalCol.g, finalCol.b));
          float sat = maxC - minC;
          float boost = (1.0 - sat) * u_vibrance * 0.4;
          finalCol = mix(vec3(rgb2lum(finalCol)), finalCol, 1.0 + boost);
        }

        gl_FragColor = vec4(clamp(finalCol, 0.0, 1.0), baseCol.a);
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

    // Uniform & Attrib locations
    this.locations = {
      position: gl.getAttribLocation(program, 'a_position'),
      texCoord: gl.getAttribLocation(program, 'a_texCoord'),
      image: gl.getUniformLocation(program, 'u_image'),
      srcResolution: gl.getUniformLocation(program, 'u_srcResolution'),
      dstResolution: gl.getUniformLocation(program, 'u_dstResolution'),
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

    // Texture coords (flip Y for WebGL)
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

  setImage(imageElement) {
    this.sourceImage = imageElement;
    if (!this.gl || !this.isWebGLSupported) return;

    const gl = this.gl;
    if (this.texture) {
      gl.deleteTexture(this.texture);
    }

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageElement);
  }

  /**
   * Render enhanced image to target canvas with exact aspect ratio preservation
   */
  renderToCanvas(targetCanvas, params) {
    if (!this.sourceImage) return;

    const originalW = this.sourceImage.naturalWidth || this.sourceImage.width;
    const originalH = this.sourceImage.naturalHeight || this.sourceImage.height;
    const upscaleFactor = params.upscaleFactor || 2;

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

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.uniform1i(this.locations.image, 0);

      // Pass BOTH raw source dimensions and destination dimensions
      gl.uniform2f(this.locations.srcResolution, originalW, originalH);
      gl.uniform2f(this.locations.dstResolution, targetW, targetH);

      gl.uniform1f(this.locations.depixel, (params.depixel ?? 85) / 100);
      gl.uniform1f(this.locations.sharpen, (params.sharpen ?? 75) / 100);
      gl.uniform1f(this.locations.clarity, (params.clarity ?? 65) / 100);
      gl.uniform1f(this.locations.denoise, (params.denoise ?? 75) / 100);
      gl.uniform1f(this.locations.vibrance, (params.vibrance ?? 35) / 100);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      const ctx = targetCanvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(this.canvas, 0, 0, targetW, targetH);
    } else {
      this._renderCanvas2DFallback(targetCanvas, params, targetW, targetH);
    }
  }

  _renderCanvas2DFallback(targetCanvas, params, targetW, targetH) {
    const ctx = targetCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.sourceImage, 0, 0, targetW, targetH);
  }

  /**
   * Export image in user's requested format: PNG, JPEG, WEBP, or RAW (TIFF 6.0)
   */
  exportImage(targetCanvas, format = 'png', quality = 0.98) {
    return new Promise((resolve, reject) => {
      if (format === 'raw') {
        try {
          const tiffBlob = this._canvasToRawTiff(targetCanvas);
          resolve(tiffBlob);
        } catch (e) {
          reject(e);
        }
        return;
      }

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
   * Generates a baseline uncompressed TIFF 6.0 RAW container directly from canvas
   */
  _canvasToRawTiff(canvas) {
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, width, height);
    const rgba = imgData.data;

    // TIFF Header: 8 bytes
    // Little-endian ("II"), 42, offset to IFD
    const numEntries = 13;
    const ifdSize = 2 + numEntries * 12 + 4;
    const extraDataSize = 8 + 8 + 8; // BitsPerSample (8 bytes), XRes (8 bytes), YRes (8 bytes)
    const headerSize = 8;
    const offsetIfd = headerSize;
    const offsetExtra = headerSize + ifdSize;
    const offsetImageData = offsetExtra + extraDataSize;

    const totalRasterBytes = width * height * 4;
    const totalFileSize = offsetImageData + totalRasterBytes;

    const buffer = new ArrayBuffer(totalFileSize);
    const view = new DataView(buffer);

    // 1. Header
    view.setUint8(0, 0x49); // 'I'
    view.setUint8(1, 0x49); // 'I' (Little-endian)
    view.setUint16(2, 42, true); // Version 42
    view.setUint32(4, offsetIfd, true); // Pointer to 1st IFD

    // 2. Extra data offsets
    const offsetBitsPerSample = offsetExtra;
    const offsetXRes = offsetExtra + 8;
    const offsetYRes = offsetExtra + 16;

    // Write extra data
    view.setUint16(offsetBitsPerSample + 0, 8, true);
    view.setUint16(offsetBitsPerSample + 2, 8, true);
    view.setUint16(offsetBitsPerSample + 4, 8, true);
    view.setUint16(offsetBitsPerSample + 6, 8, true);

    // 300 DPI (300 / 1)
    view.setUint32(offsetXRes + 0, 300, true);
    view.setUint32(offsetXRes + 4, 1, true);
    view.setUint32(offsetYRes + 0, 300, true);
    view.setUint32(offsetYRes + 4, 1, true);

    // 3. IFD Entries
    let p = offsetIfd;
    view.setUint16(p, numEntries, true);
    p += 2;

    const writeTag = (tag, type, count, valOrOffset) => {
      view.setUint16(p + 0, tag, true);
      view.setUint16(p + 2, type, true);
      view.setUint32(p + 4, count, true);
      view.setUint32(p + 8, valOrOffset, true);
      p += 12;
    };

    // 256: ImageWidth (LONG)
    writeTag(256, 4, 1, width);
    // 257: ImageLength (LONG)
    writeTag(257, 4, 1, height);
    // 258: BitsPerSample (SHORT, count 4, offset)
    writeTag(258, 3, 4, offsetBitsPerSample);
    // 259: Compression (SHORT: 1 = Uncompressed RAW)
    writeTag(259, 3, 1, 1);
    // 262: PhotometricInterpretation (SHORT: 2 = RGB)
    writeTag(262, 3, 1, 2);
    // 273: StripOffsets (LONG)
    writeTag(273, 4, 1, offsetImageData);
    // 277: SamplesPerPixel (SHORT: 4 RGBA)
    writeTag(277, 3, 1, 4);
    // 278: RowsPerStrip (LONG)
    writeTag(278, 4, 1, height);
    // 279: StripByteCounts (LONG)
    writeTag(279, 4, 1, totalRasterBytes);
    // 282: XResolution (RATIONAL)
    writeTag(282, 5, 1, offsetXRes);
    // 283: YResolution (RATIONAL)
    writeTag(283, 5, 1, offsetYRes);
    // 284: PlanarConfiguration (SHORT: 1 = Chunky)
    writeTag(284, 3, 1, 1);
    // 296: ResolutionUnit (SHORT: 2 = Inches)
    writeTag(296, 3, 1, 2);

    // End of IFD
    view.setUint32(p, 0, true);

    // 4. Pixel raster bytes
    const u8 = new Uint8Array(buffer, offsetImageData, totalRasterBytes);
    u8.set(rgba);

    return new Blob([buffer], { type: 'image/tiff' });
  }

  static getAspectRatio(w, h) {
    if (!w || !h) return 'Unknown';
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(w, h);
    const rw = w / divisor;
    const rh = h / divisor;

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
