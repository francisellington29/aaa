const express = require('express');
const fs = require('fs');
const http = require('http'); // 确保导入http模块
const path = require('path');
const net = require('net');
const { WebSocket, createWebSocketStream } = require('ws');
const { TextDecoder } = require('util');

const uuid = (process.env.UUID || 'a2c31913-c840-45f1-85a3-b657379427ea').replace(/-/g, "");
const port = process.env.PORT || 3000;
const seconds = parseInt(process.env.SECONDS, 10) || 10; // 默认每2分钟访问一次

// 将秒数转换为毫秒数
const intervalInMilliseconds = seconds * 1000;

// 创建Express应用程序
const app = express();

// Serve the index.html file
app.get('/', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'index.html');
    const data = await readFileAsync(filePath);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  } catch (err) {
    res.status(500).send('Internal Server Error');
    console.error('Error reading HTML file:', err);
  }
});

// 启动Express应用并创建HTTP服务器
const httpServer = app.listen(port, () => {
  console.log('Express server listening on port:', port);
});

// 创建WebSocket服务器，并将其绑定到HTTP服务器
const wss = new WebSocket.Server({ server: httpServer }, () => {
  console.log('WebSocket server listening on port:', port);
});

wss.on('connection', ws => {
  console.log("on connection");
  ws.once('message', msg => {
    const [VERSION] = msg;
    const id = msg.slice(1, 17);
    if (!id.every((v, i) => v == parseInt(uuid.substr(i * 2, 2), 16))) return;
    let i = msg.slice(17, 18).readUInt8() + 19;
    const port = msg.slice(i, i += 2).readUInt16BE(0);
    const ATYP = msg.slice(i, i += 1).readUInt8();
    const host = ATYP == 1 ? msg.slice(i, i += 4).join('.') : // IPV4
      (ATYP == 2 ? new TextDecoder().decode(msg.slice(i + 1, i += 1 + msg.slice(i, i + 1).readUInt8())) : // domain
        (ATYP == 3 ? msg.slice(i, i += 16).reduce((s, b, i, a) => (i % 2 ? s.concat(a.slice(i - 1, i + 1)) : s), []).map(b => b.readUInt16BE(0).toString(16)).join(':') : '')); // ipv6

    console.log('conn:', host, port);
    ws.send(new Uint8Array([VERSION, 0]));
    const duplex = createWebSocketStream(ws);
    net.connect({ host, port }, function () {
      this.write(msg.slice(i));
      duplex.on('error', err => console.error('E1:', err)).pipe(this).on('error', err => console.error('E2:', err)).pipe(duplex);
    }).on('error', err => console.error('Conn-Err:', { host, port }, err));
  }).on('error', err => console.error('EE:', err));
});

// 封装读取文件的函数
const readFileAsync = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

// 定时访问功能
setInterval(function () {
  try {
    http.get(`http://127.0.0.1:${port}/`, function (res) {
      console.log('Received response: ' + res.statusCode);
    }).on('error', function (err) {
      console.error('Error: ' + err.message);
    });
  } catch (err) {
    console.error('Unexpected error: ' + err.message);
  }
}, intervalInMilliseconds);
