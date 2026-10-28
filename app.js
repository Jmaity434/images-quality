/**
 * Super Lens - Application Controller
 * Handles image upload, 60 FPS real-time rendering, zoom/pan engine,
 * interactive split preview, and multi-format (PNG, JPG, WEBP, RAW) download.
 */

(function () {
  'use strict';

  // --- DOM Elements ---
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const viewerWorkspace = document.getElementById('viewerWorkspace');
  const resetAppBtn = document.getElementById('resetAppBtn');

  // Stages & Canvases
  const stageContainer = document.getElementById('stageContainer');
  const viewportTransform = document.getElementById('viewportTransform');
  const splitStage = document.getElementById('splitStage');
  const sideStage = document.getElementById('sideStage');
  const beforeCanvas = document.getElementById('beforeCanvas');
  const afterCanvas = document.getElementById('afterCanvas');
  const sideBeforeCanvas = document.getElementById('sideBeforeCanvas');
  const sideAfterCanvas = document.getElementById('sideAfterCanvas');
  const afterClipper = document.getElementById('afterClipper');
  const sliderHandle = document.getElementById('sliderHandle');

  // Toolbar Controls
  const splitModeBtn = document.getElementById('splitModeBtn');
  const sideModeBtn = document.getElementById('sideModeBtn');
  const holdOriginalBtn = document.getElementById('holdOriginalBtn');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomFitBtn = document.getElementById('zoomFitBtn');
  const zoom100Btn = document.getElementById('zoom100Btn');
  const zoomLevelDisplay = document.getElementById('zoomLevelDisplay');

  // Extender Sliders
  const qualityExtenderSlider = document.getElementById('qualityExtenderSlider');
  const qualityPercentBadge = document.getElementById('qualityPercentBadge');
  const upscaleRadios = document.querySelectorAll('input[name="upscaleFactor"]');
  const toggleFineTuneBtn = document.getElementById('toggleFineTuneBtn');
  const fineTunePanel = document.getElementById('fineTunePanel');
  const chevronIcon = document.getElementById('chevronIcon');

  // Fine-tune sliders
  const sliderDepixel = document.getElementById('sliderDepixel');
  const sliderSharpen = document.getElementById('sliderSharpen');
  const sliderClarity = document.getElementById('sliderClarity');
  const sliderDenoise = document.getElementById('sliderDenoise');
  const sliderVibrance = document.getElementById('sliderVibrance');
  const valDepixel = document.getElementById('valDepixel');
  const valSharpen = document.getElementById('valSharpen');
  const valClarity = document.getElementById('valClarity');
  const valDenoise = document.getElementById('valDenoise');
  const valVibrance = document.getElementById('valVibrance');

  // Export Settings
  const exportFormatRadios = document.querySelectorAll('input[name="exportFormat"]');
  const exportQualityRow = document.getElementById('exportQualityRow');
  const sliderExportQuality = document.getElementById('sliderExportQuality');
  const valExportQuality = document.getElementById('valExportQuality');
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadBtnSub = document.getElementById('downloadBtnSub');
  const metaRatio = document.getElementById('metaRatio');
  const metaOrigDims = document.getElementById('metaOrigDims');
  const metaTargetDims = document.getElementById('metaTargetDims');
  const toast = document.getElementById('toast');

  // --- Engine & State ---
  const enhancer = new ImageEnhancerEngine();
  let currentImage = null;
  let currentFileName = 'super-lens-image';

  // Zoom & Pan state
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let startPanX = 0;
  let startPanY = 0;

  // Split slider state
  let splitPercent = 50;
  let isDraggingSlider = false;
  let viewMode = 'split'; // 'split' | 'side'

  // Upscale & Export state
  let upscaleFactor = 2;
  let exportFormat = 'png';
  let exportQuality = 0.98;

  // Render loop control
  let renderPending = false;

  function init() {
    setupUploadHandlers();
    setupComparisonSlider();
    setupZoomAndPan();
    setupViewModeToggles();
    setupQualitySliders();
    setupExportHandlers();
    setupSampleImages();
  }

  // =========================================================================
  // 1. Upload & Ingestion (Strict Aspect Ratio Preservation)
  // =========================================================================
  function setupUploadHandlers() {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleFile(file);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.querySelector('.dropzone-box').classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.querySelector('.dropzone-box').classList.remove('dragover');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const file = dt.files && dt.files[0];
      if (file && file.type.startsWith('image/')) {
        handleFile(file);
      } else {
        showToast('Please upload a valid image file (JPG, PNG, WebP, BMP)');
      }
    });

    resetAppBtn.addEventListener('click', () => {
      currentImage = null;
      fileInput.value = '';
      dropZone.classList.remove('hidden');
      viewerWorkspace.classList.add('hidden');
      downloadBtn.disabled = true;
    });
  }

  function handleFile(file) {
    currentFileName = file.name.replace(/\.[^/.]+$/, "");
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        loadImage(img);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function loadImage(img) {
    currentImage = img;
    enhancer.setImage(img);

    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;

    // Calculate Aspect Ratio
    const ratioString = ImageEnhancerEngine.getAspectRatio(origW, origH);
    metaRatio.textContent = ratioString;
    metaOrigDims.textContent = `${origW} × ${origH} px`;

    // Render Raw Original to "Before" Canvas (No smoothing, clearly showing original pixels)
    beforeCanvas.width = origW;
    beforeCanvas.height = origH;
    const beforeCtx = beforeCanvas.getContext('2d');
    beforeCtx.imageSmoothingEnabled = false;
    beforeCtx.clearRect(0, 0, origW, origH);
    beforeCtx.drawImage(img, 0, 0, origW, origH);

    // Side-by-side canvas
    sideBeforeCanvas.width = origW;
    sideBeforeCanvas.height = origH;
    const sideBeforeCtx = sideBeforeCanvas.getContext('2d');
    sideBeforeCtx.imageSmoothingEnabled = false;
    sideBeforeCtx.drawImage(img, 0, 0, origW, origH);

    // Switch view
    dropZone.classList.add('hidden');
    viewerWorkspace.classList.remove('hidden');
    downloadBtn.disabled = false;

    // Reset zoom and fit to stage
    fitImageToScreen();
    requestEnhanceRender();
    showToast(`Image loaded: ${origW}×${origH} px (${ratioString})`);
  }

  // =========================================================================
  // 2. Real-Time Super-Resolution Render Pipeline
  // =========================================================================
  function requestEnhanceRender() {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => {
      renderPending = false;
      renderEnhancedImage();
    });
  }

  function renderEnhancedImage() {
    if (!currentImage) return;

    const params = {
      depixel: parseFloat(sliderDepixel.value),
      sharpen: parseFloat(sliderSharpen.value),
      clarity: parseFloat(sliderClarity.value),
      denoise: parseFloat(sliderDenoise.value),
      vibrance: parseFloat(sliderVibrance.value),
      upscaleFactor: upscaleFactor
    };

    enhancer.renderToCanvas(afterCanvas, params);

    if (viewMode === 'side') {
      enhancer.renderToCanvas(sideAfterCanvas, params);
    }

    const origW = currentImage.naturalWidth || currentImage.width;
    const origH = currentImage.naturalHeight || currentImage.height;
    const targetW = Math.round(origW * upscaleFactor);
    const targetH = Math.round(origH * upscaleFactor);
    metaTargetDims.textContent = `${targetW} × ${targetH} px (${upscaleFactor}× HD)`;

    const extName = exportFormat === 'raw' ? 'RAW (TIFF)' : exportFormat.toUpperCase();
    downloadBtnSub.textContent = `${extName} • ${targetW}×${targetH} px • 100% Aspect Ratio Preserved`;
  }

  // =========================================================================
  // 3. Interactive Split Comparison Slider
  // =========================================================================
  function setupComparisonSlider() {
    function setSplit(percent) {
      splitPercent = Math.max(0, Math.min(100, percent));
      sliderHandle.style.left = `${splitPercent}%`;
      afterClipper.style.clipPath = `polygon(${splitPercent}% 0, 100% 0, 100% 100%, ${splitPercent}% 100%)`;
    }

    function onPointerMove(e) {
      if (!isDraggingSlider) return;
      const rect = splitStage.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const offsetX = clientX - rect.left;
      const percent = (offsetX / rect.width) * 100;
      setSplit(percent);
    }

    function onPointerUp() {
      isDraggingSlider = false;
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
    }

    sliderHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      isDraggingSlider = true;
      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerUp);
    });

    sliderHandle.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      isDraggingSlider = true;
      window.addEventListener('touchmove', onPointerMove, { passive: true });
      window.addEventListener('touchend', onPointerUp);
    }, { passive: true });

    setSplit(50);
  }

  // =========================================================================
  // 4. Real-time Zoom & Pan Engine (Inspect Before/After without Pixels)
  // =========================================================================
  function setupZoomAndPan() {
    function applyTransform() {
      viewportTransform.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
      zoomLevelDisplay.textContent = `${Math.round(zoom * 100)}%`;
    }

    function setZoom(newZoom, centerX, centerY) {
      const prevZoom = zoom;
      zoom = Math.max(0.2, Math.min(12, newZoom)); // Up to 1200% zoom

      if (centerX !== undefined && centerY !== undefined) {
        const rect = stageContainer.getBoundingClientRect();
        const mouseX = centerX - rect.left - rect.width / 2;
        const mouseY = centerY - rect.top - rect.height / 2;

        panX -= (mouseX - panX) * (zoom / prevZoom - 1);
        panY -= (mouseY - panY) * (zoom / prevZoom - 1);
      }

      applyTransform();
    }

    stageContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      setZoom(zoom * zoomFactor, e.clientX, e.clientY);
    }, { passive: false });

    stageContainer.addEventListener('mousedown', (e) => {
      if (e.target.closest('#sliderHandle')) return;
      isPanning = true;
      startPanX = e.clientX - panX;
      startPanY = e.clientY - panY;
      stageContainer.classList.add('panning');
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      panX = e.clientX - startPanX;
      panY = e.clientY - startPanY;
      applyTransform();
    });

    window.addEventListener('mouseup', () => {
      if (isPanning) {
        isPanning = false;
        stageContainer.classList.remove('panning');
      }
    });

    // Touch controls
    let initialTouchDist = null;
    let initialTouchZoom = zoom;

    stageContainer.addEventListener('touchstart', (e) => {
      if (e.target.closest('#sliderHandle')) return;
      if (e.touches.length === 1) {
        isPanning = true;
        startPanX = e.touches[0].clientX - panX;
        startPanY = e.touches[0].clientY - panY;
      } else if (e.touches.length === 2) {
        isPanning = false;
        initialTouchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialTouchZoom = zoom;
      }
    }, { passive: true });

    stageContainer.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && isPanning) {
        panX = e.touches[0].clientX - startPanX;
        panY = e.touches[0].clientY - startPanY;
        applyTransform();
      } else if (e.touches.length === 2 && initialTouchDist) {
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const scale = currentDist / initialTouchDist;
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        setZoom(initialTouchZoom * scale, midX, midY);
      }
    }, { passive: true });

    stageContainer.addEventListener('touchend', () => {
      isPanning = false;
      initialTouchDist = null;
    });

    zoomInBtn.addEventListener('click', () => setZoom(zoom * 1.3));
    zoomOutBtn.addEventListener('click', () => setZoom(zoom / 1.3));
    zoomFitBtn.addEventListener('click', fitImageToScreen);
    zoom100Btn.addEventListener('click', () => {
      zoom = 1;
      panX = 0;
      panY = 0;
      applyTransform();
    });

    window.setZoomTransform = applyTransform;
  }

  function fitImageToScreen() {
    if (!currentImage) return;
    const stageRect = stageContainer.getBoundingClientRect();
    const origW = currentImage.naturalWidth || currentImage.width;
    const origH = currentImage.naturalHeight || currentImage.height;

    const availW = Math.max(200, stageRect.width - 60);
    const availH = Math.max(200, stageRect.height - 60);

    const scaleW = availW / origW;
    const scaleH = availH / origH;
    zoom = Math.min(scaleW, scaleH, 1.0);
    panX = 0;
    panY = 0;

    if (window.setZoomTransform) window.setZoomTransform();
  }

  // =========================================================================
  // 5. View Mode Toggles (Split, Side-by-Side, Hold Original)
  // =========================================================================
  function setupViewModeToggles() {
    splitModeBtn.addEventListener('click', () => {
      viewMode = 'split';
      splitModeBtn.classList.add('active');
      sideModeBtn.classList.remove('active');
      splitStage.classList.remove('hidden');
      sideStage.classList.add('hidden');
    });

    sideModeBtn.addEventListener('click', () => {
      viewMode = 'side';
      sideModeBtn.classList.add('active');
      splitModeBtn.classList.remove('active');
      splitStage.classList.add('hidden');
      sideStage.classList.remove('hidden');
      requestEnhanceRender();
    });

    function showOriginal() {
      afterClipper.style.opacity = '0';
    }
    function showEnhanced() {
      afterClipper.style.opacity = '1';
    }

    holdOriginalBtn.addEventListener('mousedown', showOriginal);
    window.addEventListener('mouseup', showEnhanced);
    holdOriginalBtn.addEventListener('touchstart', showOriginal, { passive: true });
    window.addEventListener('touchend', showEnhanced);
  }

  // =========================================================================
  // 6. Quality Sliders & Harmonization for Zero-Pixel Output
  // =========================================================================
  function setupQualitySliders() {
    qualityExtenderSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      qualityPercentBadge.textContent = `${val}%`;

      const t = val / 100;
      // High baseline de-pixelation to ensure no pixelation remains
      sliderDepixel.value = Math.round(30 + t * 65);       // 30% to 95%
      sliderSharpen.value = Math.round(20 + t * 70);       // 20% to 90%
      sliderClarity.value = Math.round(15 + t * 65);       // 15% to 80%
      sliderDenoise.value = Math.round(30 + t * 60);       // 30% to 90%
      sliderVibrance.value = Math.round(t * 40);           // 0% to 40%

      updateFineTuneValueDisplays();
      requestEnhanceRender();
    });

    const fineSliders = [
      { el: sliderDepixel, valEl: valDepixel },
      { el: sliderSharpen, valEl: valSharpen },
      { el: sliderClarity, valEl: valClarity },
      { el: sliderDenoise, valEl: valDenoise },
      { el: sliderVibrance, valEl: valVibrance }
    ];

    fineSliders.forEach(({ el, valEl }) => {
      el.addEventListener('input', () => {
        valEl.textContent = `${el.value}%`;
        requestEnhanceRender();
      });
    });

    function updateFineTuneValueDisplays() {
      valDepixel.textContent = `${sliderDepixel.value}%`;
      valSharpen.textContent = `${sliderSharpen.value}%`;
      valClarity.textContent = `${sliderClarity.value}%`;
      valDenoise.textContent = `${sliderDenoise.value}%`;
      valVibrance.textContent = `${sliderVibrance.value}%`;
    }

    toggleFineTuneBtn.addEventListener('click', () => {
      const isHidden = fineTunePanel.classList.toggle('hidden');
      chevronIcon.classList.toggle('open', !isHidden);
    });

    upscaleRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          upscaleFactor = parseInt(e.target.value, 10);
          requestEnhanceRender();
        }
      });
    });
  }

  // =========================================================================
  // 7. Download & Export (PNG, JPG, WEBP, and RAW/TIFF)
  // =========================================================================
  function setupExportHandlers() {
    exportFormatRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          exportFormat = e.target.value;
          if (exportFormat === 'jpeg' || exportFormat === 'webp') {
            exportQualityRow.classList.remove('hidden');
          } else {
            exportQualityRow.classList.add('hidden');
          }
          requestEnhanceRender();
        }
      });
    });

    sliderExportQuality.addEventListener('input', (e) => {
      valExportQuality.textContent = `${e.target.value}%`;
      exportQuality = parseInt(e.target.value, 10) / 100;
    });

    downloadBtn.addEventListener('click', async () => {
      if (!currentImage) return;

      try {
        downloadBtn.disabled = true;
        downloadBtn.querySelector('.btn-title').textContent = 'Generating High-Res Export...';

        const exportCanvas = document.createElement('canvas');
        const params = {
          depixel: parseFloat(sliderDepixel.value),
          sharpen: parseFloat(sliderSharpen.value),
          clarity: parseFloat(sliderClarity.value),
          denoise: parseFloat(sliderDenoise.value),
          vibrance: parseFloat(sliderVibrance.value),
          upscaleFactor: upscaleFactor
        };

        // Render full super-resolution onto export canvas
        enhancer.renderToCanvas(exportCanvas, params);

        const blob = await enhancer.exportImage(exportCanvas, exportFormat, exportQuality);
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        const w = exportCanvas.width;
        const h = exportCanvas.height;
        const fileExt = exportFormat === 'raw' ? 'tiff' : exportFormat;
        link.download = `${currentFileName}-superlens-${w}x${h}.${fileExt}`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(url), 5000);
        showToast(`Download ready: ${w}×${h} px (${fileExt.toUpperCase()})`);
      } catch (err) {
        console.error('Download error:', err);
        showToast('Error generating download. Please try again.');
      } finally {
        downloadBtn.disabled = false;
        downloadBtn.querySelector('.btn-title').textContent = 'Download Enhanced Image';
      }
    });
  }

  // =========================================================================
  // 8. Instant Sample Generators (SVG icons only, no emojis)
  // =========================================================================
  function setupSampleImages() {
    document.querySelectorAll('.sample-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const sampleType = chip.getAttribute('data-sample');
        generateSampleImage(sampleType);
      });
    });
  }

  function generateSampleImage(type) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (type === 'pixelart') {
      // 160x160 pixel art sprite with severe blockiness
      canvas.width = 160;
      canvas.height = 160;
      ctx.fillStyle = '#2A2A2A';
      ctx.fillRect(0, 0, 160, 160);

      // Character shapes with sharp pixel steps
      ctx.fillStyle = '#E10600';
      ctx.fillRect(40, 40, 80, 80);
      ctx.fillStyle = '#C0C0C0';
      ctx.fillRect(56, 56, 16, 20);
      ctx.fillRect(88, 56, 16, 20);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(60, 92, 40, 12);
      ctx.fillStyle = '#1c1c1c';
      ctx.fillRect(40, 20, 80, 20);
    } else if (type === 'portrait') {
      // Portrait gradient (360x480)
      canvas.width = 360;
      canvas.height = 480;
      const grad = ctx.createLinearGradient(0, 0, 360, 480);
      grad.addColorStop(0, '#2A2A2A');
      grad.addColorStop(0.5, '#383838');
      grad.addColorStop(1, '#1c1c1c');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 360, 480);

      ctx.fillStyle = '#C0C0C0';
      ctx.beginPath();
      ctx.arc(180, 180, 80, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#E10600';
      ctx.beginPath();
      ctx.arc(150, 170, 14, 0, Math.PI * 2);
      ctx.arc(210, 170, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#E10600';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(180, 205, 25, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    } else {
      // Landscape 16:9 (640x360)
      canvas.width = 640;
      canvas.height = 360;

      const skyGrad = ctx.createLinearGradient(0, 0, 0, 240);
      skyGrad.addColorStop(0, '#2A2A2A');
      skyGrad.addColorStop(1, '#5a5a5a');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, 640, 240);

      // Signal Red sun
      ctx.fillStyle = '#E10600';
      ctx.beginPath();
      ctx.arc(320, 160, 45, 0, Math.PI * 2);
      ctx.fill();

      // Mountains
      ctx.fillStyle = '#1c1c1c';
      ctx.beginPath();
      ctx.moveTo(0, 260);
      ctx.lineTo(160, 100);
      ctx.lineTo(340, 260);
      ctx.fill();

      ctx.fillStyle = '#2A2A2A';
      ctx.beginPath();
      ctx.moveTo(220, 260);
      ctx.lineTo(440, 120);
      ctx.lineTo(640, 260);
      ctx.fill();

      ctx.fillStyle = '#383838';
      ctx.fillRect(0, 260, 640, 100);
    }

    const img = new Image();
    img.onload = () => {
      currentFileName = `sample-${type}`;
      loadImage(img);
    };
    img.src = canvas.toDataURL('image/png');
  }

  // --- Toast Notification Helper ---
  let toastTimer = null;
  function showToast(message) {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.remove('hidden');
    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 3500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
