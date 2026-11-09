import prisma from "@/lib/prisma";
import { readAuditoriaFile, writeAuditoriaJson } from "./auditorias-storage";

export async function saveInspectionSnapshot(certificadoNumero: string, jangadaId: number) {
  try {
    if (!certificadoNumero) return;
    const cleanCertNo = certificadoNumero.replace(/[^a-zA-Z0-9_-]/g, "_");
    
    // Fetch the full liferaft state along with its registered articles
    const jangada = await prisma.jangada.findUnique({
      where: { id: jangadaId },
      include: { 
        artigos: true 
      }
    });

    if (!jangada) return;

    const filepath = `_meta/inspecoes-snapshots/${cleanCertNo}.json`;
    await writeAuditoriaJson(filepath, jangada);
    console.log(`Snapshot saved for inspection certificate ${certificadoNumero}`);
  } catch (error) {
    console.error(`Error saving snapshot for certificate ${certificadoNumero}:`, error);
  }
}

export async function getInspectionSnapshot(certificadoNumero: string, options?: { strict?: boolean }) {
  try {
    if (!certificadoNumero) return null;
    const cleanCertNo = certificadoNumero.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filepath = `_meta/inspecoes-snapshots/${cleanCertNo}.json`;
    
    const file = await readAuditoriaFile(filepath);
    if (!file) return null;
    const snapshot = JSON.parse(file.buffer.toString("utf-8"));
    if (options?.strict && (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))) {
      throw new Error('Invalid inspection snapshot object');
    }
    return snapshot;
  } catch (error) {
    if (options?.strict) throw error;
    console.error(`Error reading snapshot for certificate ${certificadoNumero}:`, error);
    return null;
  }
}

export async function writeInspectionSnapshot(certificadoNumero: string, data: any) {
  try {
    if (!certificadoNumero) return;
    const cleanCertNo = certificadoNumero.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filepath = `_meta/inspecoes-snapshots/${cleanCertNo}.json`;
    await writeAuditoriaJson(filepath, data);
    console.log(`Snapshot archived directly for certificate ${certificadoNumero}`);
  } catch (error) {
    console.error(`Error archiving snapshot for certificate ${certificadoNumero}:`, error);
  }
}
