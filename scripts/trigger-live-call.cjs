const http = require('http');

const data = JSON.stringify({
  clienteNome: "Artur Manuel Santos Arraial Pacheco",
  telefone: "+351911500387",
  jangadaModel: "SEASAVA PLUS R",
  capacidade: "12",
  serial: "4583200300158",
  navioNome: "Pesca Açores",
  dataValidade: "22/10/2026"
});

console.log("[Twilio Live Call] A disparar chamada de voz REST para +351911500387...");

const req = http.request({
  hostname: 'localhost',
  port: 3003,
  path: '/api/comunicacoes/voip-call',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log("[Twilio Live Call] Resposta da API:", body);
  });
});

req.on('error', (error) => {
  console.error("[Twilio Live Call] Erro de ligação:", error.message);
});

req.write(data);
req.end();
