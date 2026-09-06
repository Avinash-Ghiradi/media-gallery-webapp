const fs = require('fs');
const path = require('path');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

const svgContent = `<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
  <rect x="20" y="20" width="1240" height="680" rx="16" ry="16" fill="none" stroke="white" stroke-width="4" />
</svg>`;

const svgPath = path.join(__dirname, 'test_border.svg');
const inputVideoPath = path.join(__dirname, 'test_in.mp4');
const outVideoPath = path.join(__dirname, 'test_out.mp4');

fs.writeFileSync(svgPath, svgContent);

ffmpeg()
  .input('color=c=blue:s=1280x720:d=1')
  .inputFormat('lavfi')
  .output(inputVideoPath)
  .on('end', () => {
    ffmpeg()
      .input(inputVideoPath)
      .input(svgPath)
      .complexFilter('[0:v][1:v]overlay=0:0[outv]', 'outv')
      .output(outVideoPath)
      .on('end', () => {
        console.log('SVG overlay on video WORKS! Size:', fs.readFileSync(outVideoPath).length);
        if (fs.existsSync(svgPath)) fs.unlinkSync(svgPath);
        if (fs.existsSync(inputVideoPath)) fs.unlinkSync(inputVideoPath);
        if (fs.existsSync(outVideoPath)) fs.unlinkSync(outVideoPath);
      })
      .on('error', e => console.error('SVG overlay error:', e.message))
      .run();
  })
  .run();
