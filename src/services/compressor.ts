import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { config } from '../config.js';
import { getFileSizeInMB, generateTempFilename } from '../utils/file.js';

interface CompressionResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

const TARGET_SIZE_MB = config.maxFileSizeMB - 2; // Оставляем запас

export async function compressIfNeeded(inputPath: string): Promise<CompressionResult> {
  const fileSizeMB = await getFileSizeInMB(inputPath);

  if (fileSizeMB <= config.maxFileSizeMB) {
    return {
      success: true,
      filePath: inputPath,
    };
  }

  console.log(`File size: ${fileSizeMB.toFixed(2)}MB, compressing...`);

  return compressVideo(inputPath);
}

async function compressVideo(inputPath: string): Promise<CompressionResult> {
  const outputFilename = generateTempFilename('compressed', 'mp4');
  const outputPath = path.join(config.tempDir, outputFilename);

  return new Promise((resolve) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        resolve({
          success: false,
          error: `Failed to probe video: ${err.message}`,
        });
        return;
      }

      const duration = metadata.format.duration || 60;
      const targetBitrate = Math.floor((TARGET_SIZE_MB * 8192) / duration); // kbps

      ffmpeg(inputPath)
        .outputOptions([
          `-b:v ${targetBitrate}k`,
          '-maxrate', `${targetBitrate * 1.5}k`,
          '-bufsize', `${targetBitrate * 2}k`,
          '-c:v libx264',
          '-preset fast',
          '-c:a aac',
          '-b:a 128k',
          '-movflags +faststart',
        ])
        .output(outputPath)
        .on('end', async () => {
          const newSize = await getFileSizeInMB(outputPath);
          console.log(`Compressed: ${newSize.toFixed(2)}MB`);

          resolve({
            success: true,
            filePath: outputPath,
          });
        })
        .on('error', (error) => {
          resolve({
            success: false,
            error: `Compression failed: ${error.message}`,
          });
        })
        .run();
    });
  });
}

