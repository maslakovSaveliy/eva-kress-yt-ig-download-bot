import { Bot, Context, InputFile } from 'grammy';
import { config } from './config.js';
import { parseVideoUrl, extractUrls } from './utils/url-parser.js';
import { downloadVideo } from './services/downloader.js';
import { compressIfNeeded } from './services/compressor.js';
import { deleteFile, ensureDir, cleanupTempDir } from './utils/file.js';

export const bot = new Bot(config.botToken);

// Логируем все входящие апдейты
bot.use(async (ctx, next) => {
  console.log('📩 Update received:', ctx.update.update_id, ctx.message?.text || ctx.update);
  await next();
});

bot.command('start', async (ctx) => {
  console.log('🚀 /start command from:', ctx.from?.username || ctx.from?.id);
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

bot.on('message:text', (ctx) => {
  // Запускаем обработку в фоне, чтобы не блокировать другие сообщения
  handleVideoRequest(ctx).catch((err) => {
    console.error('Unhandled error in handleVideoRequest:', err);
  });
});

async function handleVideoRequest(ctx: Context): Promise<void> {
  const text = ctx.message?.text;

  if (!text) {
    return;
  }

  const urls = extractUrls(text);

  if (urls.length === 0) {
    return; // Просто игнорируем сообщения без ссылок
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

  console.log('📥 Starting download:', parsed.url);
  const statusMessage = await ctx.reply('⏳ Скачиваю видео...');

  try {
    await ensureDir(config.tempDir);

    const downloadResult = await downloadVideo(parsed.url);
    console.log('📥 Download result:', downloadResult.success, downloadResult.error || '');

    if (!downloadResult.success || !downloadResult.filePath) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b9572309-fd2d-429b-87b0-15b0e9c67957',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bot.ts:80',message:'Download failed - error details',data:{url:parsed.url,errorLength:downloadResult.error?.length,errorPreview:downloadResult.error?.substring(0,200),hasNoVideoFormats:downloadResult.error?.includes('No video formats found')},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B,C'})}).catch(()=>{});
      // #endregion
      
      // Обрезаем длинные сообщения об ошибках (лимит Telegram 4096 символов)
      const errorMsg = downloadResult.error || 'Неизвестная ошибка';
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b9572309-fd2d-429b-87b0-15b0e9c67957',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bot.ts:86',message:'Error message length check',data:{originalLength:errorMsg.length,willTruncate:errorMsg.length>200},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      const shortError = errorMsg.length > 200 ? errorMsg.substring(0, 200) + '...' : errorMsg;
      const fullMessage = `❌ Не удалось скачать видео: ${shortError}`;
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b9572309-fd2d-429b-87b0-15b0e9c67957',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bot.ts:92',message:'Final message to send',data:{messageLength:fullMessage.length,maxAllowed:4096},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMessage.message_id,
        fullMessage
      );
      return;
    }

    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMessage.message_id,
      '🔄 Обрабатываю видео...'
    );

    const compressionResult = await compressIfNeeded(downloadResult.filePath);
    console.log('🗜️ Compression result:', compressionResult.success);

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
    console.log('✅ Video sent successfully');

    // Очистка временных файлов
    await deleteFile(downloadResult.filePath);
    if (compressionResult.filePath !== downloadResult.filePath) {
      await deleteFile(compressionResult.filePath);
    }
  } catch (error) {
    console.error('❌ Error processing video:', error);
    try {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        statusMessage.message_id,
        '❌ Произошла ошибка при обработке видео. Попробуй ещё раз.'
      );
    } catch {
      // Игнорируем ошибку редактирования
    }
  } finally {
    // Гарантированная очистка temp папки после каждого запроса
    await cleanupTempDir(config.tempDir);
    console.log('🧹 Temp folder cleaned');
  }
}

