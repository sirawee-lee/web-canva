'use strict';

/* =====================================================
   Canvas logical resolution (can change via resizer)
   ===================================================== */
let CANVAS_W = 800;
let CANVAS_H = 600;

/* =====================================================
   App state
   ===================================================== */
let currentTool = 'brush';
let brushSize   = 10;
let shapeFill   = false;
let canvasBg    = '#ffffff';

let drawColor = { r: 0, g: 0, b: 0 };
let pickerH = 0, pickerS = 1, pickerV = 0;

let layers    = [];
let activeIdx = 0;

let recentColors = [];

let isDrawing = false;
let lastX = 0, lastY = 0;
let shapeStart = null;

// Text objects – stored on textCanvas so they can be moved/edited
let textObjects    = [];
let selectedTextId = null;
let editingTextId  = null;
let textDragging   = false;
let textDragOffX   = 0, textDragOffY = 0;
let textCanvas, textCtx;
let nextTextId = 1;

// Image placement
let imgState = null;

/* =====================================================
   DOM refs
   ===================================================== */
let previewCanvas, previewCtx, containerEl, textInputEl;
let svCanvas, svCtx, hueCanvas, hueCtx;
let colorBoxEl, colorLabelEl, layerListEl, imageFileInput;
let brushSizeInput, sizeLabelEl, fontFamilySelect, fontSizeSelect, shapeFillCheckbox;
let svMob, svMobCtx, hueMob, hueMobCtx, colorBoxMob, colorLabelMob;

/* =====================================================
   SVG cursor data-URIs
   ===================================================== */
function makeCursor(svgBody, w, h, hx, hy) {
  const enc = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${svgBody}</svg>`);
  return `url("data:image/svg+xml,${enc}") ${hx} ${hy}, auto`;
}

const CURSOR_BRUSH = makeCursor(
  `<g transform="rotate(-45,12,12)">
    <rect x="9" y="2" width="6" height="14" rx="2" fill="#555"/>
    <polygon points="9,16 15,16 12,22" fill="#ffd700"/>
    <rect x="9" y="2" width="6" height="3" rx="1" fill="#888"/>
  </g>`, 24, 24, 2, 22);

const CURSOR_ERASER = makeCursor(
  `<rect x="2" y="8" width="20" height="12" rx="3" fill="#ff6b6b" stroke="#c0392b" stroke-width="1.5"/>
   <line x1="12" y1="8" x2="12" y2="20" stroke="#c0392b" stroke-width="1"/>
   <rect x="2" y="16" width="10" height="4" rx="1" fill="#fff" opacity="0.4"/>`, 24, 24, 22, 14);

const CURSOR_EYEDROPPER = makeCursor(
  `<path d="M19 3a1 1 0 011 1 1 1 0 01-.3.7L13 11.4l1 1L12.7 13.7l-1-1L5 19.4A1.5 1.5 0 013 18l6.7-6.7-1-1L10 9l1 1 6.7-6.7A1 1 0 0119 3z" fill="#4a90e2"/>
   <circle cx="4" cy="21" r="2" fill="#4a90e2" stroke="#2563eb" stroke-width="1"/>`, 24, 24, 4, 20);

/* =====================================================
   Init
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
  svMob        = document.getElementById('sv-canvas-mob');
  svMobCtx     = svMob ? svMob.getContext('2d') : null;
  hueMob       = document.getElementById('hue-canvas-mob');
  hueMobCtx    = hueMob ? hueMob.getContext('2d') : null;
  colorBoxMob  = document.getElementById('color-box-mob');
  colorLabelMob= document.getElementById('color-label-mob');

  previewCanvas.width  = CANVAS_W;
  previewCanvas.height = CANVAS_H;
  setContainerAspect();

  // Text canvas sits between layers and preview
  textCanvas = document.createElement('canvas');
  textCanvas.width = CANVAS_W; textCanvas.height = CANVAS_H;
  Object.assign(textCanvas.style, {position:'absolute',top:'0',left:'0',width:'100%',height:'100%',pointerEvents:'none'});
  containerEl.insertBefore(textCanvas, previewCanvas);
  textCtx = textCanvas.getContext('2d');

  addLayer('Layer 1');
  addLayer('Layer 2');
  setActiveLayer(0);

  initColorPicker();
  updateColorUI();
  bindToolButtons();
  bindCanvasEvents();
  bindUIEvents();
  bindMobileUI();
  updateCursor();

  window.addEventListener('resize', setContainerAspect);
});

function setContainerAspect() {
  containerEl.style.aspectRatio = `${CANVAS_W} / ${CANVAS_H}`;
}

/* =====================================================
   Coordinate mapping (CSS → canvas logical px)
   ===================================================== */
function getCanvasPos(e) {
  const rect = previewCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width  * CANVAS_W,
    y: (e.clientY - rect.top)  / rect.height * CANVAS_H
  };
}

/* =====================================================
   Layer management
   ===================================================== */
function addLayer(name) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W; canvas.height = CANVAS_H;
  Object.assign(canvas.style, {position:'absolute',top:'0',left:'0',width:'100%',height:'100%',pointerEvents:'none'});
  containerEl.insertBefore(canvas, textCanvas);
  const layer = { canvas, ctx: canvas.getContext('2d'), visible:true, name: name||`Layer ${layers.length+1}`, undoStack:[], redoStack:[] };
  layers.push(layer);
  refreshZIndex();
  renderLayerList();
  return layer;
}

function refreshZIndex() {
  layers.forEach((l,i) => { l.canvas.style.zIndex = i+1; });
  textCanvas.style.zIndex    = layers.length + 5;
  previewCanvas.style.zIndex = layers.length + 10;
}

function setActiveLayer(idx) {
  activeIdx = Math.max(0, Math.min(idx, layers.length-1));
  renderLayerList();
}

function clearLayer(idx) {
  const l = layers[idx]; if (!l) return;
  snapshotUndo(idx);
  l.ctx.clearRect(0,0,CANVAS_W,CANVAS_H);
}

function toggleVisibility(idx) {
  const l = layers[idx]; if (!l) return;
  l.visible = !l.visible;
  l.canvas.style.display = l.visible ? 'block' : 'none';
  renderLayerList();
}

function renderLayerList() {
  layerListEl.innerHTML = '';
  for (let i = layers.length-1; i >= 0; i--) {
    const l = layers[i];
    const item = document.createElement('div');
    item.className = 'layer-item' + (i===activeIdx ? ' active-layer' : '');
    const visBtn = document.createElement('button');
    visBtn.className = 'layer-vis-btn ' + (l.visible ? 'vis-on':'vis-off');
    visBtn.textContent = l.visible ? 'ON' : 'OFF';
    visBtn.addEventListener('click', e => { e.stopPropagation(); toggleVisibility(i); });
    const nameEl = document.createElement('span');
    nameEl.className = 'layer-name'; nameEl.textContent = l.name;
    const clrBtn = document.createElement('button');
    clrBtn.className = 'layer-clr-btn'; clrBtn.textContent = 'CLR';
    clrBtn.addEventListener('click', e => { e.stopPropagation(); clearLayer(i); });
    item.appendChild(visBtn); item.appendChild(nameEl); item.appendChild(clrBtn);
    item.addEventListener('click', () => setActiveLayer(i));
    layerListEl.appendChild(item);
  }
}

/* =====================================================
   Undo / Redo
   ===================================================== */
function snapshotUndo(idx) {
  const l = layers[idx!==undefined ? idx : activeIdx]; if (!l) return;
  l.undoStack.push(l.ctx.getImageData(0,0,CANVAS_W,CANVAS_H));
  if (l.undoStack.length > 30) l.undoStack.shift();
  l.redoStack = [];
}
function undo() {
  const l = layers[activeIdx]; if (!l||!l.undoStack.length) return;
  l.redoStack.push(l.ctx.getImageData(0,0,CANVAS_W,CANVAS_H));
  l.ctx.putImageData(l.undoStack.pop(),0,0);
}
function redo() {
  const l = layers[activeIdx]; if (!l||!l.redoStack.length) return;
  l.undoStack.push(l.ctx.getImageData(0,0,CANVAS_W,CANVAS_H));
  l.ctx.putImageData(l.redoStack.pop(),0,0);
}

/* =====================================================
   Recent colors (last 5)
   ===================================================== */
function addRecentColor() {
  const {r,g,b} = drawColor, key=`${r},${g},${b}`;
  recentColors = recentColors.filter(c=>`${c.r},${c.g},${c.b}`!==key);
  recentColors.unshift({r,g,b});
  if (recentColors.length>5) recentColors.pop();
  renderRecentSwatches();
}

function renderRecentSwatches() {
  ['recent-swatches','recent-swatches-mob'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.innerHTML = '';
    recentColors.forEach(c => {
      const s = document.createElement('div');
      s.className = 'color-swatch';
      s.style.background = `rgb(${c.r},${c.g},${c.b})`;
      s.title = `rgb(${c.r}, ${c.g}, ${c.b})`;
      s.addEventListener('click', () => {
        drawColor = {...c};
        const hsv = rgbToHsv(c.r,c.g,c.b);
        pickerH=hsv.h; pickerS=hsv.s; pickerV=hsv.v;
        drawSVSquare(); drawSVSquareMob(); updateColorUI();
      });
      el.appendChild(s);
    });
  });
}

/* =====================================================
   HSV color picker
   ===================================================== */
function initColorPicker() {
  drawHueBar(hueCtx, hueCanvas.width, hueCanvas.height);
  drawSVSquare();
  if (svMobCtx) { drawHueBar(hueMobCtx, hueMob.width, hueMob.height); drawSVSquareMob(); }

  let dSV=false,dHue=false,dSVM=false,dHueM=false;

  svCanvas.addEventListener('mousedown',  e=>{dSV=true;pickSV(e,svCanvas);});
  hueCanvas.addEventListener('mousedown', e=>{dHue=true;pickHue(e,hueCanvas);});

  if (svMob) {
    svMob.addEventListener('mousedown',  e=>{dSVM=true;pickSV(e,svMob,true);});
    svMob.addEventListener('touchstart', e=>{dSVM=true;pickSV(e.touches[0],svMob,true);},{passive:true});
    hueMob.addEventListener('mousedown', e=>{dHueM=true;pickHue(e,hueMob,true);});
    hueMob.addEventListener('touchstart',e=>{dHueM=true;pickHue(e.touches[0],hueMob,true);},{passive:true});
    window.addEventListener('touchmove', e=>{
      if(dSVM)pickSV(e.touches[0],svMob,true);
      if(dHueM)pickHue(e.touches[0],hueMob,true);
    },{passive:true});
    window.addEventListener('touchend', ()=>{dSVM=false;dHueM=false;});
  }

  window.addEventListener('mousemove', e=>{
    if(dSV)  pickSV(e,svCanvas);
    if(dHue) pickHue(e,hueCanvas);
    if(dSVM) pickSV(e,svMob,true);
    if(dHueM)pickHue(e,hueMob,true);
  });
  window.addEventListener('mouseup', ()=>{dSV=dHue=dSVM=dHueM=false;});
}

function drawHueBar(ctx, w, h) {
  const g=ctx.createLinearGradient(0,0,w,0);
  ['#ff0000','#ffff00','#00ff00','#00ffff','#0000ff','#ff00ff','#ff0000']
    .forEach((c,i,a)=>g.addColorStop(i/(a.length-1),c));
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
}

function _drawSV(ctx, w, h) {
  const {r,g,b}=hsvToRgb(pickerH,1,1);
  ctx.fillStyle=`rgb(${r},${g},${b})`; ctx.fillRect(0,0,w,h);
  const wg=ctx.createLinearGradient(0,0,w,0);
  wg.addColorStop(0,'rgba(255,255,255,1)'); wg.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=wg; ctx.fillRect(0,0,w,h);
  const bg=ctx.createLinearGradient(0,0,0,h);
  bg.addColorStop(0,'rgba(0,0,0,0)'); bg.addColorStop(1,'rgba(0,0,0,1)');
  ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);
  const cx=pickerS*w, cy=(1-pickerV)*h;
  ctx.beginPath(); ctx.arc(cx,cy,6,0,Math.PI*2);
  ctx.strokeStyle=pickerV>0.5?'#000':'#fff'; ctx.lineWidth=2; ctx.stroke();
}
function drawSVSquare()    { _drawSV(svCtx,    svCanvas.width,  svCanvas.height);  }
function drawSVSquareMob() { if(svMobCtx) _drawSV(svMobCtx, svMob.width, svMob.height); }

function pickSV(e, canvas) {
  const rect=canvas.getBoundingClientRect();
  pickerS=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  pickerV=Math.max(0,Math.min(1,1-(e.clientY-rect.top)/rect.height));
  drawColor=hsvToRgb(pickerH,pickerS,pickerV);
  drawSVSquare(); drawSVSquareMob(); updateColorUI(); applyColorToSelectedText();
}
function pickHue(e, canvas) {
  const rect=canvas.getBoundingClientRect();
  pickerH=Math.max(0,Math.min(360,(e.clientX-rect.left)/rect.width*360));
  drawColor=hsvToRgb(pickerH,pickerS,pickerV);
  drawSVSquare(); drawSVSquareMob(); updateColorUI(); applyColorToSelectedText();
}

function updateColorUI() {
  const {r,g,b}=drawColor, css=`rgb(${r},${g},${b})`;
  if(colorBoxEl)  colorBoxEl.style.background  = css;
  if(colorLabelEl)colorLabelEl.textContent      = css;
  if(colorBoxMob) colorBoxMob.style.background  = css;
  if(colorLabelMob)colorLabelMob.textContent    = css;
  const ms = document.getElementById('mob-color-swatch');
  if(ms) ms.style.background = css;
}

function hsvToRgb(h,s,v) {
  h=((h%360)+360)%360;
  const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;
  let r=0,g=0,b=0;
  if(h<60){r=c;g=x;}else if(h<120){r=x;g=c;}
  else if(h<180){g=c;b=x;}else if(h<240){g=x;b=c;}
  else if(h<300){r=x;b=c;}else{r=c;b=x;}
  return{r:Math.round((r+m)*255),g:Math.round((g+m)*255),b:Math.round((b+m)*255)};
}
function rgbToHsv(r,g,b) {
  r/=255;g/=255;b/=255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=0,s=max?d/max:0,v=max;
  if(d){if(max===r)h=((g-b)/d+6)%6;else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;}
  return{h,s,v};
}

/* =====================================================
   Tool selection
   ===================================================== */
function bindToolButtons() {
  document.querySelectorAll('[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      if (tool==='image') { imageFileInput.click(); return; }
      if (currentTool==='text' && tool!=='text') deactivateTextMode();
      if (imgState) stampImage();
      setTool(tool);
    });
  });

  imageFileInput.addEventListener('change', e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{const img=new Image();img.onload=()=>startImagePlacement(img);img.src=ev.target.result;};
    reader.readAsDataURL(file);
    imageFileInput.value='';
  });
}

function setTool(tool) {
  currentTool=tool;
  document.querySelectorAll('[data-tool]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.tool===tool);});
  updateCursor();
}

function updateCursor() {
  const map={brush:CURSOR_BRUSH,eraser:CURSOR_ERASER,eyedropper:CURSOR_EYEDROPPER,
             text:'text',bucket:'copy',spray:'crosshair',rect:'crosshair',circle:'crosshair',triangle:'crosshair',image:'default'};
  previewCanvas.style.cursor = map[currentTool]||'crosshair';
}

/* =====================================================
   Canvas mouse / touch events
   ===================================================== */
function bindCanvasEvents() {
  previewCanvas.addEventListener('mousedown',  onMouseDown);
  previewCanvas.addEventListener('mousemove',  onMouseMove);
  previewCanvas.addEventListener('mouseup',    onMouseUp);
  previewCanvas.addEventListener('mouseleave', onMouseLeave);
  previewCanvas.addEventListener('dblclick',   onDblClick);
  previewCanvas.addEventListener('touchstart', e=>{e.preventDefault();onMouseDown(e.touches[0]);},{passive:false});
  previewCanvas.addEventListener('touchmove',  e=>{e.preventDefault();onMouseMove(e.touches[0]);},{passive:false});
  previewCanvas.addEventListener('touchend',   e=>{e.preventDefault();onMouseUp(e.changedTouches[0]);},{passive:false});
}

function onMouseDown(e) {
  const {x,y}=getCanvasPos(e);

  // Image placement
  if (imgState) {
    const handle=hitTestHandle(x,y);
    if(handle){
      imgState.resizing=true;imgState.handle=handle;
      imgState.startX=x;imgState.startY=y;
      imgState.startW=imgState.w;imgState.startH=imgState.h;
      imgState.startImgX=imgState.x;imgState.startImgY=imgState.y;
    }else if(hitTestImage(x,y)){
      imgState.dragging=true;imgState.dragOffX=x-imgState.x;imgState.dragOffY=y-imgState.y;
    }else{stampImage();}
    return;
  }

  // Text tool
  if (currentTool==='text') {
    const hitIdx=hitTestText(x,y);
    if(hitIdx>=0){
      selectText(textObjects[hitIdx].id);
      textDragging=true;textDragOffX=x-textObjects[hitIdx].x;textDragOffY=y-textObjects[hitIdx].y;
    }else{
      deselectAllText();
      createTextObject(x,y);
    }
    return;
  }

  // Drawing tools
  switch(currentTool){
    case 'brush':case 'eraser':case 'spray':
      addRecentColor();snapshotUndo();
      isDrawing=true;lastX=x;lastY=y;
      if(currentTool==='spray')sprayPaint(x,y);else paintDot(x,y);
      break;
    case 'rect':case 'circle':case 'triangle':
      addRecentColor();snapshotUndo();isDrawing=true;shapeStart={x,y};
      break;
    case 'eyedropper': sampleColor(x,y); break;
    case 'bucket': addRecentColor();snapshotUndo();floodFill(x,y); break;
  }
}

function onMouseMove(e) {
  const {x,y}=getCanvasPos(e);
  if(imgState){handleImageMove(x,y);return;}
  if(currentTool==='text'&&textDragging&&selectedTextId!==null){
    const obj=textObjects.find(o=>o.id===selectedTextId);
    if(obj){obj.x=x-textDragOffX;obj.y=y-textDragOffY;renderTextObjects();}
    return;
  }
  if(!isDrawing)return;
  switch(currentTool){
    case 'brush':case 'eraser':paintLine(x,y);lastX=x;lastY=y;break;
    case 'spray':sprayPaint(x,y);lastX=x;lastY=y;break;
    case 'rect':case 'circle':case 'triangle':previewShape(x,y);break;
  }
}

function onMouseUp(e) {
  const {x,y}=getCanvasPos(e);
  if(imgState){imgState.dragging=false;imgState.resizing=false;return;}
  if(currentTool==='text'){textDragging=false;return;}
  if(!isDrawing)return;
  isDrawing=false;
  if(['rect','circle','triangle'].includes(currentTool)){
    finalizeShape(x,y);
    previewCtx.clearRect(0,0,CANVAS_W,CANVAS_H);
  }
}

function onMouseLeave() {
  if(isDrawing&&['brush','eraser','spray'].includes(currentTool))isDrawing=false;
  if(currentTool==='text')textDragging=false;
}

function onDblClick(e) {
  if(currentTool!=='text')return;
  const {x,y}=getCanvasPos(e);
  const hitIdx=hitTestText(x,y);
  if(hitIdx>=0)enterTextEditMode(textObjects[hitIdx]);
}

/* =====================================================
   Drawing
   ===================================================== */
function getActiveCtx(){return layers[activeIdx]?.ctx||null;}
function colorStr(){return `rgb(${drawColor.r},${drawColor.g},${drawColor.b})`;}

function paintDot(x,y){
  const ctx=getActiveCtx();if(!ctx)return;
  if(currentTool==='eraser'){
    ctx.save();ctx.globalCompositeOperation='destination-out';
    ctx.beginPath();ctx.arc(x,y,brushSize/2,0,Math.PI*2);
    ctx.fillStyle='rgba(0,0,0,1)';ctx.fill();ctx.restore();
  }else{
    ctx.beginPath();ctx.arc(x,y,brushSize/2,0,Math.PI*2);
    ctx.fillStyle=colorStr();ctx.fill();
  }
}

function paintLine(x,y){
  const ctx=getActiveCtx();if(!ctx)return;
  if(currentTool==='eraser'){
    ctx.save();ctx.globalCompositeOperation='destination-out';
    ctx.beginPath();ctx.moveTo(lastX,lastY);ctx.lineTo(x,y);
    ctx.strokeStyle='rgba(0,0,0,1)';ctx.lineWidth=brushSize;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.stroke();ctx.restore();
  }else{
    ctx.beginPath();ctx.moveTo(lastX,lastY);ctx.lineTo(x,y);
    ctx.strokeStyle=colorStr();ctx.lineWidth=brushSize;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
  }
}

// Spray paint: scatter random dots inside a circle (bonus feature)
function sprayPaint(x,y){
  const ctx=getActiveCtx();if(!ctx)return;
  const radius=brushSize*1.5, density=Math.max(10,brushSize*3);
  const {r,g,b}=drawColor;
  for(let i=0;i<density;i++){
    const angle=Math.random()*Math.PI*2, dist=Math.random()*radius;
    ctx.fillStyle=`rgba(${r},${g},${b},${0.6+Math.random()*0.4})`;
    ctx.beginPath();ctx.arc(x+Math.cos(angle)*dist,y+Math.sin(angle)*dist,1,0,Math.PI*2);ctx.fill();
  }
}

/* =====================================================
   Shapes
   ===================================================== */
function previewShape(x,y){previewCtx.clearRect(0,0,CANVAS_W,CANVAS_H);renderShape(previewCtx,shapeStart.x,shapeStart.y,x,y);}
function finalizeShape(x,y){const ctx=getActiveCtx();if(!ctx)return;renderShape(ctx,shapeStart.x,shapeStart.y,x,y);}

function renderShape(ctx,x0,y0,x1,y1){
  ctx.save();ctx.strokeStyle=colorStr();ctx.fillStyle=colorStr();
  ctx.lineWidth=brushSize;ctx.lineCap='round';ctx.lineJoin='round';
  switch(currentTool){
    case 'rect':{
      const rx=Math.min(x0,x1),ry=Math.min(y0,y1),rw=Math.abs(x1-x0),rh=Math.abs(y1-y0);
      if(shapeFill)ctx.fillRect(rx,ry,rw,rh);ctx.strokeRect(rx,ry,rw,rh);break;
    }
    case 'circle':{
      ctx.beginPath();ctx.ellipse((x0+x1)/2,(y0+y1)/2,Math.abs(x1-x0)/2,Math.abs(y1-y0)/2,0,0,Math.PI*2);
      if(shapeFill)ctx.fill();ctx.stroke();break;
    }
    case 'triangle':{
      const mnX=Math.min(x0,x1),mxX=Math.max(x0,x1),mnY=Math.min(y0,y1),mxY=Math.max(y0,y1);
      ctx.beginPath();ctx.moveTo((mnX+mxX)/2,mnY);ctx.lineTo(mxX,mxY);ctx.lineTo(mnX,mxY);ctx.closePath();
      if(shapeFill)ctx.fill();ctx.stroke();break;
    }
  }
  ctx.restore();
}

/* =====================================================
   Flood fill (BFS)
   ===================================================== */
function floodFill(startX,startY){
  const ctx=getActiveCtx();if(!ctx)return;
  const px=Math.round(startX),py=Math.round(startY);
  if(px<0||px>=CANVAS_W||py<0||py>=CANVAS_H)return;
  const imgData=ctx.getImageData(0,0,CANVAS_W,CANVAS_H),data=imgData.data;
  const base=(py*CANVAS_W+px)*4;
  const tR=data[base],tG=data[base+1],tB=data[base+2],tA=data[base+3];
  const {r:fR,g:fG,b:fB}=drawColor;
  if(tR===fR&&tG===fG&&tB===fB&&tA===255)return;
  const visited=new Uint8Array(CANVAS_W*CANVAS_H),stack=[py*CANVAS_W+px];
  while(stack.length){
    const pos=stack.pop();if(visited[pos])continue;
    const cx=pos%CANVAS_W,cy=(pos/CANVAS_W)|0;
    if(cx<0||cx>=CANVAS_W||cy<0||cy>=CANVAS_H)continue;
    const i=pos*4;
    if(data[i]!==tR||data[i+1]!==tG||data[i+2]!==tB||data[i+3]!==tA)continue;
    visited[pos]=1;data[i]=fR;data[i+1]=fG;data[i+2]=fB;data[i+3]=255;
    stack.push(pos+1,pos-1,pos+CANVAS_W,pos-CANVAS_W);
  }
  ctx.putImageData(imgData,0,0);
}

/* =====================================================
   Eyedropper (bonus)
   ===================================================== */
function sampleColor(x,y){
  const tmp=document.createElement('canvas');tmp.width=CANVAS_W;tmp.height=CANVAS_H;
  const tCtx=tmp.getContext('2d');tCtx.fillStyle='#fff';tCtx.fillRect(0,0,CANVAS_W,CANVAS_H);
  layers.forEach(l=>{if(l.visible)tCtx.drawImage(l.canvas,0,0);});
  const d=tCtx.getImageData(Math.round(x),Math.round(y),1,1).data;
  drawColor={r:d[0],g:d[1],b:d[2]};
  const hsv=rgbToHsv(d[0],d[1],d[2]);pickerH=hsv.h;pickerS=hsv.s;pickerV=hsv.v;
  drawSVSquare();drawSVSquareMob();updateColorUI();
  setTool('brush');
}

/* =====================================================
   Text objects system
   ===================================================== */
function createTextObject(x,y){
  const family=fontFamilySelect.value, size=parseInt(fontSizeSelect.value);
  const obj={id:nextTextId++,text:'',x,y,family,size,color:colorStr(),w:0,h:size,selected:true,editing:true};
  textObjects.push(obj);selectedTextId=obj.id;editingTextId=obj.id;
  renderTextObjects();enterTextEditMode(obj);
}

function hitTestText(x,y){
  for(let i=textObjects.length-1;i>=0;i--){
    const o=textObjects[i];
    if(x>=o.x-4&&x<=o.x+Math.max(o.w,20)+4&&y>=o.y-4&&y<=o.y+o.h+4)return i;
  }
  return -1;
}

function selectText(id){
  textObjects.forEach(o=>{o.selected=(o.id===id);});
  selectedTextId=id;renderTextObjects();
}

function deselectAllText(){
  textObjects.forEach(o=>{o.selected=false;});selectedTextId=null;
}

function enterTextEditMode(obj){
  editingTextId=obj.id;obj.editing=true;selectText(obj.id);
  const cRect=containerEl.getBoundingClientRect();
  const scaleX=cRect.width/CANVAS_W;
  textInputEl.style.left       = (obj.x*scaleX)+'px';
  textInputEl.style.top        = (obj.y*scaleX)+'px';
  textInputEl.style.fontFamily = obj.family;
  textInputEl.style.fontSize   = (obj.size*scaleX)+'px';
  textInputEl.style.minWidth   = Math.max(80,(obj.w+20)*scaleX)+'px';
  textInputEl.style.display    = 'block';
  textInputEl.value            = obj.text;
  textInputEl.focus();
  if(obj.text)textInputEl.select();
}

function commitTextObject(){
  if(editingTextId===null)return;
  const obj=textObjects.find(o=>o.id===editingTextId);
  editingTextId=null;
  textInputEl.style.display='none';
  if(!obj)return;
  obj.editing=false;
  obj.text=textInputEl.value;
  textCtx.font=`${obj.size}px ${obj.family}`;
  obj.w=textCtx.measureText(obj.text||' ').width;
  if(!obj.text.trim()){
    textObjects=textObjects.filter(o=>o.id!==obj.id);
    if(selectedTextId===obj.id)selectedTextId=null;
  }
  renderTextObjects();
}

function deactivateTextMode(){
  commitTextObject();deselectAllText();
  textInputEl.style.display='none';renderTextObjects();
}

function applyColorToSelectedText(){
  if(selectedTextId===null)return;
  const obj=textObjects.find(o=>o.id===selectedTextId);
  if(obj){obj.color=colorStr();renderTextObjects();}
}

function renderTextObjects(){
  textCtx.clearRect(0,0,CANVAS_W,CANVAS_H);
  textObjects.forEach(obj=>{
    textCtx.font=`${obj.size}px ${obj.family}`;
    textCtx.fillStyle=obj.color;textCtx.textBaseline='top';
    const display = (obj.id===editingTextId) ? (textInputEl.value||'') : (obj.text||'');
    textCtx.fillText(display,obj.x,obj.y);
    if(obj.selected){
      const w=textCtx.measureText(display||' ').width;
      textCtx.save();textCtx.strokeStyle='#a855f7';textCtx.lineWidth=1.5;
      textCtx.setLineDash([5,3]);textCtx.strokeRect(obj.x-3,obj.y-3,w+6,obj.h+6);textCtx.restore();
    }
  });
}

// Flatten all text objects onto the active layer canvas
function rasterizeText(){
  commitTextObject();
  if(!textObjects.length)return;
  const ctx=getActiveCtx();if(!ctx)return;
  snapshotUndo();
  textObjects.forEach(obj=>{
    ctx.font=`${obj.size}px ${obj.family}`;ctx.fillStyle=obj.color;ctx.textBaseline='top';
    ctx.fillText(obj.text||'',obj.x,obj.y);
  });
  textObjects=[];selectedTextId=null;textCtx.clearRect(0,0,CANVAS_W,CANVAS_H);
}

/* =====================================================
   Image tool
   ===================================================== */
const HANDLE_R=6, HANDLES=['tl','tr','bl','br'];

function startImagePlacement(img){
  let w=img.naturalWidth,h=img.naturalHeight;
  const maxW=CANVAS_W*0.8,maxH=CANVAS_H*0.8;
  if(w>maxW||h>maxH){const s=Math.min(maxW/w,maxH/h);w=Math.round(w*s);h=Math.round(h*s);}
  imgState={img,x:Math.round((CANVAS_W-w)/2),y:Math.round((CANVAS_H-h)/2),w,h,dragging:false,resizing:false};
  setTool('image');drawImagePreview();
}

function handlePositions(){const{x,y,w,h}=imgState;return{tl:{x,y},tr:{x:x+w,y},bl:{x,y:y+h},br:{x:x+w,y:y+h}};}

function hitTestHandle(mx,my){
  const pos=handlePositions();
  for(const k of HANDLES){const{x,y}=pos[k];if(mx>=x-HANDLE_R&&mx<=x+HANDLE_R&&my>=y-HANDLE_R&&my<=y+HANDLE_R)return k;}
  return null;
}

function hitTestImage(mx,my){
  if(!imgState)return false;return mx>=imgState.x&&mx<=imgState.x+imgState.w&&my>=imgState.y&&my<=imgState.y+imgState.h;
}

function handleImageMove(mx,my){
  if(!imgState)return;
  if(imgState.dragging){imgState.x=mx-imgState.dragOffX;imgState.y=my-imgState.dragOffY;drawImagePreview();return;}
  if(imgState.resizing){
    const dx=mx-imgState.startX,dy=my-imgState.startY;
    const{startW,startH,startImgX,startImgY,handle}=imgState;
    let nW=startW,nH=startH,nX=startImgX,nY=startImgY;
    if(handle==='br'){nW=Math.max(20,startW+dx);nH=Math.max(20,startH+dy);}
    if(handle==='bl'){nW=Math.max(20,startW-dx);nH=Math.max(20,startH+dy);nX=startImgX+startW-nW;}
    if(handle==='tr'){nW=Math.max(20,startW+dx);nH=Math.max(20,startH-dy);nY=startImgY+startH-nH;}
    if(handle==='tl'){nW=Math.max(20,startW-dx);nH=Math.max(20,startH-dy);nX=startImgX+startW-nW;nY=startImgY+startH-nH;}
    imgState.x=nX;imgState.y=nY;imgState.w=nW;imgState.h=nH;drawImagePreview();return;
  }
  const h=hitTestHandle(mx,my);
  if(h==='tl'||h==='br')previewCanvas.style.cursor='nwse-resize';
  else if(h==='tr'||h==='bl')previewCanvas.style.cursor='nesw-resize';
  else if(hitTestImage(mx,my))previewCanvas.style.cursor='move';
  else updateCursor();
}

function drawImagePreview(){
  if(!imgState)return;
  previewCtx.clearRect(0,0,CANVAS_W,CANVAS_H);
  const{img,x,y,w,h}=imgState;previewCtx.drawImage(img,x,y,w,h);
  previewCtx.save();previewCtx.strokeStyle='#a855f7';previewCtx.lineWidth=2;
  previewCtx.setLineDash([6,3]);previewCtx.strokeRect(x,y,w,h);previewCtx.restore();
  const pos=handlePositions();
  for(const k of HANDLES){const{x:hx,y:hy}=pos[k];
    previewCtx.fillStyle='#a855f7';previewCtx.strokeStyle='#fff';previewCtx.lineWidth=1;
    previewCtx.fillRect(hx-HANDLE_R,hy-HANDLE_R,HANDLE_R*2,HANDLE_R*2);
    previewCtx.strokeRect(hx-HANDLE_R,hy-HANDLE_R,HANDLE_R*2,HANDLE_R*2);
  }
}

function stampImage(){
  if(!imgState)return;const ctx=getActiveCtx();
  if(ctx){snapshotUndo();ctx.drawImage(imgState.img,imgState.x,imgState.y,imgState.w,imgState.h);}
  imgState=null;previewCtx.clearRect(0,0,CANVAS_W,CANVAS_H);updateCursor();
}

/* =====================================================
   Canvas resize
   ===================================================== */
function resizeCanvas(newW,newH){
  const snaps=layers.map(l=>{
    const t=document.createElement('canvas');t.width=l.canvas.width;t.height=l.canvas.height;
    t.getContext('2d').drawImage(l.canvas,0,0);return t;
  });
  CANVAS_W=newW;CANVAS_H=newH;
  layers.forEach((l,i)=>{l.canvas.width=newW;l.canvas.height=newH;l.ctx.drawImage(snaps[i],0,0,newW,newH);l.undoStack=[];l.redoStack=[];});
  textCanvas.width=newW;textCanvas.height=newH;
  previewCanvas.width=newW;previewCanvas.height=newH;
  setContainerAspect();
  document.getElementById('canvas-w').value=newW;
  document.getElementById('canvas-h').value=newH;
}

/* =====================================================
   Canvas rotation (CW or CCW, keeps same pixel dimensions)
   ===================================================== */
function rotateCanvas(dir){
  rasterizeText();
  const angle=dir==='cw'?Math.PI/2:-Math.PI/2;
  layers.forEach(l=>{
    const tmp=document.createElement('canvas');tmp.width=CANVAS_W;tmp.height=CANVAS_H;
    const tCtx=tmp.getContext('2d');tCtx.save();
    tCtx.translate(CANVAS_W/2,CANVAS_H/2);tCtx.rotate(angle);
    tCtx.drawImage(l.canvas,-CANVAS_W/2,-CANVAS_H/2);tCtx.restore();
    l.ctx.clearRect(0,0,CANVAS_W,CANVAS_H);l.ctx.drawImage(tmp,0,0);
    l.undoStack=[];l.redoStack=[];
  });
}

/* =====================================================
   Paper template background
   ===================================================== */
function applyTemplate(bg){
  canvasBg=bg;containerEl.style.background=bg;
}

/* =====================================================
   Download
   ===================================================== */
function downloadCanvas(){
  rasterizeText();if(imgState)stampImage();
  const tmp=document.createElement('canvas');tmp.width=CANVAS_W;tmp.height=CANVAS_H;
  const ctx=tmp.getContext('2d');
  ctx.fillStyle=canvasBg;ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  layers.forEach(l=>{if(l.visible)ctx.drawImage(l.canvas,0,0);});
  const link=document.createElement('a');link.download='canvas.png';link.href=tmp.toDataURL('image/png');link.click();
}

/* =====================================================
   UI bindings
   ===================================================== */
function bindUIEvents(){
  brushSizeInput.addEventListener('input',()=>{brushSize=parseInt(brushSizeInput.value);sizeLabelEl.textContent=brushSize+' px';});
  shapeFillCheckbox.addEventListener('change',()=>{shapeFill=shapeFillCheckbox.checked;});

  // Text input: live preview
  textInputEl.addEventListener('input',()=>{
    if(editingTextId===null)return;
    const obj=textObjects.find(o=>o.id===editingTextId);if(!obj)return;
    obj.text=textInputEl.value;
    textCtx.font=`${obj.size}px ${obj.family}`;
    obj.w=textCtx.measureText(obj.text||' ').width;
    const scaleX=containerEl.getBoundingClientRect().width/CANVAS_W;
    textInputEl.style.minWidth=Math.max(80,(obj.w+20)*scaleX)+'px';
    renderTextObjects();
  });
  textInputEl.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();commitTextObject();}
    if(e.key==='Escape'){editingTextId=null;textInputEl.style.display='none';renderTextObjects();}
  });
  textInputEl.addEventListener('blur',()=>{setTimeout(commitTextObject,80);});

  // Update selected text on font/size change
  fontFamilySelect.addEventListener('change',()=>{
    const obj=selectedTextId!==null?textObjects.find(o=>o.id===selectedTextId):null;
    if(!obj)return;obj.family=fontFamilySelect.value;
    textCtx.font=`${obj.size}px ${obj.family}`;obj.w=textCtx.measureText(obj.text||' ').width;renderTextObjects();
  });
  fontSizeSelect.addEventListener('change',()=>{
    const obj=selectedTextId!==null?textObjects.find(o=>o.id===selectedTextId):null;
    if(!obj)return;obj.size=parseInt(fontSizeSelect.value);obj.h=obj.size;
    textCtx.font=`${obj.size}px ${obj.family}`;obj.w=textCtx.measureText(obj.text||' ').width;renderTextObjects();
  });

  document.getElementById('rasterize-btn').addEventListener('click',rasterizeText);
  document.getElementById('undo-btn').addEventListener('click',undo);
  document.getElementById('redo-btn').addEventListener('click',redo);
  document.getElementById('download-btn').addEventListener('click',downloadCanvas);

  document.getElementById('refresh-btn').addEventListener('click',()=>{
    if(!confirm('Clear all layers and start over?'))return;
    textObjects=[];selectedTextId=null;editingTextId=null;
    textCtx.clearRect(0,0,CANVAS_W,CANVAS_H);textInputEl.style.display='none';
    layers.forEach((_,i)=>clearLayer(i));
  });

  document.getElementById('add-layer-btn').addEventListener('click',()=>{addLayer(`Layer ${layers.length+1}`);setActiveLayer(layers.length-1);});

  document.querySelectorAll('.tpl-btn').forEach(btn=>{btn.addEventListener('click',()=>applyTemplate(btn.dataset.bg));});

  document.getElementById('resize-btn').addEventListener('click',()=>{
    const w=parseInt(document.getElementById('canvas-w').value);
    const h=parseInt(document.getElementById('canvas-h').value);
    if(w>=100&&h>=100&&w<=3000&&h<=3000)resizeCanvas(w,h);
    else alert('Width and height must be between 100 and 3000.');
  });

  document.getElementById('rotate-cw-btn').addEventListener('click',()=>rotateCanvas('cw'));
  document.getElementById('rotate-ccw-btn').addEventListener('click',()=>rotateCanvas('ccw'));

  document.addEventListener('keydown',e=>{
    if(document.activeElement===textInputEl||e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;
    if(e.ctrlKey&&e.key==='z'){e.preventDefault();undo();}
    if(e.ctrlKey&&e.key==='y'){e.preventDefault();redo();}
    if(e.key==='Escape'&&imgState)stampImage();
    if(e.key==='Delete'&&currentTool==='text'&&selectedTextId!==null){
      textObjects=textObjects.filter(o=>o.id!==selectedTextId);selectedTextId=null;renderTextObjects();
    }
  });
}

/* =====================================================
   Mobile UI
   ===================================================== */
function bindMobileUI(){
  const swatch=document.getElementById('mob-color-swatch');
  const modal=document.getElementById('mob-color-modal');
  swatch?.addEventListener('click',()=>{
    if(svMobCtx){drawHueBar(hueMobCtx,hueMob.width,hueMob.height);drawSVSquareMob();}
    modal.style.display='flex';
  });
  document.getElementById('mob-color-close')?.addEventListener('click',()=>{modal.style.display='none';});
  modal?.addEventListener('click',e=>{if(e.target===modal)modal.style.display='none';});
  document.getElementById('mob-undo')?.addEventListener('click',undo);
  document.getElementById('mob-redo')?.addEventListener('click',redo);
  document.getElementById('mob-download')?.addEventListener('click',downloadCanvas);
}
