const WebSocket = require('ws');
const axios = require('axios');

// Настройки Telegram
const TELEGRAM_TOKEN = '8087924083:AAEPsBIU4QEuW1hv2mQkc-b8EP7H8Qe0FL0';
const CHAT_ID = '440662174';

// Хранилище цен, времени и уведомлений
const tokenData = {};
let PRICE_CHANGE_THRESHOLD = 1;
let CHECK_INTERVAL = 5 * 60 * 1000; // Интервал уведомления: 5 минут

// Функция отправки сообщения в Telegram
async function sendToTelegram(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
    console.log(`Отправка сообщения в Telegram: ${message}`);
    await axios.post(url, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: 'MarkdownV2'
    });
    console.log('Сообщение отправлено в Telegram:', message);
  } catch (error) {
    console.error('Ошибка отправки сообщения:', error.response ? error.response.data.description : error.message);
  }
}

// Получение исторической цены
async function getHistoricalPrice(symbol, periodInMillis) {
  const now = Date.now();
  const startTime = now - periodInMillis;

  try {
    console.log(`Получение исторической цены для ${symbol}...`);
    const response = await axios.get(`https://api.binance.com/api/v3/klines`, {
      params: {
        symbol: symbol,
        interval: '1m',
        startTime: startTime,
        endTime: now,
        limit: 1,
      }
    });

    const historicalPrice = parseFloat(response.data[0][4]); // Закрытая цена
    console.log(`Историческая цена для ${symbol}: ${historicalPrice}`);
    return historicalPrice;
  } catch (error) {
    console.error(`Ошибка получения цены для ${symbol}:`, error);
    return null;
  }
}

// Обновление состояния токенов
function checkTokens() {
  const now = Date.now();

  for (const symbol in tokenData) {
    const { lastNotificationTime, historicalPrice } = tokenData[symbol];
    const timeSinceLastNotify = now - lastNotificationTime;

    if (timeSinceLastNotify >= CHECK_INTERVAL) {
      const currentPrice = tokenData[symbol].currentPrice;
      const priceChangePercent = ((currentPrice - historicalPrice) / historicalPrice) * 100;

      if (priceChangePercent >= PRICE_CHANGE_THRESHOLD) {
        const url = `https://www.binance.com/en/trade/${symbol.slice(0, 3)}${symbol.slice(3).replace('_', '')}`;
        const message = `Binance\n🟢 Long ${symbol}\nЦена ${currentPrice.toFixed(6)}\nПроцент изменился на ${priceChangePercent.toFixed(2)}%\n[Перейти на Binance](${url})`;
        const escapedMessage = message.replace(/\./g, '\\.');

        sendToTelegram(escapedMessage);

        // Обновляем время последнего уведомления
        tokenData[symbol].lastNotificationTime = now;
      }
    }
  }
}

// Запуск проверки каждые 5 минут
setInterval(checkTokens, CHECK_INTERVAL);

// Подключение к WebSocket Binance
const ws = new WebSocket('wss://stream.binance.com:9443/ws/!ticker');

// Обработка сообщений WebSocket
ws.on('message', (data) => {
  const ticker = JSON.parse(data);
  const symbol = ticker.s;

  // Фильтруем монеты, торгующиеся с USDT
  if (!symbol.endsWith('USDT')) return;

  const currentPrice = parseFloat(ticker.c);

  // Проверяем или создаём новую запись для монеты
  if (!tokenData[symbol]) {
    getHistoricalPrice(symbol, CHECK_INTERVAL).then((historicalPrice) => {
      if (historicalPrice) {
        tokenData[symbol] = {
          historicalPrice,
          currentPrice,
          lastNotificationTime: 0
        };
        console.log(`Добавлен токен ${symbol}: Историческая цена ${historicalPrice}`);
      }
    });
  } else {
    // Обновляем текущую цену
    tokenData[symbol].currentPrice = currentPrice;
  }
});

// Обработка ошибок WebSocket
ws.on('error', (error) => {
  console.error('Ошибка WebSocket:', error.message);
});

// Закрытие WebSocket-соединения
ws.on('close', () => {
  console.log('Соединение закрыто. Переподключение...');
  setTimeout(() => {
    process.exit(1); // Перезапуск приложения
  }, 1000);
});
