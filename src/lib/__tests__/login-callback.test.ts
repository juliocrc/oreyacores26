import { resolveLoginCallback } from "../login-callback";

it.each([null, "https://evil.example", "//evil.example", "/\\evil.example", "/login?callbackUrl=/stock", "/selecionar-tecnico", "/\n/evil.example"])("rejects unsafe or looping callback %j", (value) => {
  expect(resolveLoginCallback(value)).toBe("/");
});

it.each(["/stock?query=a%20b#item", "/agenda", "/stock?query=%bad"])("preserves local callback without decoding it again: %s", (value) => {
  expect(resolveLoginCallback(value)).toBe(value);
});
