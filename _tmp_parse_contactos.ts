import fs from "node:fs";
import path from "node:path";
import { loadContactosInternosFromPdf } from "./src/lib/contactos-internos-import";

(async () => {
  const contactos = await loadContactosInternosFromPdf();
  fs.writeFileSync(
    path.join(process.cwd(), "_tmp_contactos_parsed.json"),
    JSON.stringify(contactos, null, 2),
    "utf8"
  );
  console.log("Total parsed:", contactos.length);
  for (const c of contactos) {
    console.log([c.categoria, c.empresa, c.localizacao, c.nome, c.email, c.telemovel, c.telefoneFixo, c.extensaoNos, c.extensaoVodafone].join(" | "));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
