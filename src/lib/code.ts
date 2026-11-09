import { randomInt } from "crypto";

export function generateFiveDigitCode(): string {
  return String(randomInt(10000, 100000));
}

export function padToFiveDigits(n: number): string {
  return String(n).padStart(5, "0");
}
