import { unlink, stat, mkdir, readdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function ensureDir(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

export async function getFileSizeInMB(filePath: string): Promise<number> {
  const stats = await stat(filePath);
  return stats.size / (1024 * 1024);
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    console.error(`Failed to delete file ${filePath}:`, error);
  }
}

export async function cleanupTempFiles(tempDir: string, prefix: string): Promise<void> {
  try {
    const files = await readdir(tempDir);
    const filesToDelete = files.filter((file) => file.startsWith(prefix));

    await Promise.all(
      filesToDelete.map((file) => deleteFile(path.join(tempDir, file)))
    );
  } catch (error) {
    console.error('Failed to cleanup temp files:', error);
  }
}

export async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
      await mkdir(tempDir, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to cleanup temp directory:', error);
  }
}

export function generateTempFilename(prefix: string, extension: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}.${extension}`;
}

