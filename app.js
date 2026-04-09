'use strict';

/* =====================================================
   Canvas dimensions (fixed)
   ===================================================== */
const CANVAS_W = 800;
const CANVAS_H = 600;

/* =====================================================
   Application state
   ===================================================== */
let currentTool = 'brush';
let brushSize   = 10;
let shapeFill   = false;

// Current draw color in RGB
let drawColor = { r: 0, g: 0, b: 0 };

// HSV values for the color picker
let pickerH = 0, pickerS = 1, pickerV = 0;

// Layers: each entry is { canvas, ctx, visible, name, undoStack, redoStack }
let layers    = [];
let activeIdx = 0;      // index of the layer being drawn on

// Brush/eraser stroke state
let isDrawing = false;
let lastX = 0, lastY = 0;

// Shape drag state: set on mousedown, used while dragging
let shapeStart = null;  // { x, y }

// Text tool state
let textActive = false;
let textX = 0, textY = 0;

// Image placement state (null when no image is being placed)
let imgState = null;
/*
  imgState = {
    img        : HTMLImageElement,
    x, y       : position on canvas,
    w, h       : current size,
    dragging   : bool,
    dragOffX, dragOffY,
    resizing   : bool,
    handle     : 'tl' | 'tr' | 'bl' | 'br',
    startX, startY      : mouse pos at resize start,
    startW, startH      : image size at resize start,
    startImgX, startImgY: image pos at resize start
  }
*/

/* =====================================================
   DOM references (filled in DOMContentLoaded)
   ===================================================== */
let previewCanvas, previewCtx;
let containerEl;
let textInputEl;
let svCanvas, svCtx;
let hueCanvas, hueCtx;
let colorBoxEl, colorLabelEl;
let layerListEl;
let imageFileInput;
let brushSizeInput, sizeLabelEl;
let fontFamilySelect, fontSizeSelect;
let shapeFillCheckbox;

/* =====================================================
   Entry point
   ===================================================== */
window.addEventListener('DOMContentLoaded', () => {
  containerEl      = document.getElementById('canvas-container');
  previewCanvas    = document.getElementById('preview-canvas');
  previewCtx       = previewCanvas.getContext('2d');
  textInputEl      = document.getElementById('text-input');
  svCanvas         = document.getElementById('sv-canvas');
  svCtx            = svCanvas.getContext('2d');
  hueCanvas        = document.getElementById('hue-canvas');
  hueCtx           = hueCanvas.getContext('2d');
  colorBoxEl       = document.getElementById('color-box');
  colorLabelEl     = document.getElementById('color-label');
  layerListEl      = document.getElementById('layer-list');
  imageFileInput   = document.getElementById('image-file');
  brushSizeInput   = document.getElementById('brush-size');
  sizeLabelEl      = document.getElementById('size-label');
  fontFamilySelect = document.getElementById('font-family');
  fontSizeSelect   = document.getElementById('font-size');
  shapeFillCheckbox= document.getElementById('shape-fill');

  // Set canvas container and preview canvas to fixed size
  containerEl.style.width  = CANVAS_W + 'px';
  containerEl.style.height = CANVAS_H + 'px';
  previewCanvas.width  = CANVAS_W;
  previewCanvas.height = CANVAS_H;

  // Start with two layers
  addLayer('Layer 1');
  addLayer('Layer 2');
  setActiveLayer(0);

  initColorPicker();
  updateColorUI();
  bindToolButtons();
  bindCanvasEvents();
  bindUIEvents();
  updateCursor();
});

/* =====================================================
   Layer management
   ===================================================== */

// Create a new layer canvas and add it to the stack
function addLayer(name) {
  const canvas = document.createElement('canvas');
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  canvas.style.position = 'absolute';
  canvas.style.top  = '0';
  canvas.style.left = '0';
  canvas.style.pointerEvents = 'none'; // only preview-canvas gets mouse events

  // Insert below the preview canvas
  containerEl.insertBefore(canvas, previewCanvas);

  const layer = {
    canvas,
    ctx: canvas.getContext('2d'),
    visible: true,
    name: name || `Layer ${layers.length + 1}`,
    undoStack: [],
    redoStack: []
  };
  layers.push(layer);
  refreshZIndex();
  renderLayerList();
  return layer;
}

// Assign z-index so layers stack in order (bottom = index 0)
function refreshZIndex() {
  layers.forEach((l, i) => { l.canvas.style.zIndex = i + 1; });
  previewCanvas.style.zIndex = layers.length + 10;
}

function setActiveLayer(idx) {
  activeIdx = Math.max(0, Math.min(idx, layers.length - 1));
  renderLayerList();
}

// Erase all pixels on one layer (with undo snapshot first)
function clearLayer(idx) {
  const layer = layers[idx];
  if (!layer) return;
  snapshotUndo(idx);
  layer.ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
}

// Toggle visible / hidden for a layer
function toggleVisibility(idx) {
  const layer = layers[idx];
  if (!layer) return;
  layer.visible = !layer.visible;
  layer.canvas.style.display = layer.visible ? 'block' : 'none';
  renderLayerList();
}

// Rebuild the layer list UI (top layer shown first)
function renderLayerList() {
  layerListEl.innerHTML = '';
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    const item  = document.createElement('div');
    item.className = 'layer-item' + (i === activeIdx ? ' active-layer' : '');

    // Visibility toggle button
    const visBtn = document.createElement('button');
    visBtn.className = 'layer-vis-btn ' + (layer.visible ? 'vis-on' : 'vis-off');
    visBtn.textContent = layer.visible ? 'ON' : 'OFF';
    visBtn.title = layer.visible ? 'Hide layer' : 'Show layer';
    visBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleVisibility(i); });

    // Layer name
    const nameEl = document.createElement('span');
    nameEl.className = 'layer-name';
    nameEl.textContent = layer.name;

    // Clear layer button
    const clrBtn = document.createElement('button');
    clrBtn.className = 'layer-clr-btn';
    clrBtn.textContent = 'CLR';
    clrBtn.title = 'Clear this layer';
    clrBtn.addEventListener('click', (e) => { e.stopPropagation(); clearLayer(i); });

    item.appendChild(visBtn);
    item.appendChild(nameEl);
    item.appendChild(clrBtn);
    item.addEventListener('click', () => setActiveLayer(i));
    layerListEl.appendChild(item);
  }
}

/* =====================================================
   Undo / Redo (per layer, stores ImageData snapshots)
   ===================================================== */

// Save current state of a layer before modifying it
function snapshotUndo(idx) {
  const layer = layers[idx !== undefined ? idx : activeIdx];
  if (!layer) return;
  const snap = layer.ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  layer.undoStack.push(snap);
  if (layer.undoStack.length > 30) layer.undoStack.shift(); // limit memory
  layer.redoStack = []; // new action clears redo history
}

function undo() {
  const layer = layers[activeIdx];
  if (!layer || layer.undoStack.length === 0) return;
  const current = layer.ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  layer.redoStack.push(current);
  layer.ctx.putImageData(layer.undoStack.pop(), 0, 0);
}

function redo() {
  const layer = layers[activeIdx];
  if (!layer || layer.redoStack.length === 0) return;
  const current = layer.ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  layer.undoStack.push(current);
  layer.ctx.putImageData(layer.redoStack.pop(), 0, 0);
}

/* =====================================================
   Custom HSV color picker
   (no <input type="color"> used anywhere)
   ===================================================== */

function initColorPicker() {
  drawHueBar();
  drawSVSquare();

  // SV square drag
  let downSV = false;
  svCanvas.addEventListener('mousedown', (e) => { downSV = true; pickSV(e); });
  window.addEventListener('mousemove', (e) => { if (downSV) pickSV(e); });
  window.addEventListener('mouseup',   ()  => { downSV = false; });

  // Hue bar drag
  let downHue = false;
  hueCanvas.addEventListener('mousedown', (e) => { downHue = true; pickHue(e); });
  window.addEventListener('mousemove', (e) => { if (downHue) pickHue(e); });
  window.addEventListener('mouseup',   ()  => { downHue = false; });
}

// Draw the rainbow hue strip
function drawHueBar() {
  const w = hueCanvas.width, h = hueCanvas.height;
  const grad = hueCtx.createLinearGradient(0, 0, w, 0);
  ['#ff0000','#ffff00','#00ff00','#00ffff','#0000ff','#ff00ff','#ff0000']
    .forEach((c, i, arr) => grad.addColorStop(i / (arr.length - 1), c));
  hueCtx.fillStyle = grad;
  hueCtx.fillRect(0, 0, w, h);
}

// Draw the saturation-value square for the current hue
function drawSVSquare() {
  const w = svCanvas.width, h = svCanvas.height;
  const { r, g, b } = hsvToRgb(pickerH, 1, 1);

  // Base: solid hue color
  svCtx.fillStyle = `rgb(${r},${g},${b})`;
  svCtx.fillRect(0, 0, w, h);

  // Overlay: white on the left (saturation decreases left to right is wrong,
  // white-to-transparent left-to-right = high S on the right)
  const wGrad = svCtx.createLinearGradient(0, 0, w, 0);
  wGrad.addColorStop(0, 'rgba(255,255,255,1)');
  wGrad.addColorStop(1, 'rgba(255,255,255,0)');
  svCtx.fillStyle = wGrad;
  svCtx.fillRect(0, 0, w, h);

  // Overlay: black at the bottom (value decreases top to bottom)
  const bGrad = svCtx.createLinearGradient(0, 0, 0, h);
  bGrad.addColorStop(0, 'rgba(0,0,0,0)');
  bGrad.addColorStop(1, 'rgba(0,0,0,1)');
  svCtx.fillStyle = bGrad;
  svCtx.fillRect(0, 0, w, h);

  // Draw a small circle at the current selection point
  const cx = pickerS * w;
  const cy = (1 - pickerV) * h;
  svCtx.beginPath();
  svCtx.arc(cx, cy, 6, 0, Math.PI * 2);
  svCtx.strokeStyle = pickerV > 0.5 ? '#000' : '#fff';
  svCtx.lineWidth = 2;
  svCtx.stroke();
}

function pickSV(e) {
  const rect = svCanvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(e.clientX - rect.left,  svCanvas.width));
  const y = Math.max(0, Math.min(e.clientY - rect.top,   svCanvas.height));
  pickerS = x / svCanvas.width;
  pickerV = 1 - y / svCanvas.height;
  drawColor = hsvToRgb(pickerH, pickerS, pickerV);
  drawSVSquare();
  updateColorUI();
}

function pickHue(e) {
  const rect = hueCanvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(e.clientX - rect.left, hueCanvas.width));
  pickerH = (x / hueCanvas.width) * 360;
  drawColor = hsvToRgb(pickerH, pickerS, pickerV);
  drawSVSquare();
  updateColorUI();
}

// Update the color preview circle and RGB label
function updateColorUI() {
  const { r, g, b } = drawColor;
  colorBoxEl.style.backgroundColor = `rgb(${r},${g},${b})`;
  colorLabelEl.textContent = `rgb(${r}, ${g}, ${b})`;
}

// HSV (h:0-360, s:0-1, v:0-1) to RGB (0-255)
function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return { r: Math.round((r+m)*255), g: Math.round((g+m)*255), b: Math.round((b+m)*255) };
}

// RGB (0-255) to HSV — used by eyedropper to sync the picker UI
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
  let h = 0, s = max === 0 ? 0 : d / max, v = max;
  if (d !== 0) {
    if      (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, v };
}

/* =====================================================
   Tool selection
   ===================================================== */

function bindToolButtons() {
  document.querySelectorAll('[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;

      // Image tool: open file picker instead of switching tool
      if (tool === 'image') {
        imageFileInput.click();
        return;
      }

      commitText();        // finalize any open text entry
      if (imgState) stampImage(); // finalize any placed image

      setTool(tool);
    });
  });

  // Load image when file is chosen
  imageFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => startImagePlacement(img);
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    imageFileInput.value = ''; // allow re-uploading same file
  });
}

function setTool(tool) {
  currentTool = tool;
  // Highlight the active button
  document.querySelectorAll('[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
  updateCursor();
}

/* =====================================================
   Cursor changes based on active tool
   ===================================================== */
function updateCursor() {
  const map = {
    brush:      'crosshair',
    eraser:     'cell',
    text:       'text',
    eyedropper: 'crosshair',
    bucket:     'copy',
    rect:       'crosshair',
    circle:     'crosshair',
    triangle:   'crosshair',
    image:      'default'
  };
  previewCanvas.style.cursor = map[currentTool] || 'crosshair';
}

/* =====================================================
   Mouse event routing on the preview canvas
   ===================================================== */

// Convert page mouse position to canvas-local coordinates
function getCanvasPos(e) {
  const rect = previewCanvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function bindCanvasEvents() {
  previewCanvas.addEventListener('mousedown',  onMouseDown);
  previewCanvas.addEventListener('mousemove',  onMouseMove);
  previewCanvas.addEventListener('mouseup',    onMouseUp);
  previewCanvas.addEventListener('mouseleave', onMouseLeave);
}

function onMouseDown(e) {
  const { x, y } = getCanvasPos(e);

  // Handle image placement interactions first
  if (imgState) {
    const handle = hitTestHandle(x, y);
    if (handle) {
      imgState.resizing  = true;
      imgState.handle    = handle;
      imgState.startX    = x; imgState.startY    = y;
      imgState.startW    = imgState.w; imgState.startH    = imgState.h;
      imgState.startImgX = imgState.x; imgState.startImgY = imgState.y;
    } else if (hitTestImage(x, y)) {
      imgState.dragging  = true;
      imgState.dragOffX  = x - imgState.x;
      imgState.dragOffY  = y - imgState.y;
    } else {
      stampImage(); // click outside → stamp to layer
    }
    return;
  }

  switch (currentTool) {
    case 'brush':
    case 'eraser':
      snapshotUndo();
      isDrawing = true;
      lastX = x; lastY = y;
      paintDot(x, y); // draw a dot on click (no drag yet)
      break;

    case 'rect':
    case 'circle':
    case 'triangle':
      snapshotUndo();
      isDrawing  = true;
      shapeStart = { x, y };
      break;

    case 'text':
      if (textActive) commitText(); // commit previous text first
      beginTextInput(x, y);
      break;

    case 'eyedropper':
      sampleColor(x, y);
      break;

    case 'bucket':
      snapshotUndo();
      floodFill(x, y);
      break;
  }
}

function onMouseMove(e) {
  const { x, y } = getCanvasPos(e);

  if (imgState) {
    handleImageMove(x, y);
    return;
  }

  if (!isDrawing) return;

  switch (currentTool) {
    case 'brush':
    case 'eraser':
      paintLine(x, y);
      lastX = x; lastY = y;
      break;

    case 'rect':
    case 'circle':
    case 'triangle':
      previewShape(x, y); // draw temporary shape on the preview canvas
      break;
  }
}

function onMouseUp(e) {
  const { x, y } = getCanvasPos(e);

  if (imgState) {
    imgState.dragging = false;
    imgState.resizing = false;
    return;
  }

  if (!isDrawing) return;
  isDrawing = false;

  if (currentTool === 'rect' || currentTool === 'circle' || currentTool === 'triangle') {
    finalizeShape(x, y); // commit the shape to the active layer
    previewCtx.clearRect(0, 0, CANVAS_W, CANVAS_H); // clear preview
  }
}

function onMouseLeave() {
  // Stop brush strokes that started on the canvas
  if (isDrawing && (currentTool === 'brush' || currentTool === 'eraser')) {
    isDrawing = false;
  }
}

/* =====================================================
   Brush and Eraser drawing
   ===================================================== */

function getActiveCtx() {
  return layers[activeIdx] ? layers[activeIdx].ctx : null;
}

function colorStr() {
  const { r, g, b } = drawColor;
  return `rgb(${r},${g},${b})`;
}

// Draw a single filled circle at the click point
function paintDot(x, y) {
  const ctx = getActiveCtx();
  if (!ctx) return;

  if (currentTool === 'eraser') {
    // Erase using destination-out (NOT white color)
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill();
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = colorStr();
    ctx.fill();
  }
}

// Draw a continuous stroke from the last position to x,y
function paintLine(x, y) {
  const ctx = getActiveCtx();
  if (!ctx) return;

  if (currentTool === 'eraser') {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth   = brushSize;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = colorStr();
    ctx.lineWidth   = brushSize;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();
  }
}

/* =====================================================
   Shape tools (rect, circle, triangle)
   No flickering: preview uses the overlay canvas only.
   ===================================================== */

// Show a temporary shape on the preview canvas while the user drags
function previewShape(x, y) {
  previewCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  renderShape(previewCtx, shapeStart.x, shapeStart.y, x, y);
}

// Commit the final shape to the active layer canvas
function finalizeShape(x, y) {
  const ctx = getActiveCtx();
  if (!ctx) return;
  renderShape(ctx, shapeStart.x, shapeStart.y, x, y);
}

// Draw a shape into the given context (used for both preview and final)
function renderShape(ctx, x0, y0, x1, y1) {
  ctx.save();
  ctx.strokeStyle = colorStr();
  ctx.fillStyle   = colorStr();
  ctx.lineWidth   = brushSize;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  switch (currentTool) {
    case 'rect': {
      const rx = Math.min(x0, x1), ry = Math.min(y0, y1);
      const rw = Math.abs(x1 - x0), rh = Math.abs(y1 - y0);
      if (shapeFill) ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
      break;
    }
    case 'circle': {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (shapeFill) ctx.fill();
      ctx.stroke();
      break;
    }
    case 'triangle': {
      // Isoceles triangle pointing upward, fits inside the drag bounding box
      const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
      const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
      ctx.beginPath();
      ctx.moveTo((minX + maxX) / 2, minY); // top center
      ctx.lineTo(maxX, maxY);              // bottom right
      ctx.lineTo(minX, maxY);              // bottom left
      ctx.closePath();
      if (shapeFill) ctx.fill();
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/* =====================================================
   Flood fill (bucket tool)
   Stack-based BFS with a typed array for visited tracking
   ===================================================== */
function floodFill(startX, startY) {
  const ctx = getActiveCtx();
  if (!ctx) return;

  const px = Math.round(startX), py = Math.round(startY);
  const imageData = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  const data = imageData.data;

  const base = (py * CANVAS_W + px) * 4;
  const tR = data[base], tG = data[base+1], tB = data[base+2], tA = data[base+3];
  const { r: fR, g: fG, b: fB } = drawColor;

  // Skip if target pixel already has the fill color
  if (tR === fR && tG === fG && tB === fB && tA === 255) return;

  const visited = new Uint8Array(CANVAS_W * CANVAS_H);
  const stack   = [py * CANVAS_W + px];

  while (stack.length > 0) {
    const pos = stack.pop();
    if (visited[pos]) continue;

    const cx = pos % CANVAS_W;
    const cy = (pos / CANVAS_W) | 0;
    if (cx < 0 || cx >= CANVAS_W || cy < 0 || cy >= CANVAS_H) continue;

    const i = pos * 4;
    // Only fill pixels that match the original color
    if (data[i]   !== tR || data[i+1] !== tG ||
        data[i+2] !== tB || data[i+3] !== tA) continue;

    visited[pos] = 1;
    data[i] = fR; data[i+1] = fG; data[i+2] = fB; data[i+3] = 255;

    stack.push(pos + 1, pos - 1, pos + CANVAS_W, pos - CANVAS_W);
  }

  ctx.putImageData(imageData, 0, 0);
}

/* =====================================================
   Eyedropper tool (bonus)
   Samples the composite color from all visible layers
   ===================================================== */
function sampleColor(x, y) {
  // Flatten all visible layers into a temp canvas
  const tmp = document.createElement('canvas');
  tmp.width = CANVAS_W; tmp.height = CANVAS_H;
  const tCtx = tmp.getContext('2d');
  tCtx.fillStyle = '#fff';
  tCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  layers.forEach(l => { if (l.visible) tCtx.drawImage(l.canvas, 0, 0); });

  const d = tCtx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  drawColor = { r: d[0], g: d[1], b: d[2] };

  // Sync the HSV picker to the picked color
  const hsv = rgbToHsv(d[0], d[1], d[2]);
  pickerH = hsv.h; pickerS = hsv.s; pickerV = hsv.v;
  drawSVSquare();
  updateColorUI();

  // Switch back to brush after picking
  setTool('brush');
}

/* =====================================================
   Text tool
   ===================================================== */

// Show a transparent input over the canvas at the clicked position
function beginTextInput(x, y) {
  textActive = true;
  textX = x;
  textY = y;

  const family = fontFamilySelect.value;
  const size   = parseInt(fontSizeSelect.value);

  textInputEl.style.left       = x + 'px';
  textInputEl.style.top        = y + 'px';    // top of text (textBaseline: top)
  textInputEl.style.fontFamily = family;
  textInputEl.style.fontSize   = size + 'px';
  textInputEl.style.color      = colorStr();
  textInputEl.style.display    = 'block';
  textInputEl.value = '';
  textInputEl.focus();
}

// Commit typed text onto the active layer
function commitText() {
  if (!textActive) return; // guard against double calls
  textActive = false;

  const text = textInputEl.value.trim();
  textInputEl.style.display = 'none';
  textInputEl.value = '';
  previewCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  if (!text) return;

  const ctx = getActiveCtx();
  if (!ctx) return;

  snapshotUndo();
  const family = fontFamilySelect.value;
  const size   = parseInt(fontSizeSelect.value);
  ctx.font         = `${size}px ${family}`;
  ctx.fillStyle    = colorStr();
  ctx.textBaseline = 'top';
  ctx.fillText(text, textX, textY);
}

/* =====================================================
   Image tool: upload, place with resize handles
   ===================================================== */

const HANDLE_R = 6; // half-width of a resize handle square
const HANDLES  = ['tl', 'tr', 'bl', 'br'];

function startImagePlacement(img) {
  // Scale down to 80% of canvas if the image is too large
  let w = img.naturalWidth, h = img.naturalHeight;
  const maxW = CANVAS_W * 0.8, maxH = CANVAS_H * 0.8;
  if (w > maxW || h > maxH) {
    const s = Math.min(maxW / w, maxH / h);
    w = Math.round(w * s); h = Math.round(h * s);
  }
  imgState = {
    img,
    x: Math.round((CANVAS_W - w) / 2),
    y: Math.round((CANVAS_H - h) / 2),
    w, h,
    dragging: false, resizing: false
  };
  setTool('image');
  drawImagePreview();
}

// Corner handle positions for the current image state
function handlePositions() {
  const { x, y, w, h } = imgState;
  return { tl:{x,y}, tr:{x:x+w,y}, bl:{x,y:y+h}, br:{x:x+w,y:y+h} };
}

// Return which handle was hit, or null
function hitTestHandle(mx, my) {
  const pos = handlePositions();
  for (const key of HANDLES) {
    const { x, y } = pos[key];
    if (mx >= x-HANDLE_R && mx <= x+HANDLE_R &&
        my >= y-HANDLE_R && my <= y+HANDLE_R) return key;
  }
  return null;
}

function hitTestImage(mx, my) {
  if (!imgState) return false;
  const { x, y, w, h } = imgState;
  return mx >= x && mx <= x+w && my >= y && my <= y+h;
}

// Handle mouse move while image is active (drag or resize)
function handleImageMove(mx, my) {
  if (!imgState) return;

  if (imgState.dragging) {
    imgState.x = mx - imgState.dragOffX;
    imgState.y = my - imgState.dragOffY;
    drawImagePreview();
    return;
  }

  if (imgState.resizing) {
    const dx = mx - imgState.startX, dy = my - imgState.startY;
    const { startW, startH, startImgX, startImgY, handle } = imgState;
    let nW = startW, nH = startH, nX = startImgX, nY = startImgY;

    if (handle === 'br') { nW = Math.max(20, startW+dx); nH = Math.max(20, startH+dy); }
    if (handle === 'bl') { nW = Math.max(20, startW-dx); nH = Math.max(20, startH+dy); nX = startImgX+startW-nW; }
    if (handle === 'tr') { nW = Math.max(20, startW+dx); nH = Math.max(20, startH-dy); nY = startImgY+startH-nH; }
    if (handle === 'tl') { nW = Math.max(20, startW-dx); nH = Math.max(20, startH-dy); nX = startImgX+startW-nW; nY = startImgY+startH-nH; }

    imgState.x = nX; imgState.y = nY; imgState.w = nW; imgState.h = nH;
    drawImagePreview();
    return;
  }

  // Update cursor based on hover position
  const h = hitTestHandle(mx, my);
  if (h === 'tl' || h === 'br')         previewCanvas.style.cursor = 'nwse-resize';
  else if (h === 'tr' || h === 'bl')    previewCanvas.style.cursor = 'nesw-resize';
  else if (hitTestImage(mx, my))        previewCanvas.style.cursor = 'move';
  else                                  previewCanvas.style.cursor = 'default';
}

// Draw the image plus dashed border and corner handles on the preview canvas
function drawImagePreview() {
  if (!imgState) return;
  previewCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  const { img, x, y, w, h } = imgState;
  previewCtx.drawImage(img, x, y, w, h);

  // Dashed selection border
  previewCtx.save();
  previewCtx.strokeStyle = '#7c5cbf';
  previewCtx.lineWidth = 2;
  previewCtx.setLineDash([6, 3]);
  previewCtx.strokeRect(x, y, w, h);
  previewCtx.restore();

  // Corner handles
  const pos = handlePositions();
  for (const key of HANDLES) {
    const { x: hx, y: hy } = pos[key];
    previewCtx.fillStyle   = '#7c5cbf';
    previewCtx.strokeStyle = '#fff';
    previewCtx.lineWidth   = 1;
    previewCtx.fillRect  (hx-HANDLE_R, hy-HANDLE_R, HANDLE_R*2, HANDLE_R*2);
    previewCtx.strokeRect(hx-HANDLE_R, hy-HANDLE_R, HANDLE_R*2, HANDLE_R*2);
  }
}

// Commit the image onto the active layer and exit image mode
function stampImage() {
  if (!imgState) return;
  const ctx = getActiveCtx();
  if (ctx) {
    snapshotUndo();
    ctx.drawImage(imgState.img, imgState.x, imgState.y, imgState.w, imgState.h);
  }
  imgState = null;
  previewCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  updateCursor();
}

/* =====================================================
   Download: composite all visible layers with white bg
   ===================================================== */
function downloadCanvas() {
  if (imgState) stampImage(); // stamp any pending image first

  const tmp = document.createElement('canvas');
  tmp.width = CANVAS_W; tmp.height = CANVAS_H;
  const ctx = tmp.getContext('2d');

  // White background (ensures no transparency in the file)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Composite all visible layers bottom-to-top
  layers.forEach(l => { if (l.visible) ctx.drawImage(l.canvas, 0, 0); });

  const link = document.createElement('a');
  link.download = 'canvas.png';
  link.href = tmp.toDataURL('image/png');
  link.click();
}

/* =====================================================
   UI event bindings (sliders, buttons, keyboard)
   ===================================================== */
function bindUIEvents() {
  // Brush size slider
  brushSizeInput.addEventListener('input', () => {
    brushSize = parseInt(brushSizeInput.value);
    sizeLabelEl.textContent = brushSize + ' px';
  });

  // Shape fill toggle
  shapeFillCheckbox.addEventListener('change', () => {
    shapeFill = shapeFillCheckbox.checked;
  });

  // Text input: live preview while typing
  textInputEl.addEventListener('input', () => {
    previewCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    const text = textInputEl.value;
    if (!text) return;
    const family = fontFamilySelect.value;
    const size   = parseInt(fontSizeSelect.value);
    previewCtx.font         = `${size}px ${family}`;
    previewCtx.fillStyle    = colorStr();
    previewCtx.textBaseline = 'top';
    previewCtx.fillText(text, textX, textY);
  });

  // Commit on Enter, cancel on Escape
  textInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  commitText();
    if (e.key === 'Escape') {
      textActive = false;
      textInputEl.style.display = 'none';
      previewCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    }
  });

  // Commit when input loses focus (e.g. user clicks elsewhere)
  textInputEl.addEventListener('blur', commitText);

  // Action buttons
  document.getElementById('undo-btn').addEventListener('click', undo);
  document.getElementById('redo-btn').addEventListener('click', redo);
  document.getElementById('download-btn').addEventListener('click', downloadCanvas);

  // Refresh: clear every layer
  document.getElementById('refresh-btn').addEventListener('click', () => {
    if (!confirm('Clear all layers and start over?')) return;
    layers.forEach((_, i) => clearLayer(i));
  });

  // Add a new layer
  document.getElementById('add-layer-btn').addEventListener('click', () => {
    addLayer(`Layer ${layers.length + 1}`);
    setActiveLayer(layers.length - 1);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (document.activeElement === textInputEl) return; // ignore while typing
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    if (e.key === 'Escape' && imgState) stampImage();
  });
}
