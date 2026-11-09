import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import InflationHoseGuidance from '@/components/jangadas/InflationHoseGuidance';
import { inflationHoseManualDetails } from '../inflation-hose-manual';

it('maps only the documented Leafield hose to its required unions', () => {
  expect(inflationHoseManualDetails('08718009')?.adapters).toEqual(['08719009', '08203009']);
  expect(inflationHoseManualDetails('08255009')?.adapters).toEqual(['08719009']);
  expect(inflationHoseManualDetails('unknown')).toBeNull();
});
it('uses the linked stock manufacturer code and does not guess an ambiguous code', () => {
  const stock = [{ referencia: 'LOCAL', codigoFabricante: '08255009' }];
  expect(renderToStaticMarkup(<InflationHoseGuidance upper="LOCAL" stock={stock} />)).toContain('08719009');
  expect(renderToStaticMarkup(<InflationHoseGuidance upper="LOCAL" stock={[...stock, { referencia: 'LOCAL', codigoFabricante: '08718009' }]} />)).toContain('sem correspondência manual inequívoca');
});
it('shows the valves actually recorded without assigning unrecorded ones', () => {
  const html = renderToStaticMarkup(<InflationHoseGuidance relief="VAL-01" stock={[]} />);
  expect(html).toContain('VAL-01');
  expect(html).toContain('não identificada');
  expect(html).toContain('não uma atribuição automática');
});
