"use strict";

// Read-only startup gate. Migrations belong to an explicitly approved release.
async function checkRuntimeDatabase(prisma) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await prisma.cliente.findFirst({ select: { id: true, serviceStationId: true } });
    await prisma.stock.findFirst({ select: { id: true, lote: true, quantidadeReservada: true } });
    await prisma.declaracaoIsencaoIva.findFirst({ select: {
      id: true, clienteId: true, navioId: true, snapshotJson: true,
      idempotencyKey: true, pdfAssinadoMeta: true,
    } });
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { checkRuntimeDatabase };

if (require.main === module) {
  const { PrismaClient } = require("@prisma/client");
  checkRuntimeDatabase(new PrismaClient()).catch(() => {
    // Database errors can contain connection details: never print them here.
    console.error("Database compatibility check failed. Review approved migrations before starting.");
    process.exitCode = 1;
  });
}
