import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

it("never intercepts Navy APIs, Navy pages, or router payloads with stale cache-first data", () => {
  const handlers: Record<string, (event: any) => void> = {};
  runInNewContext(readFileSync(join(process.cwd(), "public/sw.js"), "utf8"), {
    self: { addEventListener: (name: string, handler: (event: any) => void) => { handlers[name] = handler; } }, URL,
  });
  for (const [path, rsc] of [["/api/navios/marinha", false], ["/api/jangadas", false], ["/marinha/esv-hor", false], ["/navios?_rsc=abc", false], ["/navios", true]]) {
    const respondWith = jest.fn();
    handlers.fetch({ request: { method: "GET", url: `https://example.com${path}`, headers: { get: () => rsc ? "1" : null } }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  }
});
