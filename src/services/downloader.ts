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

const COOKIES_PATH = './cookies.txt';

function isInstagramUrl(url: string): boolean {
  return url.includes('instagram.com');
}

export async function downloadVideo(url: string): Promise<DownloadResult> {
  await ensureDir(config.tempDir);
  return downloadViaYtDlp(url);
}

async function downloadViaYtDlp(url: string): Promise<DownloadResult> {
  const outputTemplate = path.join(
    config.tempDir,
    generateTempFilename('video', '%(ext)s')
  );

  return new Promise((resolve) => {
    const isInsta = isInstagramUrl(url);
    
    const args = [
      url,
      '-o', outputTemplate,
      '--no-playlist',
      '--no-warnings',
      '--socket-timeout', '60',
      '--retries', '5',
    ];

    if (isInsta) {
      // Для Instagram: скачиваем лучшее качество и перекодируем
      args.push('-f', 'best');
      args.push('--recode-video', 'mp4');
      args.push('--postprocessor-args', 'ffmpeg:-c:v libx264 -c:a aac -movflags +faststart -preset fast');
      console.log('📸 Instagram: will recode to H.264');
    } else {
      // Для YouTube и других
      args.push('-f', 'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best');
      args.push('--merge-output-format', 'mp4');
    }

    // Cookies
    if (existsSync(COOKIES_PATH)) {
      args.push('--cookies', COOKIES_PATH);
    }

    // Прокси для Instagram
    if (isInsta && config.proxy) {
      args.push('--proxy', config.proxy);
      console.log('🌐 Using proxy for Instagram');
    }

    args.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const proc = spawn('yt-dlp', args);
    let stderr = '';

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', async (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          error: stderr || `yt-dlp exited with code ${code}`,
        });
        return;
      }

      const downloadedFile = await findDownloadedFile(outputTemplate);

      if (downloadedFile) {
        resolve({ success: true, filePath: downloadedFile });
      } else {
        resolve({ success: false, error: 'Downloaded file not found' });
      }
    });

    proc.on('error', (error) => {
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

    const proc = spawn('yt-dlp', args);
    let output = '';

    proc.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
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

    proc.on('error', () => {
      resolve(null);
    });
  });
}
