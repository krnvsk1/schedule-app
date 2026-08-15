const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

// Ваш ID из npoint
const NPOINT_URL = 'https://api.npoint.io/8cda880fbdf5acbaa69e';

app.use(express.json());
// Раздаём файлы из папки public
app.use(express.static(path.join(__dirname, 'public')));

// Отдать данные
app.get('/api/data', async (req, res) => {
    try {
        const response = await fetch(NPOINT_URL);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка загрузки' });
    }
});

// Сохранить данные (сервер отправляет их в npoint, обходя блокировки телефона)
app.put('/api/data', async (req, res) => {
    try {
        await fetch(NPOINT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        res.json({ status: 'ok' });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сохранения' });
    }
});

app.listen(PORT, () => console.log('Сервер запущен на порту ' + PORT));