import { adjustedForecast90d, forecastOrderDeadline } from '../stock-forecast-planning';

it('never reduces known scheduled demand when consumption history is sparse', () => {
  expect(adjustedForecast90d(100, 0, 0.35)).toBe(100);
  expect(adjustedForecast90d(100, 200, 0.35)).toBe(135);
  expect(adjustedForecast90d(0, 10, 0.35)).toBe(4);
});

it('uses the actual item need date, subtracts lead time and handles month boundaries', () => {
  expect(forecastOrderDeadline(new Date(2026, 2, 2), 15, new Date(2026, 0, 1))).toBe('2026-02-15');
  expect(forecastOrderDeadline(null, 15, new Date(2026, 0, 1))).toBe('2026-01-01');
});
