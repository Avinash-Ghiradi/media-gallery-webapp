const fs = require('fs');
const path = require('path');
const { createCanvas, Image } = require('canvas');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

function generateWatermarkOverlayPNG(w, h, logoImg, eventName) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  const minDim = Math.min(w, h);
  const borderMargin = Math.max(12, Math.round(minDim * 0.025));
  const borderWidth = Math.max(4, Math.round(minDim * 0.004));
  const cornerRadius = Math.max(10, Math.round(minDim * 0.012));

  // 1. Draw Rounded White Border Frame
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = borderWidth;

  ctx.beginPath();
  ctx.moveTo(borderMargin + cornerRadius, borderMargin);
  ctx.lineTo(w - borderMargin - cornerRadius, borderMargin);
  ctx.quadraticCurveTo(w - borderMargin, borderMargin, w - borderMargin, borderMargin + cornerRadius);
  ctx.lineTo(w - borderMargin, h - borderMargin - cornerRadius);
  ctx.quadraticCurveTo(w - borderMargin, h - borderMargin, w - borderMargin - cornerRadius, h - borderMargin);
  ctx.lineTo(borderMargin + cornerRadius, h - borderMargin);
  ctx.quadraticCurveTo(borderMargin, h - borderMargin, borderMargin, h - borderMargin - cornerRadius);
  ctx.lineTo(borderMargin, borderMargin + cornerRadius);
  ctx.quadraticCurveTo(borderMargin, borderMargin, borderMargin + cornerRadius, borderMargin);
  ctx.closePath();
  ctx.stroke();

  // 2. Draw Top-Right Logo (if available)
  if (logoImg) {
    const logoWidth = Math.round(w * 0.16);
    const logoAspectRatio = logoImg.width / logoImg.height;
    const logoHeight = Math.round(logoWidth / logoAspectRatio);
    const logoX = w - logoWidth - borderMargin - 15;
    const logoY = borderMargin + 15;

    ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
  }

  // 3. Draw Bottom Center Label Box (Dynamic Font Size to fit inside border margin)
  const schoolName = "SUCCESS SCHOOL INDI";
  const currentDate = new Date().toLocaleDateString('en-IN');
  const safeEvent = (eventName || 'Event').trim();
  const watermarkText = `${schoolName} | ${safeEvent} | ${currentDate}`;

  const availableWidth = w - (2 * borderMargin) - 40; // Max allowed width inside frame
  let fontSize = Math.max(14, Math.round(minDim * 0.03));

  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  let textWidth = ctx.measureText(watermarkText).width;

  // Auto-scale font size down if watermark text is wider than video frame
  while (textWidth > availableWidth && fontSize > 10) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    textWidth = ctx.measureText(watermarkText).width;
  }

  const textHeight = fontSize;
  const x = w / 2;
  const y = h - borderMargin - 15;
  const padding = Math.max(8, Math.round(fontSize * 0.6));
  const textCornerRadius = 8;

  // Draw semi-transparent dark rounded box
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.beginPath();
  ctx.moveTo(x - textWidth/2 - padding + textCornerRadius, y - textHeight - padding/2);
  ctx.lineTo(x + textWidth/2 + padding - textCornerRadius, y - textHeight - padding/2);
  ctx.quadraticCurveTo(x + textWidth/2 + padding, y - textHeight - padding/2, x + textWidth/2 + padding, y - textHeight - padding/2 + textCornerRadius);
  ctx.lineTo(x + textWidth/2 + padding, y + padding/2 - textCornerRadius);
  ctx.quadraticCurveTo(x + textWidth/2 + padding, y + padding/2, x + textWidth/2 + padding - textCornerRadius, y + padding/2);
  ctx.lineTo(x - textWidth/2 - padding + textCornerRadius, y + padding/2);
  ctx.quadraticCurveTo(x - textWidth/2 - padding, y + padding/2, x - textWidth/2 - padding, y + padding/2 - textCornerRadius);
  ctx.lineTo(x - textWidth/2 - padding, y - textHeight - padding/2 + textCornerRadius);
  ctx.quadraticCurveTo(x - textWidth/2 - padding, y - textHeight - padding/2, x - textWidth/2 - padding + textCornerRadius, y - textHeight - padding/2);
  ctx.closePath();
  ctx.fill();

  // Draw White Watermark Text
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(watermarkText, x, y);

  return canvas.toBuffer('image/png');
}

const logoPath = path.join(__dirname, 'src', 'school_logo.png');
let loadedLogo = null;

if (fs.existsSync(logoPath)) {
  const logoBuf = fs.readFileSync(logoPath);
  loadedLogo = new Image();
  loadedLogo.src = logoBuf;
}

const inputVideoPath = path.join(__dirname, 'test_canvas_input.mp4');
const overlayPngPath = path.join(__dirname, 'test_overlay.png');
const outputVideoPath = path.join(__dirname, 'test_canvas_output.mp4');

// 1. Generate PNG watermark overlay
const pngBuffer = generateWatermarkOverlayPNG(1280, 720, loadedLogo, '80th INDEPENDENCE DAY CELEBRATION');
fs.writeFileSync(overlayPngPath, pngBuffer);

// 2. Generate 1-sec test video
ffmpeg()
  .input('color=c=navy:s=1280x720:d=1')
  .inputFormat('lavfi')
  .output(inputVideoPath)
  .on('end', () => {
    // 3. Overlay PNG onto video via FFmpeg
    ffmpeg()
      .input(inputVideoPath)
      .input(overlayPngPath)
      .complexFilter('[0:v][1:v]overlay=0:0[outv]', 'outv')
      .output(outputVideoPath)
      .on('end', () => {
        console.log('Canvas PNG Overlay on video SUCCESS! Video Size:', fs.readFileSync(outputVideoPath).length);
        if (fs.existsSync(overlayPngPath)) fs.unlinkSync(overlayPngPath);
        if (fs.existsSync(inputVideoPath)) fs.unlinkSync(inputVideoPath);
        if (fs.existsSync(outputVideoPath)) fs.unlinkSync(outputVideoPath);
      })
      .on('error', e => console.error('FFmpeg overlay error:', e.message))
      .run();
  })
  .run();
