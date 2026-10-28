# Super Lens - Zero-Pixel Image Quality Extender & SVG Vectorizer

Super Lens converts low-resolution, blocky pixelated raster images (PNG, JPG, WebP) into infinite-resolution mathematical **SVG vector curves with ZERO pixels**. Whether in the browser or offline via Python, low-resolution pixel grids are eliminated into smooth, continuous vector contours.

🌐 **Live GitHub Pages URL**: [https://jmaity434.github.io/images-quality/](https://jmaity434.github.io/images-quality/)

---

## 🎨 Photographic Color Palette

- **Charcoal Grey (`#2A2A2A`)**: Base surfaces, cards, and darkroom viewports.
- **Moonlit Silver (`#C0C0C0`)**: Borders, controls, secondary text, and slider tracks.
- **Signal Red (`#E10600`)**: Primary highlights, active view modes, and key action buttons.

---

## 🌟 How Zero-Pixel Vectorization Works

Raster images store colors as discrete square pixels. When scaled up, traditional interpolation leaves visible stair-stepping and blockiness.

Super Lens applies **Bezier contour vectorization**:
1. **Bilateral Smoothing**: Suppresses pixel lattice noise while locking semantic edge boundaries.
2. **Color Layer Quantization**: Groups colors into ordered layers.
3. **Smooth Cubic Bezier Fitting**: Converts jagged pixel staircases into smooth mathematical curves (`M ... C ... Z`).
4. **Infinite Resolution**: Vectors are mathematical formulas. You can zoom in 100%, 1000%, or 10000%—**zero pixels exist anywhere**.

---

## 🚀 Key Features

1. **Zero-Pixel SVG Vector Engine (Client-Side & Offline)**:
   - Built-in in-browser SVG tracer + standalone Python CLI vectorizer script (`vectorize.py`).
2. **Real-Time Quality Extender Slider**:
   - Master slider harmonizes curve smoothness, color layers, and edge definition.
3. **Interactive Split Before / After Curtain**:
   - Compares raw pixelated image (Before) with the smooth mathematical vector output (After).
4. **1200% Synchronized Zoom & Pan**:
   - Mouse wheel and touch pinch-zoom to inspect fine details.
5. **Strict Aspect Ratio Preservation**:
   - Uploaded aspect ratios (16:9, 4:3, 1:1, 9:16, custom) remain strictly locked.
6. **Multi-Format Export**:
   - **SVG (Vector - 0 Pixels)**: Pure mathematical vector file (scalable to billboard sizes).
   - **PNG**: Vector-rasterized at 1×, 2× HD, or 4× Ultra HD.
   - **JPG / JPEG**: Compact web format.
   - **WEBP**: Next-gen web image.
   - **RAW (TIFF)**: Uncompressed 32-bit TIFF master.

---

## 🐍 Python Vectorizer Script (`vectorize.py`)

Run offline on your PC to convert any image into pure SVG:

```bash
# Basic usage:
python vectorize.py my_image.png output.svg

# Custom colors & smoothness:
python vectorize.py my_image.png output.svg --colors 32 --smooth 1.5
```

---

## 🔧 Running Web App Locally

```bash
# Python 3:
python -m http.server 8000

# or Node.js:
npx serve .
```
Visit: [http://localhost:8000](http://localhost:8000)
