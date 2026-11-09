import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StockArticleThumbnail from './StockArticleThumbnail';

afterEach(() => jest.restoreAllMocks());

it('renders a lazy, contained catalog photo and a discreet accessible fallback', () => {
  const html = renderToStaticMarkup(<StockArticleThumbnail foto="/catalog/water.jpg" label="WATER" />);
  expect(html).toContain('src="/catalog/water.jpg"');
  expect(html).toContain('alt="Foto de WATER"');
  expect(html).toContain('loading="lazy"');
  expect(html).toContain('object-contain');
  const fallback = renderToStaticMarkup(<StockArticleThumbnail label="WATER" />);
  expect(fallback).toContain('aria-label="Sem imagem de WATER"');
  expect(fallback).not.toContain('<img');
});

it('falls back after a broken image and retries when the catalog URL changes', () => {
  const setFailedSrc = jest.fn();
  const state = jest.spyOn(React, 'useState').mockReturnValue([null, setFailedSrc]);
  const image = StockArticleThumbnail({ foto: '/broken.jpg', label: 'WATER' });
  image.props.onError();
  expect(setFailedSrc).toHaveBeenCalledWith('/broken.jpg');
  state.mockReturnValue(['/broken.jpg', setFailedSrc]);
  expect(StockArticleThumbnail({ foto: '/broken.jpg', label: 'WATER' }).type).toBe('span');
  expect(StockArticleThumbnail({ foto: '/fixed.jpg', label: 'WATER' }).type).toBe('img');
  const fallback = StockArticleThumbnail({ foto: '/broken.jpg', label: 'WATER' });
  const stopPropagation = jest.fn();
  fallback.props.children.props.onClick({ stopPropagation });
  expect(stopPropagation).toHaveBeenCalled();
  expect(setFailedSrc).toHaveBeenLastCalledWith(null);
});
