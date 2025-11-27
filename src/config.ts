import 'dotenv/config';

interface Config {
  botToken: string;
  tempDir: string;
  maxFileSizeMB: number;
  proxy: string | null;
}

const botToken = process.env.BOT_TOKEN;

if (!botToken) {
  throw new Error('BOT_TOKEN is required. Please set it in .env file');
}

export const config: Config = {
  botToken,
  tempDir: './temp',
  maxFileSizeMB: 50,
  proxy: process.env.PROXY || null,
};

