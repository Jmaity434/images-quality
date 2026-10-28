# Super Lens - Real-Time Image Quality Extender & De-pixelator

Super Lens is a high-performance, real-time image quality extender and super-resolution web application. It runs 100% client-side in the browser via hardware-accelerated WebGL fragment shaders, eliminating blocky pixelation and jagged staircase artifacts while preserving the exact aspect ratio of any uploaded image.

🌐 **Live GitHub Pages URL**: [https://jmaity434.github.io/images-quality/](https://jmaity434.github.io/images-quality/)

---

## 🎨 Color Palette

Designed with an ultra-sleek, precision photographic dark theme:
- **Charcoal Grey (`#2A2A2A`)**: Primary dark backgrounds and card surfaces.
- **Moonlit Silver (`#C0C0C0`)**: Borders, sliders, typography, and secondary accents.
- **Signal Red (`#E10600`)**: Primary brand highlights, active states, and call-to-action buttons.

---

## 🚀 Key Features

1. **Continuous 16-Tap Bicubic & Anti-Aliased Engine**:
   - Uses 16-tap Catmull-Rom bicubic spline resampling across raw pixel pitch (`1.0 / u_srcResolution`) to physically eliminate pixel grids.
   - Bilateral smoothing and directional edge anti-aliasing transform pixelated staircases into clean, smooth, vector-like contours.

2. **Real-Time Quality Extender Slider**:
   - Master slider smoothly adjusts from Low (Raw Original) to High (Ultra HD) at 60 FPS.
   - Fine-tuning controls for De-pixelation, Edge Definition, Micro-Contrast, Noise Suppression, and Vibrancy.

3. **Strict Aspect Ratio Preservation**:
   - The user's uploaded aspect ratio (e.g., 16:9, 4:3, 1:1, 9:16) is strictly maintained across preview stages and high-resolution exports.

4. **Synchronized Zoom & Pan (Up to 1200%)**:
   - Mouse wheel and touch pinch-to-zoom to scrutinize fine details.
   - Even when zoomed in deep, the enhanced output remains silky-smooth with zero pixel blocks.

5. **Interactive Before/After Comparison**:
   - Interactive split-screen slider with draggable curtain.
   - Side-by-side mode and instant "Hold for Original" peek view.

6. **Multi-Format Export Including RAW**:
   - **PNG**: Lossless web standard.
   - **JPG / JPEG**: Compact with adjustable compression quality.
   - **WEBP**: Next-generation web format.
   - **RAW (TIFF)**: Uncompressed 32-bit RGBA TIFF 6.0 master raster container for Photoshop and Lightroom.
   - Upscale factors: 1× (Clean Denoise), 2× HD, 4× Ultra HD.

---

## 💻 Tech Stack

- **Framework**: Tailwind CSS & HTML5.
- **Rendering Engine**: WebGL 1.0/2.0 with custom GLSL continuous bicubic fragment shaders.
- **Hosting**: GitHub Pages (Static, zero server overhead).

---

## 🔧 Running Locally

```bash
# Python 3
python -m http.server 8000

# or Node.js npx
npx serve .
```
Open [http://localhost:8000](http://localhost:8000) in your browser.
