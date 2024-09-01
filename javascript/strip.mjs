import {
  Canvas,
  Rect,
  Path,
  Group,
  Line,
  Point,
  FabricImage,
  util,
} from './fabric.mjs'; // browser

import { sendDimensions, sendInpaint, getMaskIfAvailable } from './adapter.mjs';

function makeRectangle(dims = { left: 0, top: 0, height: 100, width: 200 }) {
  let r = new Rect({
    left: dims.left,
    top: dims.top,
    width: dims.width,
    height: dims.height,
    stroke: '#222',
    strokeWidth: 2,
    fill: '',
    selectable: false,
    lockMovementX: true,
    lockMovementY: true,
    originX: 'left',
    originY: 'top',
  });
  r.on('mousedown', function (options) {
    sendDimensions(r.width, r.height);
  });

  return r;
}

class Strip {
  constructor(container) {
    container.innerHTML = `
            <canvas id="c"> </canvas>
        `;
    this.bg = '#374151';
    this.canvas = new Canvas('c', {
      width: 1600,
      height: 2500,
      backgroundColor: this.bg,
    });
    this.canvas.preserveObjectStacking = true;

    const storedCanvasData = localStorage.getItem('canvasData');
    if (storedCanvasData) {
      const canvasJson = JSON.parse(storedCanvasData);
      this.canvas.loadFromJSON(canvasJson, () => {
        this.canvas.renderAll();
      });
    } else {
      this.addSampleFraming();
    }

    this.canvas.on('dragover', (e) => {
      // partial insanity here, figure out why fabricjs is not doing this (anymore ?)
      e.e.preventDefault();
    });

    this.canvas.on('drop', async (e) => {
      e = e.e; // crazy but true, get the original event
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      const mask = await getMaskIfAvailable(file);

      reader.onload = async (event) => {
        const img = new Image();
        img.onload = () => {
          this.attachImage(img, mask);
        };
        img.src = event.target.result;
      };
      await new Promise((resolve) => {
        reader.onloadend = resolve;
        reader.readAsDataURL(file);
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'm') {
        this.inpaint();
      }

      if (e.key === 'Delete') {
        this.deleteSelection();
      }

      if (!(e.shiftKey && e.key === 'E')) {
        return;
      }

      let selected = this.canvas.getActiveObjects();
      let image = selected.find((obj) => obj instanceof FabricImage);
      let panel = selected.find((obj) => obj instanceof Rect);

      if (!image || !panel) {
        return;
      }

      let groupMatrix = panel.group.calcTransformMatrix();

      image.clipPath = new Rect({
        left: panel.left + groupMatrix[4],
        top: panel.top + groupMatrix[5],
        width: panel.width,
        height: panel.height,
        originX: 'left',
        originY: 'top',
        absolutePositioned: true,
      });
      this.canvas.renderAll();
    });

    setInterval(() => {
      const canvasJson = this.canvas.toJSON(['inpaintMask']);
      localStorage.setItem('canvasData', JSON.stringify(canvasJson));
    }, 30000);
  }

  addSampleFraming() {
    // top part
    this.canvas.add(
      makeRectangle({ left: 0, top: 0, width: this.canvas.width, height: 517 })
    );

    // bottom part
    this.canvas.add(
      makeRectangle({
        left: 0,
        top: 517,
        width: this.canvas.width,
        height: this.canvas.height - 517,
      })
    );

    var panel1 = makeRectangle({
      left: 100,
      top: 1000,
      width: 300,
      height: 200,
      selectable: true,
    });
    this.canvas.add(panel1);

    var panel2 = makeRectangle({
      left: this.canvas.width - 400,
      top: 1100,
      width: 300,
      height: 200,
      selectable: true,
    });
    this.canvas.add(panel2);
  }

  deleteSelection() {
    let selected = this.canvas.getActiveObjects();
    selected.forEach((obj) => {
      this.canvas.remove(obj);
    });
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
  }

  inpaint() {
    let area = this.canvas.getActiveObject();

    if (!area) {
      // add a selection tool if not selecting anything specific yet
      this.addInpaintRectangle();
      return;
    }

    area.strokeWidth = 0;
    this.canvas.renderAll();

    const boundingRect = area.getBoundingRect();
    const width = boundingRect.width;
    const height = boundingRect.height;

    var dataURL = this.canvas.toDataURL({
      format: 'png', // or 'jpeg'
      quality: 0.8, // Adjust quality as needed,
      left: area.left,
      top: area.top,
      width,
      height,
    });

    const mask = area.inpaintMask || null;
    sendInpaint(dataURL, Math.ceil(width), Math.ceil(height), mask);

    area.strokeWidth = 1;
    this.canvas.renderAll();
  }

  addInpaintRectangle() {
    let r = new Rect({
      left: 0,
      top: 0,
      width: 50,
      height: 50,
      stroke: 'red',
      strokeWidth: 1,
      fill: '',
      originX: 'left',
      originY: 'top',
    });
    this.canvas.add(r);
  }

  attachImage(img, mask) {
    let attributes = { top: 0, left: 0, inpaintMask: mask };
    const selected = this.canvas.getActiveObject();
    if (selected instanceof Rect) {
      attributes = { top: selected.top, left: selected.left };
    }
    this.canvas.add(new FabricImage(img, attributes));
  }
}

export { Strip };
