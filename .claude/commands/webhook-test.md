# /webhook-test — Протестировать webhook от WazzUp или UIS локально

## Шаг 1: Экспонировать localhost

```bash
# Вариант 1: ngrok
ngrok http 4000

# Вариант 2: localtunnel
npx localtunnel --port 4000
```

Скопировать публичный URL, прописать его в настройках WazzUp/UIS как webhook URL.

## Шаг 2: Тест WazzUp webhook (входящее сообщение)

```bash
curl -X POST http://localhost:4000/api/webhooks/wazzup \
  -H "Content-Type: application/json" \
  -H "X-Wazzup-Signature: test-skip-verify" \
  -d '{
    "event": "message",
    "chatId": "79001234567",
    "channel": "whatsapp",
    "direction": "in",
    "text": "Добрый день, хочу записаться на курс"
  }'
```

Ожидаемый результат:
- Запись в таблице `messages`
- Socket.io событие `NEW_MESSAGE` в карточке сделки (если привязана)

## Шаг 3: Тест UIS webhook (входящий звонок)

```bash
curl -X POST http://localhost:4000/api/webhooks/uis \
  -H "Content-Type: application/json" \
  -d '{
    "event": "call.started",
    "callId": "uis-123",
    "direction": "in",
    "callerNumber": "79001234567",
    "virtualNumber": "+74951234567"
  }'
```

Проверить в логах backend что событие обработано и запись появилась в таблице `calls`.
