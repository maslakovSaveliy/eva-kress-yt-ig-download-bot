# Eva Kress Bot

Telegram бот для скачивания видео с YouTube и Instagram.

Специально для моей девушки сделал, так что если вам пригодится просто имя поменяйте внутри

## Возможности

- Скачивание видео с YouTube (обычные видео, Shorts, Live)
- Скачивание видео с Instagram (посты, Reels, Stories)
- Автоматическое сжатие видео больше 50MB

## Требования

- Node.js >= 18
- pnpm
- yt-dlp
- ffmpeg

### Установка системных зависимостей (macOS)

```bash
brew install yt-dlp ffmpeg
```

### Установка системных зависимостей (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install ffmpeg
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

## Установка

1. Клонируй репозиторий и установи зависимости:

```bash
pnpm install
```

2. Создай файл `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

3. Получи токен бота у [@BotFather](https://t.me/BotFather) и добавь его в `.env`:

```
BOT_TOKEN=your_bot_token_here
```

## Запуск

### Режим разработки

```bash
pnpm dev
```

### Production

```bash
pnpm build
pnpm start
```

## Использование

1. Найди своего бота в Telegram
2. Отправь команду `/start`
3. Отправь ссылку на видео с YouTube или Instagram
4. Получи видео в ответ

## Поддерживаемые ссылки

### YouTube

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/shorts/VIDEO_ID`
- `https://www.youtube.com/live/VIDEO_ID`

### Instagram

- `https://www.instagram.com/p/POST_ID/`
- `https://www.instagram.com/reel/REEL_ID/`
- `https://www.instagram.com/reels/REEL_ID/`

## Ограничения

- Максимальный размер файла в Telegram: 50MB
- Видео больше 50MB автоматически сжимаются (может занять время)
- Instagram Stories требуют авторизации (не поддерживаются в текущей версии)

## Структура проекта

```
src/
├── index.ts          # Точка входа
├── bot.ts            # Конфигурация бота и хендлеры
├── config.ts         # Конфигурация из .env
├── services/
│   ├── downloader.ts # Скачивание через yt-dlp
│   └── compressor.ts # Сжатие через ffmpeg
└── utils/
    ├── url-parser.ts # Парсинг и валидация URL
    └── file.ts       # Работа с файлами
```

