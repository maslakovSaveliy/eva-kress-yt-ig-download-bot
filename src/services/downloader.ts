import { spawn } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import { config } from '../config.js';
import { ensureDir, generateTempFilename } from '../utils/file.js';

interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export async function downloadVideo(url: string): Promise<DownloadResult> {
  await ensureDir(config.tempDir);

  const outputTemplate = path.join(
    config.tempDir,
    generateTempFilename('video', '%(ext)s')
  );

  return new Promise((resolve) => {
    const args = [
      url,
      '-o', outputTemplate,
      '--no-playlist',
      '--merge-output-format', 'mp4',
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--no-warnings',
      '--quiet',
    ];

    const process = spawn('yt-dlp', args);

    let stderr = '';

    process.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    process.on('close', async (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          error: stderr || `yt-dlp exited with code ${code}`,
        });
        return;
      }

      const downloadedFile = await findDownloadedFile(outputTemplate);

      if (downloadedFile) {
        resolve({
          success: true,
          filePath: downloadedFile,
        });
      } else {
        resolve({
          success: false,
          error: 'Downloaded file not found',
        });
      }
    });

    process.on('error', (error) => {
      resolve({
        success: false,
        error: `Failed to start yt-dlp: ${error.message}. Make sure yt-dlp is installed.`,
      });
    });
  });
}

async function findDownloadedFile(template: string): Promise<string | null> {
  const dir = path.dirname(template);
  const baseName = path.basename(template).replace('.%(ext)s', '');

  try {
    const files = await readdir(dir);
    const downloadedFile = files.find((file) => file.startsWith(baseName.split('.')[0]));

    if (downloadedFile) {
      const fullPath = path.join(dir, downloadedFile);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }
  } catch (error) {
    console.error('Error finding downloaded file:', error);
  }

  return null;
}

export async function getVideoInfo(url: string): Promise<{ title: string; duration: number } | null> {
  return new Promise((resolve) => {
    const args = [
      url,
      '--print', '%(title)s',
      '--print', '%(duration)s',
      '--no-warnings',
      '--quiet',
    ];

    const process = spawn('yt-dlp', args);
    let output = '';

    process.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });

    process.on('close', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }

      const lines = output.trim().split('\n');
      if (lines.length >= 2) {
        resolve({
          title: lines[0],
          duration: parseFloat(lines[1]) || 0,
        });
      } else {
        resolve(null);
      }
    });

    process.on('error', () => {
      resolve(null);
    });
  });
}

