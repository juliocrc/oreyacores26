import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { generateDgrmDocx } from '../dgrm-docx';

it('writes the owner once in the last table cell while keeping both template paragraphs', async () => {
  const template = await readFile(join(process.cwd(), 'templates', 'FICHA_DGRM_TEMPLATE.docx'));
  const owner = 'MARCO DANIEL VIEIRA MONIZ';
  const output = await generateDgrmDocx(template, { ownerDisplay: owner, shipName: 'Conde Do Mar', ultimoCertificadoNumero: 'AZ26-059' });
  const zip = await JSZip.loadAsync(output);
  const xml = await zip.file('word/document.xml')!.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const body = doc.getElementsByTagNameNS(ns, 'body')[0];
  const table = Array.from(body.childNodes).find(node => node.localName === 'tbl')!;
  const rows = Array.from(table.childNodes).filter(node => node.localName === 'tr');
  const cells = Array.from(rows[rows.length - 1].childNodes).filter(node => node.localName === 'tc');
  const paragraphs = Array.from(cells[0].childNodes).filter(node => node.localName === 'p');
  expect(paragraphs.map(node => node.textContent)).toEqual([owner, '']);
  expect(xml.split(owner)).toHaveLength(2);
  expect(xml).toContain('Conde Do Mar');
  expect(xml).toContain('AZ26-059');
});
