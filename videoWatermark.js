let ffmpegPath, ffprobePath;
try {
  ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
} catch (e) {
  console.warn('Warning: @ffmpeg-installer/ffmpeg failed to load:', e.message);
}

try {
  ffprobePath = require('@ffprobe-installer/ffprobe').path;
} catch (e) {
  console.warn('Warning: @ffprobe-installer/ffprobe failed to load:', e.message);
}

const ffmpeg = require('fluent-ffmpeg');
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath);

let createCanvas, Image;
try {
  const canvasModule = require('canvas');
  createCanvas = canvasModule.createCanvas;
  Image = canvasModule.Image;
} catch (e) {
  console.error('Warning: node-canvas failed to load:', e.message);
}

const fs = require('fs');
const path = require('path');
const os = require('os');

const logoPath = path.join(__dirname, 'school_logo.png');
let loadedLogo = null;

if (fs.existsSync(logoPath) && Image) {
  try {
    const logoBuf = fs.readFileSync(logoPath);
    loadedLogo = new Image();
    loadedLogo.src = logoBuf;
  } catch (e) {
    console.error('Error loading school logo:', e.message);
  }
}

/**
 * Probe video dimensions (width and height) using ffprobe
 */
function getVideoDimensions(inputPath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err || !metadata || !metadata.streams) {
        console.error('ffprobe metadata error:', err ? err.message : 'no video stream');
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

/**
 * Generate transparent PNG watermark overlay matching exact video dimensions
 */
function generateWatermarkOverlayPNG(w, h, logoImg, eventName) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  const minDim = Math.min(w, h);
  const borderMargin = Math.max(12, Math.round(minDim * 0.025));
  const borderWidth = Math.max(4, Math.round(minDim * 0.004));
  const cornerRadius = Math.max(10, Math.round(minDim * 0.012));

  // 1. Curved White Border Frame (matching video edges exactly)
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

  // 2. Top-Right School Logo ONLY (35% of video width)
  if (logoImg) {
    const logoWidth = Math.round(w * 0.35);
    const logoAspectRatio = logoImg.width / logoImg.height;
    const logoHeight = Math.round(logoWidth / logoAspectRatio);
    const logoX = w - logoWidth - borderMargin - 12;
    const logoY = borderMargin + 12;

    ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
  }

  // 3. Bottom Center Label Box (Positioned inside white frame border)
  const schoolName = "SUCCESS SCHOOL INDI";
  const currentDate = new Date().toLocaleDateString('en-IN');
  const safeEvent = (eventName || 'Event').trim();
  const watermarkText = `${schoolName} | ${safeEvent} | ${currentDate}`;

  const availableWidth = w - (2 * borderMargin) - 40; // Inner safe width inside border
  let fontSize = Math.max(12, Math.round(minDim * 0.022));

  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  let textWidth = ctx.measureText(watermarkText).width;

  // Auto-fit font size down if text is wider than available video frame width
  while (textWidth > availableWidth && fontSize > 9) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    textWidth = ctx.measureText(watermarkText).width;
  }

  const textHeight = fontSize;
  const x = w / 2;
  const padding = Math.max(6, Math.round(fontSize * 0.45));
  const y = h - borderMargin - padding - 15; // Raised inside white frame border
  const textCornerRadius = 6;

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

/**
 * Watermark video file using probed resolution 2D Canvas overlay matching photo styling
 */
async function watermarkVideo(inputBuffer, eventName = '', className = '', originalFilename = 'video.mp4') {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-wm-'));
  const ext = path.extname(originalFilename) || '.mp4';
  const inputPath = path.join(tempDir, `input${ext}`);
  const overlayPngPath = path.join(tempDir, `overlay.png`);
  const outputPath = path.join(tempDir, `output${ext}`);

  try {
    fs.writeFileSync(inputPath, inputBuffer);

    // Probes video dimensions (supports all aspect ratios & rotation metadata)
    const { width: w, height: h } = await getVideoDimensions(inputPath);

    // Render Canvas PNG watermark overlay matching exact video resolution
    const overlayBuffer = generateWatermarkOverlayPNG(w, h, loadedLogo, eventName);
    fs.writeFileSync(overlayPngPath, overlayBuffer);

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputPath)
        .input(overlayPngPath)
        .complexFilter('[0:v][1:v]overlay=0:0[outv]', 'outv')
        .outputOptions([
          '-map 0:a?',     // Preserve audio stream
          '-preset superfast',
          '-crf 23',
          '-c:a copy'      // Keep original audio untouched
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log(`FFmpeg Canvas-Overlay Watermarking started (${w}x${h}):`, commandLine);
        })
        .on('end', () => {
          console.log('FFmpeg Video Watermarking completed successfully.');
          resolve();
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err.message);
          reject(err);
        })
        .run();
    });

    const watermarkedBuffer = fs.readFileSync(outputPath);
    return watermarkedBuffer;

  } catch (err) {
    console.error('Video watermarking failed, returning original video:', err.message);
    return inputBuffer;
  } finally {
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(overlayPngPath)) fs.unlinkSync(overlayPngPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
    } catch (e) {}
  }
}

module.exports = {
  watermarkVideo
};