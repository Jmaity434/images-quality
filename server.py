"""
Super Lens - Local Python Server & Vectorizer Engine
Serves the web application and handles high-performance OpenCV vectorization with ZERO pixels.
Automatically opens your browser at http://localhost:8000.
"""

import os
import sys
import json
import base64
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import numpy as np
import cv2

# Import vectorizer logic from vectorize.py
from vectorize import vectorize_image, smooth_contour_to_bezier

PORT = 8080
DIRECTORY = Path(__file__).resolve().parent


class SuperLensRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)

    def do_GET(self):
        if self.path == '/api/ping':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok', 'engine': 'python-opencv'}).encode('utf-8'))
            return
        super().do_GET()

    def do_POST(self):
        if self.path == '/api/vectorize':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            try:
                payload = json.loads(post_data.decode('utf-8'))
                image_data_b64 = payload.get('image', '')
                n_colors = int(payload.get('colors', 32))
                smooth = float(payload.get('smooth', 1.5))

                if ',' in image_data_b64:
                    image_data_b64 = image_data_b64.split(',', 1)[1]

                img_bytes = base64.b64decode(image_data_b64)
                nparr = np.frombuffer(img_bytes, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                if img is None:
                    raise ValueError("Could not decode image")

                # Temp file paths for vectorization
                temp_in = DIRECTORY / '_temp_input.png'
                temp_out = DIRECTORY / '_temp_output.svg'

                cv2.imwrite(str(temp_in), img)
                vectorize_image(temp_in, temp_out, n_colors=n_colors, smooth=smooth)

                svg_content = temp_out.read_text(encoding='utf-8')

                # Clean up temporary files
                if temp_in.exists(): temp_in.unlink()
                if temp_out.exists(): temp_out.unlink()

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success', 'svg': svg_content}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'error', 'message': str(e)}).encode('utf-8'))
            return

        super().do_POST()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()


def run_server():
    server_address = ('127.0.0.1', PORT)
    httpd = HTTPServer(server_address, SuperLensRequestHandler)
    local_url = f"http://localhost:{PORT}"

    print(f"=" * 60)
    print(f" Super Lens - Local Python Server Running")
    print(f" URL: {local_url}")
    print(f" Python OpenCV Vectorizer is ACTIVE with ZERO PIXELS")
    print(f"=" * 60)
    print(f" Opening default browser at {local_url} ...")

    webbrowser.open(local_url)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
        httpd.server_close()


if __name__ == '__main__':
    run_server()
