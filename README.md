# Software Studio 2026 Spring
## Assignment 01 — Web Canvas

### Scoring

| **Basic components** | **Score** | **Check** |
| :------------------- | :-------: | :-------: |
| Basic control tools  |    20%    |     Y     |
| Text input           |    10%    |     Y     |
| Cursor icon          |    5%     |     Y     |
| Refresh button       |    5%     |     Y     |

| **Advanced tools**     | **Score** | **Check** |
| :--------------------- | :-------: | :-------: |
| Different brush shapes |    15%    |     Y     |
| Image tool             |    10%    |     Y     |
| Download               |    5%     |     Y     |
| Layer Management       |    10%    |     Y     |

| **Other useful widgets**  | **Score** | **Check** |
| :------------------------ | :-------: | :-------: |
| Eyedropper (Color Picker) |    5%     |     Y     |
| Bucket Fill Tool          |    5%     |     Y     |

---

### How to use

**Drawing Tools (left panel)**

- **Brush** — Click and drag to draw a freehand line. Adjust stroke width with the brush size slider.
- **Eraser** — Click and drag to erase pixels. Uses `destination-out` compositing so erased areas are truly transparent.
- **Spray** — Click and drag to spray random dots in a circle. Density and radius scale with brush size.
- **Text** — Select Text, click on the canvas, type your text, then press **Enter** to place it or **Esc** to cancel. Click elsewhere to place and start a new text. Font and size are set in the Text Settings panel.
- **Image** — Opens a file picker. After loading, drag the image to move it or drag the corner handles to resize. Click outside the image to stamp it onto the active layer.
- **Picker (Eyedropper)** — Click any pixel to pick its color from the composite view of all visible layers. Automatically switches back to Brush after picking.
- **Fill (Bucket)** — Click inside a closed area to flood-fill it with the current color.

**Color Picker (right panel)**

- Click or drag in the **SV square** to change saturation and brightness.
- Click or drag the **hue bar** to change the hue.
- The color preview box and RGB label show the current color.
- No `<input type="color">` is used anywhere.
- The last 5 used colors appear as **Recent** swatches for quick reuse.

**Shapes (right panel)**

- Select **Rect**, **Circle**, or **Triangle**, then drag on the canvas to draw.
- Check **Fill shape** to draw a filled shape.
- A live preview is shown while dragging; the shape commits only on mouse release.

**Layers (left panel)**

- Two layers are created by default.
- Click **+ Add Layer** to add more.
- Click a layer row to make it the active drawing layer (highlighted with a purple border).
- Click **ON / OFF** to show or hide a layer.
- Click **CLR** to clear that layer (supports undo).

**Undo / Redo (right panel)**

- Click **Undo** or press `Ctrl+Z` to undo the last action on the active layer.
- Click **Redo** or press `Ctrl+Y` to redo.
- Each layer keeps its own history (up to 30 steps).

**Paper Templates (right panel)**

- Click a preset — White, Black, Pastel, Sky, or Pink — to change the canvas background color.
- The background color is included when downloading.

**Rotate Canvas (right panel)**

- **CCW** rotates all layers 90° counter-clockwise.
- **CW** rotates all layers 90° clockwise.

**Refresh**

- Click **Refresh Canvas** to clear all layers. A confirmation dialog appears first.

**Download**

- Click **Download PNG** to export the canvas as a PNG file.
- All visible layers are composited with the background color (no transparency).

---

### Bonus Features

**Eyedropper Tool**

- Samples the composite color of all visible layers at the clicked pixel.
- Updates the color picker UI to match the sampled color.

**Bucket Fill Tool**

- Stack-based BFS flood fill on the active layer only.
- Uses a `Uint8Array` visited map for performance on large areas.
- Supports undo.

**Spray Paint Tool**

- Scatters random dots within a circle of radius `brushSize × 1.5`.
- Dot density increases with brush size.
- Each dot has a slightly random opacity for a natural spray effect.

---

### Web page link

Firebase Hosting URL: *(fill in after deployment)*

---

### Others

- The eraser uses `globalCompositeOperation = 'destination-out'` to remove actual pixels rather than painting white, so erased areas stay transparent in downloads.
- All features use only vanilla HTML5 Canvas API. No third-party libraries.
- Canvas logical resolution is fixed at 800 × 600 px. CSS `aspect-ratio` scales the display without affecting drawing coordinates.

<style>
table th { width: 100%; }
</style>
