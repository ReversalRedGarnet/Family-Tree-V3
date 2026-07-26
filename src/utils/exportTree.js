import jsPDF from 'jspdf';

// Captures the whole board, not just the visible viewport. The layer's
// client rect is already in stage-container pixels (transform applied),
// which is exactly what toDataURL's crop expects.
function captureDataUrl(stage, pixelRatio = 2) {
  const layer = stage.getLayers()[0];
  const box = layer ? layer.getClientRect() : null;

  if (!box || !Number.isFinite(box.width) || box.width < 1 || box.height < 1) {
    return { dataUrl: stage.toDataURL({ pixelRatio }), width: stage.width(), height: stage.height() };
  }

  const crop = {
    x: Math.floor(box.x),
    y: Math.floor(box.y),
    width: Math.ceil(box.width),
    height: Math.ceil(box.height),
  };
  return { dataUrl: stage.toDataURL({ ...crop, pixelRatio }), width: crop.width, height: crop.height };
}

function triggerDownload(dataUrl, fileName) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function exportAsPng(stage, fileName = 'family-tree') {
  try {
    if (!stage) return { ok: false, error: 'Canvas not available.' };
    const { dataUrl } = captureDataUrl(stage);
    triggerDownload(dataUrl, `${fileName}.png`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'PNG export failed.' };
  }
}

export async function exportAsPdf(stage, fileName = 'family-tree') {
  try {
    if (!stage) return { ok: false, error: 'Canvas not available.' };
    const { dataUrl, width, height } = captureDataUrl(stage);

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

    pdf.addImage(
      dataUrl,
      'PNG',
      (pageWidth - drawWidth) / 2,
      (pageHeight - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
    pdf.save(`${fileName}.pdf`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'PDF export failed.' };
  }
}
