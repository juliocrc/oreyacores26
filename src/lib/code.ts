export function generateFiveDigitCode(): string {
  // Returns a string with 5 numeric digits between 10000 and 99999
  return String(Math.floor(10000 + Math.random() * 90000));
}

export function padToFiveDigits(n: number): string {
  return String(n).padStart(5, "0");
}
