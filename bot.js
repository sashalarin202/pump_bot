const WebSocket = require('ws');
const axios = require('axios');
const telegramBot = require('node-telegram-bot-api');

// Настройки Telegram
const TELEGRAM_TOKEN = '8087924083:AAEPsBIU4QEuW1hv2mQkc-b8EP7H8Qe0FL0';
const CHAT_ID = '440662174';

// Хранилище цен и временных меток
const historicalPrices = {}; // Храним исторические цены с моментом времени (например, 2 года назад)

let PRICE_CHANGE_THRESHOLD = 4; // Начальный порог
let HISTORY_PERIOD =  60 * 60 * 1000; // 15 минут

// Функция для отправки сообщения с кнопками в Telegram
async function sendToTelegramWithButtons(message, keyboard) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
    console.log(`Отправка сообщения в Telegram: ${message}`);
    await axios.post(url, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: 'MarkdownV2', // Используйте MarkdownV2
      reply_markup: {
        keyboard: keyboard,
        resize_keyboard: true,
        one_time_keyboard: false
      }
    });
    console.log('Сообщение с кнопками отправлено в Telegram:', message);
  } catch (error) {
    console.error('Ошибка отправки сообщения с кнопками в Telegram:', error.response ? error.response.data.description : error.message);
  }
}

// Обработка команды /start и отправка кнопок "Биржа" и "Настройки"
async function sendStartMessage() {
  console.log('Отправка сообщения с кнопками "Биржа" и "Настройки"');
  const keyboard = [
    [{ text: 'Биржа' }, { text: 'Настройки' }],
  ];
  await sendToTelegramWithButtons('Добро пожаловать! Выберите действие:', keyboard);
}

// Отправка панели настроек с процентами 1-9%
async function sendSettings() {
  const keyboard = [];
  for (let i = 1; i <= 9; i++) {
    keyboard.push([{ text: `${i}%` }]);
  }
  keyboard.push([{ text: 'Назад' }]);
  await sendToTelegramWithButtons('Выберите порог изменения цены:', keyboard);
}

// Обработка нажатий на кнопки и установка порога
async function handleButtonPress(text) {
  console.log(`Получена команда: ${text}`);
  if (text === 'Настройки') {
    await sendSettings();
  } else if (text === 'Назад') {
    await sendStartMessage();
  } else if (text.endsWith('%')) {
    PRICE_CHANGE_THRESHOLD = parseInt(text);
    console.log(`Порог изменения цены установлен на ${PRICE_CHANGE_THRESHOLD}%`);
    await sendToTelegramWithButtons(`Порог изменения цены установлен на ${PRICE_CHANGE_THRESHOLD}%`, [
      [{ text: 'Биржа' }, { text: 'Настройки' }],
    ]);
  }
}

// Получение исторической цены для монеты на выбранный момент времени (например, 2 года назад)
async function getHistoricalPrice(symbol, periodInMillis) {
  const now = Date.now();
  const startTime = now - periodInMillis; // Вычисляем время начала (2 года назад)

  try {
    console.log(`Получение исторической цены для ${symbol} за последние 2 года...`);
    const response = await axios.get(`https://api.binance.com/api/v3/klines`, {
      params: {
        symbol: symbol,
        interval: '1m', // 1 день
        startTime: startTime,
        endTime: now,
        limit: 1, // Получаем только одну цену на начало периода
      }
    });

    const historicalPrice = parseFloat(response.data[0][4]); // Закрытая цена (close price) первого дня
    console.log(`Историческая цена для ${symbol}: ${historicalPrice}`);
    return historicalPrice;
  } catch (error) {
    console.error(`Ошибка получения исторической цены для ${symbol}:`, error);
    return null;
  }
}

// Подключение к WebSocket Binance
const ws = new WebSocket('wss://stream.binance.com:9443/ws/!ticker');

// Обработка сообщений WebSocket
ws.on('message', (data) => {
  const ticker = JSON.parse(data);

  const symbol = ticker.s; // Символ монеты (например, BTCUSDT)
  console.log(`Получено обновление для монеты: ${symbol}`);

  // Фильтруем только те монеты, которые торгуются с USDT
  if (!symbol.endsWith('USDT')) {
    console.log(`Монета ${symbol} не торгуется с USDT, пропускаем...`);
    return; // Пропустить символы, не имеющие пары с USDT
  }

  const currentPrice = parseFloat(ticker.c); // Текущая цена монеты

  // Если историческая цена ещё не задана, получаем её
  if (!historicalPrices[symbol]) {
    console.log(`Историческая цена для ${symbol} ещё не загружена. Запрос на получение...`);
    getHistoricalPrice(symbol, HISTORY_PERIOD).then((historicalPrice) => {
      if (historicalPrice) {
        historicalPrices[symbol] = historicalPrice;

        // Сравниваем изменения цены
        const priceChangePercent = ((currentPrice - historicalPrice) / historicalPrice) * 100;

        // Если изменение цены превышает порог, отправляем уведомление
        if (priceChangePercent >= PRICE_CHANGE_THRESHOLD) {
          const url = `https://www.binance.com/en/trade/${symbol.slice(0, 3)}${symbol.slice(3).replace('_', '')}`;
          const message = `Binance\n🟢Long ${symbol}\nЦена ${currentPrice.toFixed(6)}\nПроцент изменился на ${priceChangePercent.toFixed(2)}%\n[Перейти на Binance](${url})`;
          const escapedMessage = message.replace(/\./g, '\\.');
          sendToTelegramWithButtons(escapedMessage, [
            [{ text: 'Биржа' }, { text: 'Настройки' }],
          ]);
        }
      }
    });
  }
});

// Обработка ошибок WebSocket
ws.on('error', (error) => {
  console.error('Ошибка WebSocket:', error.message);
});

// Закрытие WebSocket-соединения
ws.on('close', () => {
  console.log('Соединение с WebSocket закрыто. Переподключение...');
  setTimeout(() => {
    process.exit(1); // Перезапуск приложения
  }, 1000);
});

// Обработка сообщений от пользователя (например, через Telegram API)
const bot = new telegramBot(TELEGRAM_TOKEN, { polling: true });

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  console.log('Получена команда /start от пользователя:', chatId);
  sendStartMessage();
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  console.log(`Получено сообщение от пользователя: ${text}`);
  handleButtonPress(text);
});
