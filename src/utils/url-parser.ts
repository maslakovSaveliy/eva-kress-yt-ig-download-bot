type VideoSource = 'youtube' | 'instagram' | 'unknown';

interface ParsedUrl {
  isValid: boolean;
  source: VideoSource;
  url: string;
}

const YOUTUBE_PATTERNS = [
  /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+/,
  /^(https?:\/\/)?(www\.)?youtube\.com\/shorts\/[\w-]+/,
  /^(https?:\/\/)?youtu\.be\/[\w-]+/,
  /^(https?:\/\/)?(www\.)?youtube\.com\/live\/[\w-]+/,
];

const INSTAGRAM_PATTERNS = [
  /^(https?:\/\/)?(www\.)?instagram\.com\/(p|reel|reels|tv)\/[\w-]+/,
  /^(https?:\/\/)?(www\.)?instagram\.com\/stories\/[\w.-]+\/\d+/,
];

function detectSource(url: string): VideoSource {
  for (const pattern of YOUTUBE_PATTERNS) {
    if (pattern.test(url)) {
      return 'youtube';
    }
  }

  for (const pattern of INSTAGRAM_PATTERNS) {
    if (pattern.test(url)) {
      return 'instagram';
    }
  }

  return 'unknown';
}

export function parseVideoUrl(text: string): ParsedUrl {
  const trimmedUrl = text.trim();
  const source = detectSource(trimmedUrl);

  return {
    isValid: source !== 'unknown',
    source,
    url: trimmedUrl,
  };
}

export function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}

