const { dateValue } = require('./certificate-date-2024.cjs');

test('uses the Excel serial rather than the displayed US date', () => {
  expect(dateValue({ A1: { v: 45397, w: '4/15/24' } }, 'A1').value).toBe('2024-04-15');
});
test('interprets textual dates as day/month/year', () => {
  expect(dateValue({ A1: { v: '03/02/2024' } }, 'A1').value).toBe('2024-02-03');
});
test('rejects invalid, missing and ambiguous dates', () => {
  expect(dateValue({ A1: { v: '31/02/2024' } }, 'A1').error).toBeTruthy();
  expect(dateValue({ A1: { v: '4/15/24' } }, 'A1').error).toBeTruthy();
  expect(dateValue({}, 'A1').error).toBeTruthy();
});
