import { bot } from './bot.js';

async function main(): Promise<void> {
  console.log('🤖 Starting bot...');

  bot.catch((err) => {
    console.error('Bot error:', err);
  });

  await bot.start({
    onStart: (botInfo) => {
      console.log(`✅ Bot @${botInfo.username} is running!`);
    },
  });
}

main().catch(console.error);

