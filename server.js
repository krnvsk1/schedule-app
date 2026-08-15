const http = require('http');
const fs = require('fs');
const path = require('path');

// Диагностика: выводим ВСЕ переменные Amvera
console.log('PORT =', process.env.PORT);
console.log('ALL ENV:', JSON.stringify(process.env, null, 2));

const PORT = process.env.PORT0 || process.env.PORT || 3000;
const DATA_FILE = '/data/schedule.json';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

function getData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (e) {}
    return { employees: [], schedule: {}, password: '1903' };
}

http.createServer((req, res) => {
    if (req.url === '/api/data' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(getData()));
        return;
    }
    if (req.url === '/api/data' && req.method === 'PUT') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                fs.writeFileSync(DATA_FILE, body);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end('{"status":"ok"}');
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end('{"error":"save"}');
            }
        });
        return;
    }
    let fp = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
    fs.readFile(fp, (err, data) => {
        if (err) {
            fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, d2) => {
                if (e2) { res.writeHead(404); res.end('Not found'); return; }
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(d2);
            });
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' });
        res.end(data);
    });
}).listen(PORT, () => console.log('Сервер запущен на порту ' + PORT));