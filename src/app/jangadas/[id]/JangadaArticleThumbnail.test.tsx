import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import JangadaArticleThumbnail from './JangadaArticleThumbnail';

afterEach(() => jest.restoreAllMocks());

it('renders a lazy catalogue thumbnail with contained proportions and no editing controls', () => {
  const html = renderToStaticMarkup(<JangadaArticleThumbnail photo="/stock/light.jpg" name="Luz Interior" />);
  expect(html).toContain('src="/stock/light.jpg"');
  expect(html).toContain('Foto de catalogo: Luz Interior');
  expect(html).toContain('loading="lazy"');
  expect(html).toContain('object-contain');
  expect(html).not.toMatch(/<button|<input|<a /);
});

it('shows a discreet fallback for absent and failed images and retries a new selection', () => {
  expect(renderToStaticMarkup(<JangadaArticleThumbnail photo={null} name="HRU" />)).not.toContain('<img');
  const setter = jest.fn();
  jest.spyOn(React, 'useState').mockImplementation(() => ['/broken.jpg', setter] as any);
  expect(renderToStaticMarkup(<JangadaArticleThumbnail photo="/broken.jpg" name="HRU" />)).not.toContain('<img');
  const node = JangadaArticleThumbnail({ photo: '/new.jpg', name: 'HRU' });
  const image = node.props.children as React.ReactElement<{ onError: () => void }>;
  image.props.onError();
  expect(setter).toHaveBeenCalledWith('/new.jpg');
});
