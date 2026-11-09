import "server-only";
import { createHash } from "node:crypto";

/*
 * GEC v2 adapted from https://github.com/SchneeHertz/node-edge-tts/blob/master/src/drm.ts
 * MIT License, Copyright (c) 2022 SchneeHertz
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export function edgeTtsSignature(token: string, now = Date.now()): string {
  const seconds = BigInt(Math.floor(now / 1000) + 11644473600);
  const ticks = (seconds - seconds % BigInt(300)) * BigInt(10000000);
  const data = Buffer.from(`${ticks}${token}`, "ascii");
  const sha = createHash("sha256")
    .update("Copyright (C) Microsoft Corporation. All rights reserved.", "ascii")
    .update(data).digest();
  const keyA = (sha.readUInt32LE(0) | 1) >>> 0;
  const keyB = (sha.readUInt32LE(4) | 1) >>> 0;
  const factors = [Math.imul(keyA, 0x82893933), Math.imul(keyB, 0x82893933)];
  const coefficients = [
    [0xE82E91B1, 0xB32700D0], [0x44DE24C6, 0x88DFF51D],
    [0x3BEB65BC, 0x29514038], [0xC89C5933, 0xB328CBDF],
    [0x8D1EC211, 0xD405B4D5], [0x314EF5D5, 0x26E55F3C],
    [0xE92491B1, 0x607801C6], [0xF0A5B9D5, 0x82B2C1FB],
    [0x06064CF3, 0xFA51A3DA], [0xDA79FA60, 0x207CC464],
    [0xBED20560, 0x3C3C74F3], [0x89F9C9F8, 0xD2D14B61],
    [0x35FA38C6, 0xBB04A2C1], [0xCB49E3C6, 0xC5626167],
  ];
  const terms = coefficients.map(([coefficient], index) => Math.imul(coefficient, factors[index % 2]) >>> 0);
  const offsets = coefficients.map(([, offset]) => offset);
  const padded = Buffer.alloc(Math.ceil((data.length + 1) / 8) * 8);
  padded.set(data, 1);
  const rotate = (value: number) => ((value << 16) | (value >>> 16)) >>> 0;
  for (let index = 0; index < padded.length / 4; index++) {
    const word = padded.readUInt32LE(index * 4);
    let term = Math.imul(word, index % 2 === 0 ? keyA : keyB);
    let offset = Math.imul(rotate(word), index % 2 === 0 ? 0xEF0569FB : 0xC31713DB);
    if (index === 0) {
      term += Math.imul(0xF2F90B1A, factors[0]);
      offset += 0x0B1A0000;
    }
    terms.push(term >>> 0);
    offsets.push(offset >>> 0);
  }
  let swapAcc = 0;
  let swapLast = 0;
  let state = 0;
  let acc = 0;
  for (let index = 0; index < terms.length; index += 2) {
    const x = terms[index];
    const y = terms[index + 1];
    const first = Math.imul(rotate((offsets[index] + x) >>> 0), 0x76F50F34);
    const second = Math.imul(rotate((offsets[index + 1] + y) >>> 0), 0x1881CE3C);
    swapLast = (Math.imul(rotate(second), 0x35BD1EC9) + second) >>> 0;
    swapAcc = (swapAcc + ((Math.imul(rotate(first), 0xC3EFEA97) + first) >>> 0) + swapLast) >>> 0;
    state = (Math.imul(state, keyA) + x) >>> 0;
    for (const factor of [0xCF98B111, 0x87085B9F, 0x12CEB96D, 0x257E1D83]) {
      state = Math.imul(rotate(state), factor) >>> 0;
    }
    acc += state;
    let next = (Math.imul(state, keyB) + y) >>> 0;
    next = Math.imul(rotate(next), 0xA27416F5) >>> 0;
    next = Math.imul(rotate(next), 0xD38396FF) >>> 0;
    state = Math.imul(rotate(Math.imul(rotate(next), 0x7C932B89)), 0xBFA49F69) >>> 0;
    acc = (acc + state) >>> 0;
  }
  const cs64 = Buffer.alloc(8);
  cs64.writeUInt32LE((swapLast ^ state) >>> 0, 0);
  cs64.writeUInt32LE((swapAcc ^ acc) >>> 0, 4);
  return `${cs64.toString("hex")}-${sha.toString("hex")}`.toUpperCase();
}
