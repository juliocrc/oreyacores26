const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

// Load OMT structured data
const omtData = JSON.parse(fs.readFileSync('./_tmp_omt_structured.json', 'utf8'));

async function updateShips() {
  console.log('Total entries in OMT data:', omtData.length);
  
  // Get existing ships from DB
  const existingShips = await prisma.navio.findMany({
    select: { id: true, nome: true, matricula: true, proprietario: true }
  });
  const shipMap = new Map();
  existingShips.forEach(s => shipMap.set(s.nome.toLowerCase().trim(), s));
  
  console.log('Existing ships in DB:', existingShips.length);
  
  let updated = 0;
  let created = 0;
  let skipped = 0;
  
  for (const entry of omtData) {
    const { licenca, operador, embarcacao, registo, lotacao } = entry;
    
    if (!embarcacao) {
      skipped++;
      continue;
    }
    
    const shipName = embarcacao.trim();
    const shipLower = shipName.toLowerCase();
    
    let ship;
    
    if (shipMap.has(shipLower)) {
      // Update existing ship
      ship = shipMap.get(shipLower);
      const oldOwner = ship.proprietario;
      
      // Update proprietario to operator if not already set
      const newOwner = operador || oldOwner;
      
      if (newOwner !== oldOwner) {
        await prisma.navio.update({
          where: { id: ship.id },
          data: { proprietario: newOwner }
        });
        updated++;
        console.log(`UPDATE: ${ship.nome} -> proprietario: ${newOwner} (antigo: ${oldOwner})`);
      } else {
        skipped++;
      }
      
      // Also update matricula if changed/available
      if (registo && ship.matricula !== registo) {
        await prisma.navio.update({
          where: { id: ship.id },
          data: { matricula: registo }
        });
        console.log(`  Matrícula atualizada: ${registo}`);
      }
    } else {
      // Create new ship
      // Check if matricula already exists
      const existingByMatricula = await prisma.navio.findFirst({
        where: { matricula: registo }
      });
      
      if (existingByMatricula) {
        // Ship with same matricula exists, update its name
        ship = existingByMatricula;
        shipMap.set(shipLower, ship);
        
        await prisma.navio.update({
          where: { id: ship.id },
          data: { nome: shipName, proprietario: operador }
        });
        console.log(`MATCH by matricula: ${ship.nome} (matricula: ${registo}) -> ${shipName}, owner: ${operador}`);
        updated++;
      } else {
        // Create new ship
        ship = await prisma.navio.create({
          data: {
            nome: shipName,
            matricula: registo || `NEW-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            proprietario: operador,
            tipoPesca: 'Marítimo Turística', // default
            ilha: 'Terceira', // default - could be improved
            estadoNavio: 'ativo'
          }
        });
        created++;
        console.log(`CREATE: ${shipNome} - ${ship.matricula} - proprietario: ${operador}`);
      }
    }
    
    shipMap.set(shipLower, ship);
  }
  
  console.log('\n=== Resumo ===');
  console.log('Atualizados:', updated);
  console.log('Criados:', created);
  console.log('Pulos:', skipped);
  console.log('Total na BD após atualização:', existingShips.length + created);
}

updateShips().catch(e => {
  console.error('Erro:', e);
  process.exit(1);
});