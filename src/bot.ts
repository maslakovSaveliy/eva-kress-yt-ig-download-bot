import { Bot, Context, InputFile } from 'grammy';
import { config } from './config.js';
import { parseVideoUrl, extractUrls } from './utils/url-parser.js';
import { downloadVideo } from './services/downloader.js';
import { compressIfNeeded } from './services/compressor.js';
import { deleteFile, ensureDir } from './utils/file.js';

export const bot = new Bot(config.botToken);

bot.command('start', async (ctx) => {
  await ctx.reply(
    '👋 Привет, Ева! Просто отправь мне ссылку на видео!\n\n' +
      '📹 Поддерживаемые платформы:\n' +
      '• YouTube (видео, shorts, live)\n' +
      '• Instagram (посты, reels, stories)\n\n'
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    '📖 Как пользоваться:\n\n' +
      '1. Скопируй ссылку на видео\n' +
      '2. Отправь её мне\n' +
      '3. Подожди, пока я скачаю и отправлю видео\n\n' +
      '⚠️ Ограничения:\n' +
      '• Максимальный размер файла: 50MB\n' +
      '• Большие видео будут сжаты автоматически'
  );
});

bot.on('message:text', async (ctx) => {
  await handleVideoRequest(ctx);
});

async function handleVideoRequest(ctx: Context): Promise<void> {
  const text = ctx.message?.text;

  if (!text) {
    return;
  }

  const urls = extractUrls(text);

  if (urls.length === 0) {
    await ctx.reply('❌ Не нашёл ссылку в сообщении. Отправь ссылку на YouTube или Instagram видео.');
    return;
  }

  const url = urls[0];
  const parsed = parseVideoUrl(url);

  if (!parsed.isValid) {
    await ctx.reply(
      '❌ Неподдерживаемая ссылка.\n\n' +
        'Поддерживаются:\n' +
        '• YouTube (youtube.com, youtu.be)\n' +
        '• Instagram (instagram.com/p/, /reel/, /reels/)'
    );
    return;
  }

  const statusMessage = await ctx.reply('⏳ Скачиваю видео...');

  try {
    await ensureDir(config.tempDir);

    const downloadResult = await downloadVideo(parsed.url);

    if (!downloadResult.success || !downloadResult.filePath) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMessage.message_id,
        `❌ Не удалось скачать видео: ${downloadResult.error || 'Неизвестная ошибка'}`
      );
      return;
    }

    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMessage.message_id,
      '🔄 Обрабатываю видео...'
    );

    const compressionResult = await compressIfNeeded(downloadResult.filePath);

    if (!compressionResult.success || !compressionResult.filePath) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMessage.message_id,
        `❌ Не удалось обработать видео: ${compressionResult.error || 'Неизвестная ошибка'}`
      );
      await deleteFile(downloadResult.filePath);
      return;
    }

    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMessage.message_id,
      '📤 Отправляю видео...'
    );

    await ctx.replyWithVideo(new InputFile(compressionResult.filePath));

    await ctx.api.deleteMessage(ctx.chat!.id, statusMessage.message_id);

    // Очистка временных файлов
    await deleteFile(downloadResult.filePath);
    if (compressionResult.filePath !== downloadResult.filePath) {
      await deleteFile(compressionResult.filePath);
    }
  } catch (error) {
    console.error('Error processing video:', error);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMessage.message_id,
      '❌ Произошла ошибка при обработке видео. Попробуй ещё раз.'
    );
  }
}

