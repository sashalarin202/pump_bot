const WebSocket = require('ws');
const axios = require('axios');

// Настройки Telegram
const TELEGRAM_TOKEN = '8087924083:AAEPsBIU4QEuW1hv2mQkc-b8EP7H8Qe0FL0';
const CHAT_ID = '440662174';

// Порог для уведомления
const PRICE_CHANGE_THRESHOLD = 1; // 5%

// Хранилище начальных цен
const initialPrices = {};

// Функция для отправки сообщения в Telegram
async function sendToTelegram(message, parseMode) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: parseMode // передаем parse_mode
    });
    console.log('Сообщение отправлено в Telegram:', message);
  } catch (error) {
    console.error('Ошибка отправки сообщения в Telegram:', error.response.data.description);
  }
}

// Подключение к WebSocket Binance
const ws = new WebSocket('wss://stream.binance.com:9443/ws/!ticker');

// Обработка сообщений WebSocket
ws.on('message', (data) => {
  const ticker = JSON.parse(data);

  const symbol = ticker.s; // Символ монеты (например, BTCUSDT)
  const currentPrice = parseFloat(ticker.c); // Текущая цена монеты

  // Если начальная цена не задана, установить её
  if (!initialPrices[symbol]) {
    initialPrices[symbol] = currentPrice;
    return;
  }

  // Вычисление изменения цены
  const initialPrice = initialPrices[symbol];
  const priceChangePercent = ((currentPrice - initialPrice) / initialPrice) * 100;

  // Если рост цены превышает порог, отправить уведомление
  if (priceChangePercent >= PRICE_CHANGE_THRESHOLD) {
    const message = `
    🚀 Монета ${symbol} выросла на ${priceChangePercent.toFixed(2)}% Текущая цена: ${currentPrice} \n[inline URL](http://www.example.com/)
    `;
    const escapedMessage = message.replace(/\./g, '\\.');
    sendToTelegram(escapedMessage, 'MarkdownV2'); // Добавить 'MarkdownV2' в параметр

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
