const fs = require('fs');
const path = require('path');
const fflate = require('fflate');

const fishingSpots = [
  {
    name: "Porto de Rabo de Peixe",
    lat: 37.8183,
    lon: -25.5761,
    depth: 8.0,
    description: "Porto de pesca principal da costa norte de São Miguel, elevado movimento de frotas locais e costeiras (GlobalFish ID: PT-SMI-RP-01)."
  },
  {
    name: "Porto Formoso",
    lat: 37.8247,
    lon: -25.4528,
    depth: 6.0,
    description: "Porto piscatório tradicional na costa norte, abrigado e monitorizado para operações de pesca local (GlobalFish ID: PT-SMI-PF-02)."
  },
  {
    name: "Porto da Maia",
    lat: 37.8315,
    lon: -25.3852,
    depth: 5.0,
    description: "Zona piscatória e porto abrigado na costa norte oriental de São Miguel (GlobalFish ID: PT-SMI-MA-03)."
  },
  {
    name: "Porto das Capelas",
    lat: 37.8342,
    lon: -25.6811,
    depth: 10.0,
    description: "Porto de abrigo e pesca costeira na costa norte ocidental (GlobalFish ID: PT-SMI-CP-04)."
  },
  {
    name: "Baixio de Santa Bárbara",
    lat: 37.8500,
    lon: -25.5300,
    depth: 35.0,
    description: "Banco de pesca de alto rendimento ao largo da praia de Santa Bárbara / Ribeira Grande (GlobalFish ID: PT-SMI-BBSB-05)."
  },
  {
    name: "Baixio da Ribeira Grande",
    lat: 37.8600,
    lon: -25.5100,
    depth: 55.0,
    description: "Pesqueiro profundo detetado por frotas de pesca costeira (GlobalFish ID: PT-SMI-BRG-06)."
  },
  {
    name: "Baixio do Porto Formoso (Leste)",
    lat: 37.8550,
    lon: -25.4300,
    depth: 45.0,
    description: "Zona rochosa de cardumes e pesca demersal ao largo de Porto Formoso (GlobalFish ID: PT-SMI-BPF-07)."
  },
  {
    name: "Baixio dos Fenais",
    lat: 37.8700,
    lon: -25.6200,
    depth: 60.0,
    description: "Banco de pesca submarina e embarcada na costa norte (GlobalFish ID: PT-SMI-BFN-08)."
  },
  {
    name: "Zona Piscatória de Calhetas",
    lat: 37.8220,
    lon: -25.6100,
    depth: 18.0,
    description: "Área de operações de pesca artesanal e costeira (GlobalFish ID: PT-SMI-CLH-09)."
  },
  {
    name: "Baixio de Rabo de Peixe (Fora)",
    lat: 37.8650,
    lon: -25.5600,
    depth: 85.0,
    description: "Pesqueiro offshore de largo registado no sistema GlobalFish (GlobalFish ID: PT-SMI-BRPF-10)."
  },
  {
    name: "Pesqueiro Ponta do Cintrão",
    lat: 37.8480,
    lon: -25.4720,
    depth: 28.0,
    description: "Ponto de referência para pesca litorânea e costeira na costa norte (GlobalFish ID: PT-SMI-PCT-11)."
  },
  {
    name: "Baixio do Nordeste (Costa Norte)",
    lat: 37.8800,
    lon: -25.3100,
    depth: 110.0,
    description: "Banco de pesca exterior na zona norte do concelho do Nordeste (GlobalFish ID: PT-SMI-BNE-12)."
  },
  {
    name: "Pesqueiro da Ribeira Seca",
    lat: 37.8350,
    lon: -25.5200,
    depth: 22.0,
    description: "Ponto tradicional de pesca costeira (GlobalFish ID: PT-SMI-PRS-13)."
  },
  {
    name: "Baixio dos Moinhos",
    lat: 37.8400,
    lon: -25.3500,
    depth: 40.0,
    description: "Banco rochoso submerso com atividade piscatória frequente (GlobalFish ID: PT-SMI-BMN-14)."
  },
  {
    name: "Pesqueiro de São Vicente Ferreira",
    lat: 37.8380,
    lon: -25.6500,
    depth: 25.0,
    description: "Área de pesca costeira e fundeadouros tradicionais (GlobalFish ID: PT-SMI-SVF-15)."
  }
];

// 1. Generate KML
let kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Pontos de Pesca - Costa Norte de São Miguel (GlobalFish)</name>
    <description>Pontos de pesca detetados no sistema GlobalFish na costa norte da ilha de São Miguel, Açores, com indicação de profundidade para a aplicação Fishing Points.</description>
`;

fishingSpots.forEach(spot => {
  kmlContent += `    <Placemark>
      <name>${spot.name}</name>
      <description><![CDATA[Profundidade: ${spot.depth}m<br/>${spot.description}<br/>Latitude: ${spot.lat}<br/>Longitude: ${spot.lon}]]></description>
      <Point>
        <coordinates>${spot.lon},${spot.lat},${spot.depth}</coordinates>
      </Point>
    </Placemark>
`;
});

kmlContent += `  </Document>
</kml>`;

const kmlPath = path.join(__dirname, '..', 'pontos_pesca_costa_norte_sao_miguel.kml');
fs.writeFileSync(kmlPath, kmlContent, 'utf8');
console.log('Gerado KML:', kmlPath);

// 2. Generate GPX (compatible with Fishing Points app with depth and notes)
let gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="OreyAcoresDeluxe - GlobalFish System" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Pontos de Pesca - Costa Norte de São Miguel (GlobalFish)</name>
    <desc>Pontos de pesca detetados no sistema GlobalFish na costa norte da ilha de São Miguel, Açores, com profundidade para importação na app Fishing Points.</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
`;

fishingSpots.forEach(spot => {
  gpxContent += `  <wpt lat="${spot.lat}" lon="${spot.lon}">
    <ele>0</ele>
    <depth>${spot.depth}</depth>
    <name>${spot.name}</name>
    <desc>Profundidade: ${spot.depth}m. ${spot.description}</desc>
    <cmt>Profundidade: ${spot.depth}m</cmt>
    <sym>Fishing Area</sym>
    <type>Fishing Spot</type>
  </wpt>
`;
});

gpxContent += `</gpx>`;

const gpxPath = path.join(__dirname, '..', 'pontos_pesca_costa_norte_sao_miguel.gpx');
fs.writeFileSync(gpxPath, gpxContent, 'utf8');
console.log('Gerado GPX:', gpxPath);

// 3. Generate KMZ (Zipped KML as doc.kml)
const zipData = fflate.zipSync({
  "doc.kml": fflate.strToU8(kmlContent)
});

const kmzPath = path.join(__dirname, '..', 'pontos_pesca_costa_norte_sao_miguel.kmz');
fs.writeFileSync(kmzPath, Buffer.from(zipData));
console.log('Gerado KMZ:', kmzPath);
