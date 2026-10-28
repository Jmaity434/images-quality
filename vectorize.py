"""
Super Lens - Standalone Python Image Vectorizer & De-pixelator
Converts raster images (PNG, JPG, WebP) into pure mathematical SVG vectors with ZERO pixels.
Requires: opencv-python, numpy, pillow (all standard)
Usage:
    python vectorize.py input.png output.svg
    python vectorize.py input.png output.svg --colors 24 --smooth 1.5
"""

import sys
import argparse
from pathlib import Path
import numpy as np
import cv2
from PIL import Image


def smooth_contour_to_bezier(contour, smooth_factor=1.0):
    """
    Converts a polygonal OpenCV contour into smooth cubic Bezier SVG path commands.
    """
    points = contour.reshape(-1, 2)
    n = len(points)
    if n < 3:
        return ""

    # Approximate polygon to reduce micro-noise
    epsilon = 0.002 * smooth_factor * cv2.arcLength(contour, True)
    approx = cv2.approxPolyDP(contour, epsilon, True).reshape(-1, 2)
    m = len(approx)
    if m < 3:
        approx = points
        m = n

    d_parts = [f"M {approx[0][0]:.2f} {approx[0][1]:.2f}"]

    for i in range(m):
        p0 = approx[(i - 1) % m]
        p1 = approx[i]
        p2 = approx[(i + 1) % m]
        p3 = approx[(i + 2) % m]

        # Catmull-Rom to Cubic Bezier control points
        c1x = p1[0] + (p2[0] - p0[0]) / 6.0
        c1y = p1[1] + (p2[1] - p0[1]) / 6.0
        c2x = p2[0] - (p3[0] - p1[0]) / 6.0
        c2y = p2[1] - (p3[1] - p1[1]) / 6.0

        d_parts.append(f"C {c1x:.2f} {c1y:.2f}, {c2x:.2f} {c2y:.2f}, {p2[0]:.2f} {p2[1]:.2f}")

    d_parts.append("Z")
    return " ".join(d_parts)


def vectorize_image(input_path, output_path, n_colors=24, smooth=1.2, min_area=4):
    """
    Vectorizes a raster image into pure SVG paths with zero pixels.
    """
    img_bgr = cv2.imread(str(input_path))
    if img_bgr is None:
        raise FileNotFoundError(f"Could not open image: {input_path}")

    h, w = img_bgr.shape[:2]
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    # Step 1: Bilateral smoothing to remove pixel noise while locking edge boundaries
    filtered = cv2.bilateralFilter(img_rgb, d=7, sigmaColor=75, sigmaSpace=75)

    # Step 2: K-Means color quantization
    pixel_data = filtered.reshape((-1, 3)).astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centers = cv2.kmeans(
        pixel_data, n_colors, None, criteria, 10, cv2.KMEANS_PP_CENTERS
    )
    centers = np.uint8(centers)
    quantized = centers[labels.flatten()].reshape((h, w, 3))

    # Step 3: Extract contours for each color layer
    svg_paths = []
    
    # Sort colors by frequency so background is drawn first
    unique_labels, counts = np.unique(labels, return_counts=True)
    sorted_indices = np.argsort(-counts)

    for idx in sorted_indices:
        color = centers[idx]
        hex_color = "#{:02x}{:02x}{:02x}".format(color[0], color[1], color[2])
        mask = (labels.flatten() == idx).astype(np.uint8).reshape((h, w)) * 255

        # Morphological close to eliminate isolated 1-pixel holes
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mask_clean = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(mask_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < min_area:
                continue
            path_d = smooth_contour_to_bezier(cnt, smooth_factor=smooth)
            if path_d:
                svg_paths.append((area, hex_color, path_d))

    # Sort paths by area descending so smaller details render on top
    svg_paths.sort(key=lambda x: x[0], reverse=True)

    # Step 4: Write SVG XML
    svg_lines = [
        f'<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">',
        f'  <defs>',
        f'    <style>',
        f'      path {{ shape-rendering: geometricPrecision; }}',
        f'    </style>',
        f'  </defs>'
    ]

    for _, hex_col, d in svg_paths:
        svg_lines.append(f'  <path d="{d}" fill="{hex_col}" stroke="{hex_col}" stroke-width="0.5" />')

    svg_lines.append('</svg>')

    output_path = Path(output_path)
    output_path.write_text("\n".join(svg_lines), encoding="utf-8")
    print(f"[OK] Vectorized '{input_path}' ({w}x{h}) -> '{output_path}' with {len(svg_paths)} SVG vector curves (ZERO PIXELS).")


def main():
    parser = argparse.ArgumentParser(description="Convert pixelated raster images to pure zero-pixel SVG vectors.")
    parser.add_argument("input", help="Path to input image (PNG, JPG, etc.)")
    parser.add_argument("output", nargs="?", help="Path to output SVG file")
    parser.add_argument("--colors", type=int, default=24, help="Number of color layers (default: 24)")
    parser.add_argument("--smooth", type=float, default=1.2, help="Bezier curve smoothness factor (default: 1.2)")
    parser.add_argument("--min-area", type=int, default=4, help="Minimum contour area to keep (default: 4)")

    args = parser.parse_args()
    input_p = Path(args.input)
    if not input_p.exists():
        print(f"Error: file not found: {input_p}", file=sys.stderr)
        sys.exit(1)

    output_p = args.output or input_p.with_suffix(".svg")
    vectorize_image(input_p, output_p, n_colors=args.colors, smooth=args.smooth, min_area=args.min_area)


if __name__ == "__main__":
    main()
