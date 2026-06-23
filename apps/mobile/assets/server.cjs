const http = require('http');
const fs = require('fs');
const path = require('path');
const port = 5174;
const base = __dirname;
const mime = { '.html':'text/html', '.svg':'image/svg+xml', '.png':'image/png', '.css':'text/css' };
http.createServer((req, res) => {
  const file = path.join(base, req.url === '/' ? '/preview.html' : req.url);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log('Listening on', port));
