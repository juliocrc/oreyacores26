const https = require('https');

const data = JSON.stringify({
  clienteNome: "Artur Manuel Santos Arraial Pacheco",
  telefone: "+351911500387",
  jangadaModel: "SEASAVA PLUS R",
  capacidade: "12",
  serial: "4583200300158",
  navioNome: "Pesca Açores",
  dataValidade: "22/10/2026"
});

console.log("[Twilio REST Call] A efetuar chamada VoIP para +351911500387 através do Vercel...");

const req = https.request({
  hostname: 'oreyacoresdeluxe-lh76ha753-juliocrcs-projects.vercel.app',
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
    console.log("[Twilio REST Call] Resposta HTTP:", res.statusCode);
    console.log("[Twilio REST Call] Resposta da API:", body);
  });
});

req.on('error', (error) => {
  console.error("[Twilio REST Call] Erro:", error.message);
});

req.write(data);
req.end();
