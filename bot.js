const WebSocket = require('ws');
const axios = require('axios');

// Настройки Telegram
const TELEGRAM_TOKEN = '8087924083:AAEPsBIU4QEuW1hv2mQkc-b8EP7H8Qe0FL0';
const CHAT_ID = '440662174';

// Хранилище начальных цен и порога изменения
const initialPrices = {};
let PRICE_CHANGE_THRESHOLD = 1; // Начальный порог

// Функция для отправки сообщения с кнопками в Telegram
async function sendToTelegramWithButtons(message, keyboard) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
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
    console.error('Ошибка отправки сообщения с кнопками в Telegram:', error.response.data.description);
  }
}

// Обработка команды /start и отправка кнопок "Биржа" и "Настройки"
async function sendStartMessage() {
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
  if (text === 'Настройки') {
    await sendSettings();
  } else if (text === 'Назад') {
    await sendStartMessage();
  } else if (text.endsWith('%')) {
    PRICE_CHANGE_THRESHOLD = parseInt(text);
    await sendToTelegramWithButtons(`Порог изменения цены установлен на ${PRICE_CHANGE_THRESHOLD}%.`, [
      [{ text: 'Биржа' }, { text: 'Настройки' }],
    ]);
  }
}

// Подключение к WebSocket Binance
const ws = new WebSocket('wss://stream.binance.com:9443/ws/!ticker');

// Обработка сообщений WebSocket
ws.on('message', (data) => {
  const ticker = JSON.parse(data);

  const symbol = ticker.s; // Символ монеты (например, BTCUSDT)
  
  // Фильтруем только те монеты, которые торгуются с USDT
  if (!symbol.endsWith('USDT')) {
    return; // Пропустить символы, не имеющие пары с USDT
  }

  const currentPrice = parseFloat(ticker.c); // Текущая цена монеты

  // Если начальная цена не задана, установить её
  if (!initialPrices[symbol]) {
    initialPrices[symbol] = currentPrice;
    return;
  }

  // Вычисление изменения цены
  const initialPrice = initialPrices[symbol];
  const priceChangePercent = ((currentPrice - initialPrice) / initialPrice) * 100;

  // Если рост цены превышает порог, отправить уведомление с кнопками
  if (priceChangePercent >= PRICE_CHANGE_THRESHOLD) {
    // Формирование URL для пары на Binance
    const url = `https://www.binance.com/en/trade/${symbol.slice(0, 3)}_${symbol.slice(3)}`;
    
    // Формирование сообщения с гиперссылкой на Binance
    const message = `Binance\n🟢Long ${symbol}\nЦена ${currentPrice.toFixed(6)}\nПроцент изменился на ${priceChangePercent.toFixed(2)}%\n[Перейти на Binance](${url})`;
    const escapedMessage = message.replace(/\./g, '\\.');
    sendToTelegramWithButtons(escapedMessage, [
      [{ text: 'Биржа' }, { text: 'Настройки' }],
    ]);

    // Обновить начальную цену, чтобы избежать дублирования уведомлений
    initialPrices[symbol] = currentPrice;
  }
});

// Обработка ошибок WebSocket
ws.on('error', (error) => {
  console.error('Ошибка WebSocket:', error.message);
});

ws.on('close', () => {
  console.log('Соединение с WebSocket закрыто. Переподключение...');
  setTimeout(() => {
    process.exit(1); // Перезапуск приложения
  }, 1000);
});

// Обработка сообщений от пользователя (например, через Telegram API)
const telegramBot = require('node-telegram-bot-api');
const bot = new telegramBot(TELEGRAM_TOKEN, { polling: true });

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  sendStartMessage();
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  handleButtonPress(text);
});
