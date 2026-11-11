import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { canonicalizeCylinderSistema } from '../text-normalization';
import LeafieldGuidance from '@/components/jangadas/LeafieldGuidance';

it('preserves explicitly selected Leafield variants and keeps legacy values generic', () => {
  expect(canonicalizeCylinderSistema('LEAFIELD CUTTER')).toBe('LEAFIELD CUTTER');
  expect(canonicalizeCylinderSistema('LEAFIELD GIST TORSIONAL')).toBe('LEAFIELD GIST TORSIONAL');
  expect(canonicalizeCylinderSistema('LEAFIELD COM MANÓMETRO')).toBe('LEAFIELD COM MANÓMETRO');
  expect(canonicalizeCylinderSistema('LEAFIELD')).toBe('LEAFIELD');
});
it('warns that generic systems need confirmation without inferring compatibility', () => {
  expect(renderToStaticMarkup(<LeafieldGuidance sistema="LEAFIELD" />)).toContain('não está confirmado');
  expect(renderToStaticMarkup(<LeafieldGuidance sistema="LEAFIELD CUTTER" />)).toContain('LEAFIELD CUTTER');
  expect(renderToStaticMarkup(<LeafieldGuidance sistema="THANNER" />)).toBe('');
});
it('only displays torsional torque references for the explicitly identified system', () => {
  expect(renderToStaticMarkup(<LeafieldGuidance sistema="LEAFIELD GIST TORSIONAL" />)).toContain('12,2 Nm');
  expect(renderToStaticMarkup(<LeafieldGuidance sistema="LEAFIELD" />)).not.toContain('12,2 Nm');
  expect(renderToStaticMarkup(<LeafieldGuidance sistema="LEAFIELD CUTTER" />)).not.toContain('12,2 Nm');
});
