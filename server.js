const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT0 || process.env.PORT || 3000;
function resolveDataFile() {
    try {
        if (fs.existsSync('/data') && fs.statSync('/data').isDirectory()) {
            fs.accessSync('/data', fs.constants.W_OK);
            return '/data/schedule.json';
        }
    } catch (e) {}
    var localDir = path.join(__dirname, 'data');
    try { fs.mkdirSync(localDir, { recursive: true }); } catch (e) {}
    return path.join(localDir, 'schedule.json');
}

const DATA_FILE = resolveDataFile();
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

function sameSecret(a, b) {
    var left = Buffer.from(String(a));
    var right = Buffer.from(String(b));
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

function publicData(data) {
    var copy = Object.assign({}, data);
    delete copy.password;
    return copy;
}

function readBody(req, cb) {
    var body = '';
    req.on('data', function (c) { body += c; });
    req.on('end', function () { cb(body); });
}

http.createServer((req, res) => {
    if (req.url === '/api/data' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(publicData(getData())));
        return;
    }
    if (req.url === '/api/login' && req.method === 'POST') {
        readBody(req, function (body) {
            var parsed = {};
            try { parsed = JSON.parse(body || '{}'); } catch (e) {}
            var stored = getData();
            if (sameSecret(parsed.password, stored.password)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end('{"ok":true}');
            } else {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end('{"ok":false}');
            }
        });
        return;
    }
    if (req.url === '/api/data' && req.method === 'PUT') {
        readBody(req, function (body) {
            try {
                var parsed = JSON.parse(body || '{}');
                var stored = getData();
                if (!sameSecret(parsed.password, stored.password)) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end('{"error":"password"}');
                    return;
                }
                var nextPassword = stored.password;
                if (typeof parsed.newPassword === 'string' && parsed.newPassword.trim()) nextPassword = parsed.newPassword.trim();
                var next = {
                    employees: Array.isArray(parsed.employees) ? parsed.employees : (stored.employees || []),
                    schedule: parsed.schedule && typeof parsed.schedule === 'object' ? parsed.schedule : (stored.schedule || {}),
                    budget: Array.isArray(parsed.budget) ? parsed.budget : (stored.budget || []),
                    cashTypes: parsed.cashTypes && typeof parsed.cashTypes === 'object' ? parsed.cashTypes : (stored.cashTypes || { income: [], expense: [] }),
                    cashlessTypes: parsed.cashlessTypes && typeof parsed.cashlessTypes === 'object' ? parsed.cashlessTypes : (stored.cashlessTypes || { income: [], expense: [] }),
                    password: nextPassword
                };
                fs.writeFileSync(DATA_FILE, JSON.stringify(next));
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
}).listen(PORT, () => console.log('Сервер запущен на порту ' + PORT + ', данные: ' + DATA_FILE));