/**
 * SuperLens Real-Time Image Quality Extender
 * Application Controller: Uploads, Zoom/Pan Engine, Split-Slider, and Export.
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

  // Toolbar & View Buttons
  const splitModeBtn = document.getElementById('splitModeBtn');
  const sideModeBtn = document.getElementById('sideModeBtn');
  const holdOriginalBtn = document.getElementById('holdOriginalBtn');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomFitBtn = document.getElementById('zoomFitBtn');
  const zoom100Btn = document.getElementById('zoom100Btn');
  const zoomLevelDisplay = document.getElementById('zoomLevelDisplay');

  // Controls & Sliders
  const qualityExtenderSlider = document.getElementById('qualityExtenderSlider');
  const qualityPercentBadge = document.getElementById('qualityPercentBadge');
  const upscaleRadios = document.querySelectorAll('input[name="upscaleFactor"]');
  const toggleFineTuneBtn = document.getElementById('toggleFineTuneBtn');
  const fineTunePanel = document.getElementById('fineTunePanel');
  const chevronIcon = document.getElementById('chevronIcon');

  // Fine tune inputs
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

  // Download & Metadata
  const exportFormatRadios = document.querySelectorAll('input[name="exportFormat"]');
  const exportQualityRow = document.getElementById('exportQualityRow');
  const sliderExportQuality = document.getElementById('sliderExportQuality');
  const valExportQuality = document.getElementById('valExportQuality');
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadBtnSub = document.getElementById('downloadBtnSub');
  const metaRatio = document.getElementById('metaRatio');
  const metaOrigDims = document.getElementById('metaOrigDims');
  const metaTargetDims = document.getElementById('metaTargetDims');
  const metaSmoothness = document.getElementById('metaSmoothness');
  const toast = document.getElementById('toast');

  // --- Engine & State ---
  const enhancer = new ImageEnhancerEngine();
  let currentImage = null;
  let currentFileName = 'enhanced-image';

  // Zoom & Pan state
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let startPanX = 0;
  let startPanY = 0;

  // Split slider state (0 to 100%)
  let splitPercent = 50;
  let isDraggingSlider = false;
  let viewMode = 'split'; // 'split' | 'side'

  // Upscale & Export state
  let upscaleFactor = 2;
  let exportFormat = 'png';
  let exportQuality = 0.98;

  // Render loop throttle
  let renderPending = false;

  // --- Initialization ---
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
  // 1. Upload & Image Ingestion (Preserving Exact Aspect Ratio)
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
        dropZone.querySelector('.dropzone-content').classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.querySelector('.dropzone-content').classList.remove('dragover');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const file = dt.files && dt.files[0];
      if (file && file.type.startsWith('image/')) {
        handleFile(file);
      } else {
        showToast('অনুগ্রহ করে একটি ছবি ফাইল আপলোড করুন (JPG, PNG, WebP)');
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

    // Strict Aspect Ratio Preservation
    const ratioString = ImageEnhancerEngine.getAspectRatio(origW, origH);
    metaRatio.textContent = ratioString;
    metaOrigDims.textContent = `${origW} × ${origH} px`;

    // Render Original to "Before" Canvas (Nearest-neighbor scaling to show true pixels when zoomed)
    beforeCanvas.width = origW;
    beforeCanvas.height = origH;
    const beforeCtx = beforeCanvas.getContext('2d');
    beforeCtx.imageSmoothingEnabled = false; // preserve raw pixels so before/after contrast is crystal clear
    beforeCtx.clearRect(0, 0, origW, origH);
    beforeCtx.drawImage(img, 0, 0, origW, origH);

    // Also populate side-by-side canvas
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
    showToast(`ছবি সফলভাবে আপলোড হয়েছে (${origW}×${origH}, রেশিও ${ratioString})`);
  }

  // =========================================================================
  // 2. Real-Time Image Quality Extender Rendering
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

    // Render to After Canvas
    enhancer.renderToCanvas(afterCanvas, params);

    // If Side-by-Side view is active, also update side canvas
    if (viewMode === 'side') {
      enhancer.renderToCanvas(sideAfterCanvas, params);
    }

    // Update metadata info
    const origW = currentImage.naturalWidth || currentImage.width;
    const origH = currentImage.naturalHeight || currentImage.height;
    const enhancedW = Math.round(origW * upscaleFactor);
    const enhancedH = Math.round(origH * upscaleFactor);
    metaTargetDims.textContent = `${enhancedW} × ${enhancedH} px (${upscaleFactor}× HD)`;

    // Update download button label
    downloadBtnSub.textContent = `${exportFormat.toUpperCase()} • ${enhancedW}×${enhancedH} px • ১০০% রেশিও সংরক্ষিত`;
  }

  // =========================================================================
  // 3. Interactive Split Before/After Slider
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

    // Initial split
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
      zoom = Math.max(0.2, Math.min(12, newZoom)); // Support up to 1200% zoom to scrutinize pixels

      if (centerX !== undefined && centerY !== undefined) {
        // Zoom towards mouse position
        const rect = stageContainer.getBoundingClientRect();
        const mouseX = centerX - rect.left - rect.width / 2;
        const mouseY = centerY - rect.top - rect.height / 2;

        panX -= (mouseX - panX) * (zoom / prevZoom - 1);
        panY -= (mouseY - panY) * (zoom / prevZoom - 1);
      }

      applyTransform();
    }

    // Mouse wheel zoom
    stageContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      setZoom(zoom * zoomFactor, e.clientX, e.clientY);
    }, { passive: false });

    // Pan via Mouse Drag
    stageContainer.addEventListener('mousedown', (e) => {
      // Don't pan if clicking the slider handle
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

    // Touch Pinch-to-Zoom & Pan
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

    // Zoom Buttons
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

    // Available space with 40px margin
    const availW = Math.max(200, stageRect.width - 60);
    const availH = Math.max(200, stageRect.height - 60);

    const scaleW = availW / origW;
    const scaleH = availH / origH;
    zoom = Math.min(scaleW, scaleH, 1.0); // Fit completely within view
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

    // Hold to view original (Quick Peek)
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
  // 6. Quality Sliders & Automatic Harmonization
  // =========================================================================
  function setupQualitySliders() {
    // Master Quality Extender Slider (0% Low to 100% Ultra High)
    qualityExtenderSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      qualityPercentBadge.textContent = `${val}%`;

      // Automatically harmonize fine-tuning parameters to eliminate pixels and maximize quality
      const t = val / 100;
      sliderDepixel.value = Math.round(20 + t * 75);      // 20% to 95%
      sliderSharpen.value = Math.round(15 + t * 75);      // 15% to 90%
      sliderClarity.value = Math.round(10 + t * 65);      // 10% to 75%
      sliderDenoise.value = Math.round(20 + t * 65);      // 20% to 85%
      sliderVibrance.value = Math.round(t * 40);          // 0% to 40%

      updateFineTuneValueDisplays();
      requestEnhanceRender();
    });

    // Individual fine-tune sliders
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

    // Toggle Collapsible Fine-Tune Panel
    toggleFineTuneBtn.addEventListener('click', () => {
      const isHidden = fineTunePanel.classList.toggle('hidden');
      chevronIcon.classList.toggle('open', !isHidden);
    });

    // Upscale Factor Radios (1x, 2x, 4x)
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
  // 7. Download & Export System (Preserves Aspect Ratio in Customer's Format)
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
        downloadBtn.querySelector('.btn-title').textContent = 'তৈরি হচ্ছে... (Generating)';

        // High-resolution canvas rendering for export
        const exportCanvas = document.createElement('canvas');
        const params = {
          depixel: parseFloat(sliderDepixel.value),
          sharpen: parseFloat(sliderSharpen.value),
          clarity: parseFloat(sliderClarity.value),
          denoise: parseFloat(sliderDenoise.value),
          vibrance: parseFloat(sliderVibrance.value),
          upscaleFactor: upscaleFactor
        };

        enhancer.renderToCanvas(exportCanvas, params);

        const blob = await enhancer.exportImage(exportCanvas, exportFormat, exportQuality);
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        const w = exportCanvas.width;
        const h = exportCanvas.height;
        link.download = `${currentFileName}-enhanced-${w}x${h}.${exportFormat}`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(url), 4000);
        showToast(`ডাউনলোড সম্পন্ন হয়েছে! (${w}×${h} px, ${exportFormat.toUpperCase()})`);
      } catch (err) {
        console.error('Download error:', err);
        showToast('ডাউনলোডে সমস্যা হয়েছে। পুনরায় চেষ্টা করুন।');
      } finally {
        downloadBtn.disabled = false;
        downloadBtn.querySelector('.btn-title').textContent = 'এনহ্যান্সড ছবি ডাউনলোড করুন';
      }
    });
  }

  // =========================================================================
  // 8. Built-in Sample Generator for Instant 1-Click Testing
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
      // Low-res pixel art sprite (shows severe pixelation that becomes smooth and crisp)
      canvas.width = 160;
      canvas.height = 160;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 160, 160);

      // Draw game character face
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(40, 40, 80, 80);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(56, 56, 16, 20); // eyes
      ctx.fillRect(88, 56, 16, 20);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(60, 92, 40, 12); // mouth
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(40, 20, 80, 20); // cap
    } else if (type === 'portrait') {
      // Blurred artistic portrait shape
      canvas.width = 360;
      canvas.height = 480;
      const grad = ctx.createLinearGradient(0, 0, 360, 480);
      grad.addColorStop(0, '#312e81');
      grad.addColorStop(0.5, '#4c1d95');
      grad.addColorStop(1, '#831843');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 360, 480);

      // Silhouette & glowing eyes
      ctx.fillStyle = '#fbcfe8';
      ctx.beginPath();
      ctx.arc(180, 180, 80, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#be185d';
      ctx.beginPath();
      ctx.arc(150, 170, 14, 0, Math.PI * 2);
      ctx.arc(210, 170, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#9d174d';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(180, 205, 25, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    } else {
      // Landscape (16:9 ratio)
      canvas.width = 640;
      canvas.height = 360;
      // Sky
      const skyGrad = ctx.createLinearGradient(0, 0, 0, 240);
      skyGrad.addColorStop(0, '#0284c7');
      skyGrad.addColorStop(1, '#fed7aa');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, 640, 240);

      // Sun
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(320, 160, 45, 0, Math.PI * 2);
      ctx.fill();

      // Mountains
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(0, 260);
      ctx.lineTo(160, 100);
      ctx.lineTo(340, 260);
      ctx.fill();

      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(220, 260);
      ctx.lineTo(440, 120);
      ctx.lineTo(640, 260);
      ctx.fill();

      // Lake
      ctx.fillStyle = '#0f766e';
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

  // Start app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
