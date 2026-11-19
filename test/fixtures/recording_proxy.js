/* Test double for a corporate proxy that requires Basic auth. It runs in its own
   process so the sync download path, which blocks the test process in spawnSync,
   can still reach it. Every CONNECT is recorded and refused with 407, so nothing
   leaves the machine. Talks to the parent over the fork IPC channel:
   sends { port } once listening, answers 'dump' with { requests }, exits on 'stop'. */
const http = require('http');

const requests = [];
const server = http.createServer(function (req, res) {
  res.writeHead(405);
  res.end();
});

server.on('connect', function (req, socket) {
  requests.push({ target: req.url, auth: req.headers['proxy-authorization'] || null });
  socket.end('HTTP/1.1 407 Proxy Authentication Required\r\n' +
    'Proxy-Authenticate: Basic realm="corp"\r\n' +
    'Content-Length: 0\r\n' +
    'Connection: close\r\n\r\n');
});

process.on('message', function (msg) {
  if (msg === 'dump') process.send({ requests: requests.splice(0) });
  if (msg === 'stop') server.close(function () { process.exit(0); });
});

server.listen(0, '127.0.0.1', function () {
  process.send({ port: server.address().port });
});
