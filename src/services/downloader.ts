import { spawn } from 'child_process';
import path from 'path';
import { existsSync, createWriteStream } from 'fs';
import { readdir, unlink } from 'fs/promises';
import https from 'https';
import http from 'http';
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

  // Для Instagram используем Cobalt API (обходит блокировки)
  if (isInstagramUrl(url)) {
    console.log('📸 Instagram detected, using Cobalt API...');
    const cobaltResult = await downloadViaCobalt(url);
    if (cobaltResult.success) {
      return cobaltResult;
    }
    console.log('⚠️ Cobalt failed:', cobaltResult.error);
    console.log('🔄 Falling back to yt-dlp...');
  }

  // Для YouTube и fallback используем yt-dlp
  return downloadViaYtDlp(url);
}

async function downloadViaYtDlp(url: string): Promise<DownloadResult> {
  const outputTemplate = path.join(
    config.tempDir,
    generateTempFilename('video', '%(ext)s')
  );

  return new Promise((resolve) => {
    const args = [
      url,
      '-o', outputTemplate,
      '--no-playlist',
      '-f', 'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
      '--merge-output-format', 'mp4',
      '--no-warnings',
      '--socket-timeout', '60',
      '--retries', '3',
    ];

    if (existsSync(COOKIES_PATH)) {
      args.push('--cookies', COOKIES_PATH);
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

// ============= Cobalt API для Instagram =============

interface CobaltResponse {
  status: string;
  url?: string;
  error?: { code: string };
}

async function downloadViaCobalt(url: string): Promise<DownloadResult> {
  const outputPath = path.join(config.tempDir, generateTempFilename('video', 'mp4'));
  const cobaltHost = process.env.COBALT_API_URL || 'http://localhost:9000';
  console.log('🔗 Using Cobalt API:', cobaltHost);

  try {
    const videoUrl = await getCobaltVideoUrl(url);

    if (!videoUrl) {
      return { success: false, error: 'Cobalt API returned no video URL' };
    }

    console.log('📥 Downloading from Cobalt...');
    await downloadFile(videoUrl, outputPath);
    console.log('✅ Cobalt download complete');

    return { success: true, filePath: outputPath };
  } catch (error) {
    try {
      await unlink(outputPath);
    } catch {
      // ignore
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Cobalt download failed',
    };
  }
}

async function getCobaltVideoUrl(url: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      url: url,
      videoQuality: '1080',
    });

    // Используем локальный Cobalt если есть, иначе публичный
    const cobaltHost = process.env.COBALT_API_URL || 'http://localhost:9000';
    const isHttps = cobaltHost.startsWith('https');
    const hostMatch = cobaltHost.match(/^https?:\/\/([^:/]+)(?::(\d+))?/);
    const hostname = hostMatch?.[1] || 'localhost';
    const port = hostMatch?.[2] ? parseInt(hostMatch[2]) : (isHttps ? 443 : 9000);

    const options = {
      hostname,
      port,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const httpModule = isHttps ? https : http;
    const req = httpModule.request(options, (res) => {
      let data = '';

      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data) as CobaltResponse;

          if (parsed.status === 'redirect' || parsed.status === 'tunnel') {
            resolve(parsed.url || null);
          } else if (parsed.status === 'error') {
            reject(new Error(`Cobalt error: ${parsed.error?.code || 'unknown'}`));
          } else {
            resolve(parsed.url || null);
          }
        } catch {
          reject(new Error(`Failed to parse Cobalt response: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Cobalt API timeout'));
    });

    req.write(postData);
    req.end();
  });
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = createWriteStream(outputPath);

    const request = protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          downloadFile(redirectUrl, outputPath).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        file.close();
        reject(err);
      });
    });

    request.on('error', (error) => {
      file.close();
      reject(error);
    });

    request.setTimeout(120000, () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}
