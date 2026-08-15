const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const NPOINT_URL = 'https://api.npoint.io/8cda880fbdf5acbaa69e';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

http.createServer(async (req, res) => {
    if (req.url === '/api/data' && req.method === 'GET') {
        try {
            const r = await fetch(NPOINT_URL);
            const d = await r.json();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(d));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end('{"error":"load"}');
        }
        return;
    }

    if (req.url === '/api/data' && req.method === 'PUT') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
            try {
                await fetch(NPOINT_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: body
                });
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