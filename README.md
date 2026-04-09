# Software Studio 2026 Spring
## Assignment 01 Web Canvas

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

| **Other useful widgets** | **Score** | **Check** |
| :----------------------- | :-------: | :-------: |
| Eyedropper (Color Picker)|   5%      |     Y     |
| Bucket Fill Tool         |   5%      |     Y     |

---

### How to use

**Basic Tools (left panel)**

- **Brush** — Click and drag on the canvas to draw a freehand line. Use the brush size slider to change the stroke width.
- **Eraser** — Click and drag to erase. It removes pixels (uses real transparency, not white).
- **Text** — Select Text, click anywhere on the canvas, and start typing. Press **Enter** to place the text. The preview updates as you type. Change the font and size in the "Text Settings" section.
- **Image** — Click "Image" to open a file picker. After the image appears, drag it to move or drag the purple corner handles to resize. Click outside the image to place it on the active layer.
- **Picker (Eyedropper)** — Click on any pixel on the canvas to pick its color. The color picker updates to match. The tool automatically switches back to Brush after picking.
- **Fill (Bucket)** — Click on a closed area to fill it with the current color.

**Color Picker (right panel)**

- Click or drag inside the **SV square** to change saturation and brightness.
- Click or drag on the **hue bar** below to change the hue.
- The color preview circle and RGB label show the current color.
- No `<input type="color">` is used anywhere.

**Shapes (right panel)**

- Select **Rect**, **Circle**, or **Triangle**, then click and drag on the canvas to draw the shape.
- Check **Fill shape** to draw a filled shape instead of just the outline.
- The shape preview appears while dragging and only commits when you release the mouse (no flickering).

**Layers (left panel)**

- Two layers are created by default.
- Click **+ Add Layer** to add more layers.
- Click a layer row to make it the active (drawing) layer — it highlights with a purple border.
- Click **ON / OFF** to show or hide a layer.
- Click **CLR** to clear only that layer (supports undo).

**Undo / Redo**

- Click **Undo** or press `Ctrl+Z` to undo the last action on the active layer.
- Click **Redo** or press `Ctrl+Y` to redo.
- Each layer has its own history (up to 30 steps).

**Refresh**

- Click **Refresh Canvas** to clear all layers. A confirmation dialog appears first.

**Download**

- Click **Download PNG** to save the canvas as a PNG file.
- All visible layers are composited together with a white background (no transparency).

---

### Bonus Function description

**Eyedropper Tool**

- Pick any color directly from the canvas by clicking on a pixel.
- Works on the composite view of all visible layers.
- After picking, the color picker UI updates to match the selected color and the tool switches back to Brush automatically.

**Bucket Fill Tool**

- Click inside any area to flood-fill it with the current color.
- Uses a stack-based BFS flood fill on the active layer only.
- Supports undo.

---

### Web page link

Firebase Hosting URL: *(fill in after deployment)*

---

### Others (Optional)

- The eraser uses `globalCompositeOperation = 'destination-out'` — it removes actual pixels rather than painting white. This means the erased area is truly transparent and will not appear when downloading.
- All features use only vanilla HTML5 Canvas API. No third-party libraries are imported.

<style>
table th{
    width: 100%;
}
</style>
