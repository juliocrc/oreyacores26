import { generateFiveDigitCode } from "../code";
import { randomInt } from "crypto";

jest.mock("crypto", () => ({ randomInt: jest.fn(() => 54321) }));

it("generates five-digit codes using cryptographic randomness", () => {
  expect(generateFiveDigitCode()).toBe("54321");
  expect(randomInt).toHaveBeenCalledWith(10000, 100000);
});
