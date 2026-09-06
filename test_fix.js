const fs = require('fs');
const path = require('path');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const ffmpeg = require('fluent-ffmpeg');
const { createCanvas, Image } = require('canvas');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const logoPath = path.join(__dirname, 'src', 'school_logo.png');
let loadedLogo = null;

if (fs.existsSync(logoPath)) {
  const logoBuf = fs.readFileSync(logoPath);
  loadedLogo = new Image();
  loadedLogo.src = logoBuf;
}

function getVideoDimensions(inputPath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err || !metadata || !metadata.streams) {
        console.error('Probe error:', err);
        return resolve({ width: 1280, height: 720 });
      }
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (videoStream && videoStream.width && videoStream.height) {
        const rotation = videoStream.side_data_list ? videoStream.side_data_list.find(s => s.rotation) : null;
        if (rotation && (Math.abs(rotation.rotation) === 90 || Math.abs(rotation.rotation) === 270)) {
          return resolve({ width: videoStream.height, height: videoStream.width });
        }
        return resolve({ width: videoStream.width, height: videoStream.height });
      }
      resolve({ width: 1280, height: 720 });
    });
  });
}

function generateWatermarkOverlayPNG(w, h, logoImg, eventName) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  const minDim = Math.min(w, h);
  const borderMargin = Math.max(12, Math.round(minDim * 0.025));
  const borderWidth = Math.max(4, Math.round(minDim * 0.004));
  const cornerRadius = Math.max(10, Math.round(minDim * 0.012));

  // 1. Curved White Border Frame matching video edges exactly
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

  // 2. Top-Right School Logo ONLY
  if (logoImg) {
    const logoWidth = Math.round(w * 0.16);
    const logoAspectRatio = logoImg.width / logoImg.height;
    const logoHeight = Math.round(logoWidth / logoAspectRatio);
    const logoX = w - logoWidth - borderMargin - 12;
    const logoY = borderMargin + 12;

    ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
  }

  // 3. Bottom Center Label Box (Auto-scaled font size)
  const schoolName = "SUCCESS SCHOOL INDI";
  const currentDate = new Date().toLocaleDateString('en-IN');
  const safeEvent = (eventName || 'Event').trim();
  const watermarkText = `${schoolName} | ${safeEvent} | ${currentDate}`;

  const availableWidth = w - (2 * borderMargin) - 30;
  let fontSize = Math.max(12, Math.round(w * 0.035));

  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  let textWidth = ctx.measureText(watermarkText).width;

  while (textWidth > availableWidth && fontSize > 9) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    textWidth = ctx.measureText(watermarkText).width;
  }

  const textHeight = fontSize;
  const x = w / 2;
  const y = h - borderMargin - 12;
  const padding = Math.max(6, Math.round(fontSize * 0.5));
  const textCornerRadius = 6;

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

  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(watermarkText, x, y);

  return canvas.toBuffer('image/png');
}

const inputVideoPath = path.join(__dirname, 'test_portrait_in.mp4');
const overlayPngPath = path.join(__dirname, 'test_portrait_overlay.png');
const outputVideoPath = path.join(__dirname, 'test_portrait_out.mp4');

// Create a 540x960 vertical mobile video
ffmpeg()
  .input('color=c=purple:s=540x960:d=1')
  .inputFormat('lavfi')
  .output(inputVideoPath)
  .on('end', async () => {
    const { width: w, height: h } = await getVideoDimensions(inputVideoPath);
    console.log(`Probed video size: ${w}x${h}`);

    const overlayBuf = generateWatermarkOverlayPNG(w, h, loadedLogo, '80th INDEPENDENCE DAY');
    fs.writeFileSync(overlayPngPath, overlayBuf);

    ffmpeg()
      .input(inputVideoPath)
      .input(overlayPngPath)
      .complexFilter('[0:v][1:v]overlay=0:0[outv]', 'outv')
      .output(outputVideoPath)
      .on('end', () => {
        console.log('Mobile Portrait Video Watermarking SUCCESS! Output size:', fs.readFileSync(outputVideoPath).length);
        if (fs.existsSync(inputVideoPath)) fs.unlinkSync(inputVideoPath);
        if (fs.existsSync(overlayPngPath)) fs.unlinkSync(overlayPngPath);
        if (fs.existsSync(outputVideoPath)) fs.unlinkSync(outputVideoPath);
      })
      .on('error', e => console.error('FFmpeg overlay error:', e.message))
      .run();
  })
  .run();
