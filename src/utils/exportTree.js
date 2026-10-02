// jsPDF is loaded lazily, inside exportAsPdf() only -- it's a meaningful
// chunk of the main bundle for a library most visitors will never touch
// (PNG is the default, PDF is a second click away). A dynamic import()
// keeps it out of the initial load entirely and gives it its own chunk.

// Export resolution: 2 output pixels per board pixel, unless that would make
// a canvas bigger than the browser can draw. Browsers silently produce an
// empty image past their limit (a 0-byte PNG used to be "saved"
// successfully), so the limits are respected up front. The first set is what
// desktop Chrome/Firefox/Safari handle; the second is iOS Safari's much
// smaller budget, tried if the first one fails.
export const PREFERRED_PIXEL_RATIO = 2;
export const CANVAS_LIMITS = [
  { maxSide: 32767, maxArea: 268435456 },
  { maxSide: 16384, maxArea: 16777216 },
];

// The pixel ratio to export a `width` x `height` board at (board pixels,
// i.e. independent of the current zoom), as large as `preferred` allows
// without either side exceeding `maxSide` or the total exceeding `maxArea`.
export function computeExportScale(width, height, { maxSide, maxArea }, preferred = PREFERRED_PIXEL_RATIO) {
  if (!(width > 0) || !(height > 0)) return preferred;
  const bySide = maxSide / Math.max(width, height);
  const byArea = Math.sqrt(maxArea / (width * height));
  // Floor to 3 decimals so rounding can never push a side over the limit.
  return Math.floor(Math.min(preferred, bySide, byArea) * 1000) / 1000;
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

// Runs `fn` with the stage's pan/zoom set aside (scale 1, no offset), then
// puts the view back. Synchronous on purpose: nothing can paint in between,
// so the board never visibly moves.
function withNeutralView(stage, fn) {
  const view = { x: stage.x(), y: stage.y(), scaleX: stage.scaleX(), scaleY: stage.scaleY() };
  try {
    stage.position({ x: 0, y: 0 });
    stage.scale({ x: 1, y: 1 });
    return fn();
  } finally {
    stage.position({ x: view.x, y: view.y });
    stage.scale({ x: view.scaleX, y: view.scaleY });
    stage.batchDraw();
  }
}

// Renders the whole board -- not just the visible part -- in board pixels,
// so the result doesn't depend on how far the board happened to be zoomed
// when Export was pressed.
async function captureBoard(stage) {
  const layer = stage.getLayers()[0];
  if (!layer) throw new Error('Canvas not available.');

  const box = withNeutralView(stage, () => layer.getClientRect());
  if (!Number.isFinite(box.width) || box.width < 1 || box.height < 1) {
    throw new Error('There is nothing on the board to export.');
  }
  const crop = { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.ceil(box.width), height: Math.ceil(box.height) };

  for (const limits of CANVAS_LIMITS) {
    const pixelRatio = computeExportScale(crop.width, crop.height, limits);
    let canvas = null;
    try {
      canvas = withNeutralView(stage, () => layer.toCanvas({ ...crop, pixelRatio }));
    } catch {
      canvas = null;
    }
    const blob = canvas && canvas.width > 0 && canvas.height > 0 ? await canvasToBlob(canvas) : null;
    if (blob && blob.size > 0) {
      return { canvas, blob, pixelRatio, width: crop.width, height: crop.height };
    }
  }
  throw new Error("This browser couldn't create an image that large.");
}

// Said alongside a successful export when the board was too big to save at
// full resolution, so a blurry result is never a surprise.
function reducedNote(pixelRatio) {
  if (pixelRatio >= PREFERRED_PIXEL_RATIO) return null;
  const percent = Math.round((pixelRatio / PREFERRED_PIXEL_RATIO) * 100);
  return `This tree is too large for one full-quality image, so it was saved at ${percent}% resolution.`;
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function exportAsPng(stage, fileName = 'family-tree') {
  try {
    if (!stage) return { ok: false, error: 'Canvas not available.' };
    const { blob, pixelRatio } = await captureBoard(stage);
    triggerDownload(blob, `${fileName}.png`);
    return { ok: true, warning: reducedNote(pixelRatio) };
  } catch (error) {
    return { ok: false, error: error?.message || 'PNG export failed.' };
  }
}

export async function exportAsPdf(stage, fileName = 'family-tree') {
  try {
    if (!stage) return { ok: false, error: 'Canvas not available.' };
    // Loaded here, not at module scope, so a bad network on someone's
    // first-ever PDF export surfaces through the same catch/toast every
    // other export failure already goes through -- no new failure mode.
    const { default: jsPDF } = await import('jspdf');
    const { canvas, pixelRatio, width, height } = await captureBoard(stage);

    // Match page orientation to the board so wide trees aren't squashed.
    const landscape = width >= height;
    const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;

    const scale = Math.min(maxWidth / width, maxHeight / height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;

    // 'FAST' compresses the embedded image; without it jsPDF stores raw
    // pixels, which made even a one-card PDF ~2.6 MB.
    pdf.addImage(
      canvas,
      'PNG',
      (pageWidth - drawWidth) / 2,
      (pageHeight - drawHeight) / 2,
      drawWidth,
      drawHeight,
      undefined,
      'FAST'
    );
    pdf.save(`${fileName}.pdf`);
    return { ok: true, warning: reducedNote(pixelRatio) };
  } catch (error) {
    return { ok: false, error: error?.message || 'PDF export failed.' };
  }
}
