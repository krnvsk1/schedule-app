const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const NPOINT_URL = 'https://api.npoint.io/8cda880fbdf5acbaa69e';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/data', async (req, res) => {
    try {
        const response = await fetch(NPOINT_URL);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Load error:', err.message);
        res.status(500).json({ error: 'Ошибка загрузки' });
    }
});

app.put('/api/data', async (req, res) => {
    try {
        await fetch(NPOINT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        res.json({ status: 'ok' });
    } catch (err) {
        console.error('Save error:', err.message);
        res.status(500).json({ error: 'Ошибка сохранения' });
    }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log('Сервер запущен на порту ' + PORT));