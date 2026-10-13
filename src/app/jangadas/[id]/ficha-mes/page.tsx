import React from "react";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import PrintPageButton from "@/components/shared/PrintPageButton";

export const dynamic = "force-dynamic";

function fmtDate(v?: string | null): string {
  if (!v) return "";
  const iso = v.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
  return v;
}

function fmtMonth(v?: string | null): string {
  if (!v) return "";
  const m = /^(\d{4})-(\d{2})$/.exec(v.slice(0, 7));
  if (m) return `${m[2]}/${m[1]}`;
  return v;
}

function fmtArtigoValidade(v?: Date | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function testMark(v?: string | null): "yes" | "no" | "" {
  const s = (v || "").trim().toUpperCase();
  if (s === "PASSOU" || s === "OK" || s === "SIM") return "yes";
  if (s === "REPROVOU" || s === "FAIL" || s === "NÃO" || s === "NAO") return "no";
  return "";
}

function Mtw(v?: string | null, suffix = "Mt"): string {
  if (!v || !String(v).trim()) return "";
  const s = String(v).trim();
  return /[a-zA-Z]/.test(s) ? s : `${s} ${suffix}`;
}

function Val({ v, w }: { v?: string | null; w?: string }) {
  const text = v && String(v).trim() ? String(v) : "";
  return (
    <span
      className="inline-block min-w-[3ch] border-b border-dotted border-slate-400 px-1 align-bottom"
      style={{ minWidth: w || "3ch" }}
    >
      {text || "\u00A0"}
    </span>
  );
}

function CheckCell({ mark }: { mark: "yes" | "no" | "" }) {
  return (
    <span className="inline-block w-4 text-center font-bold">
      {mark === "yes" ? "X" : mark === "no" ? "\u2014" : ""}
    </span>
  );
}

function SectionTitle({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 mb-1 bg-slate-200 px-2 py-[2px] text-[9px] font-bold uppercase tracking-wide text-slate-800">
      {n}. {children}
    </div>
  );
}

function PageHeader({ page, total, stationNo, certNo, dateStr }: {
  page: number;
  total: number;
  stationNo: string;
  certNo: string;
  dateStr: string;
}) {
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between border-b-2 border-slate-800 pb-[3px]">
        <div className="text-[12px] font-black uppercase tracking-wide text-slate-900">
          Survitec Zodiac
        </div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-800">
          Liferaft Test and Survey Report
        </div>
        <div className="text-[9px] font-semibold text-slate-600">PAGE No {page}/{total}</div>
      </div>
      <div className="mt-[3px] flex flex-wrap gap-x-6 gap-y-1 text-[9px] text-slate-700">
        <span>Date: <Val v={dateStr} w="7ch" /></span>
        <span>Station N°: <Val v={stationNo} w="7ch" /></span>
        <span>REINSPECTION CERTIFICATE N°: <Val v={certNo} w="10ch" /></span>
      </div>
    </div>
  );
}

function PageFooter() {
  return (
    <div className="mt-2 text-right text-[8px] italic text-slate-400">Ed.03-2020</div>
  );
}

export default async function JangadaFichaMesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId)) notFound();

  const jangada = await prisma.jangada.findUnique({
    where: { id: numericId },
    include: { serviceStation: true, artigos: { orderBy: { name: "asc" } } },
  });
  if (!jangada) notFound();

  const navio = jangada.shipId
    ? await prisma.navio.findUnique({ where: { id: jangada.shipId }, include: { cliente: true } })
    : null;

  const certNo = jangada.ultimoCertificadoNumero || jangada.certificadoExternoNumero || "";
  const stationNo = jangada.serviceStation?.codigo || "";
  const dateStr = fmtDate(jangada.dataInspecao);
  const shipName = navio?.nome || jangada.shipNameManual || "";
  const owner = navio?.proprietario || navio?.cliente?.nome || jangada.owner || "";
  const typeOfRaft = jangada.launchType || jangada.model || "";
  const artigos = jangada.artigos || [];

  const tNAP = testMark(jangada.testeNAP);
  const tGI = testMark(jangada.testeGI);
  const tFS = testMark(jangada.testeFS);
  const tDL = testMark(jangada.testeDL);
  const tWP = testMark(jangada.testeWP);

  return (
    <div className="bg-white text-slate-900 min-h-screen font-sans">
      <div className="fixed top-4 right-4 print:hidden">
        <PrintPageButton />
      </div>

      <div className="mx-auto p-6 print:p-0" style={{ maxWidth: "21cm" }}>
        {/* ============================ PAGE 1 ============================ */}
        <section className="mb-6 bg-white p-6 print:mb-0 print:p-0" style={{ breakAfter: "page" }}>
          <PageHeader page={1} total={3} stationNo={stationNo} certNo={certNo} dateStr={dateStr} />

          {/* Identification grid */}
          <table className="w-full border-collapse text-[9px]">
            <tbody>
              <tr>
                <td className="w-[16%] py-[3px] pr-2 font-semibold text-slate-600">Type of liferaft</td>
                <td className="w-[34%] py-[3px] pr-2"><Val v={typeOfRaft} w="18ch" /></td>
                <td className="w-[16%] py-[3px] pr-2 font-semibold text-slate-600">Ship name</td>
                <td className="w-[34%] py-[3px]"><Val v={shipName} w="22ch" /></td>
              </tr>
              <tr>
                <td className="py-[3px] pr-2 font-semibold text-slate-600">Capacity</td>
                <td className="py-[3px] pr-2"><Val v={jangada.capacity != null ? String(jangada.capacity) : ""} w="8ch" /></td>
                <td className="py-[3px] pr-2 font-semibold text-slate-600">Owner</td>
                <td className="py-[3px]"><Val v={owner} w="22ch" /></td>
              </tr>
              <tr>
                <td className="py-[3px] pr-2 font-semibold text-slate-600">Serial n°</td>
                <td className="py-[3px] pr-2"><Val v={jangada.serial} w="18ch" /></td>
                <td className="py-[3px] pr-2 font-semibold text-slate-600">Flag state</td>
                <td className="py-[3px]"><Val v={navio?.bandeira} w="18ch" /></td>
              </tr>
              <tr>
                <td className="py-[3px] pr-2 font-semibold text-slate-600">Pack</td>
                <td className="py-[3px] pr-2"><Val v={jangada.packType} w="12ch" /></td>
                <td className="py-[3px] pr-2 font-semibold text-slate-600">IMO N°</td>
                <td className="py-[3px]"><Val v={navio?.imo} w="12ch" /></td>
              </tr>
              <tr>
                <td className="py-[3px] pr-2 font-semibold text-slate-600">Date of Manufacture</td>
                <td className="py-[3px] pr-2"><Val v={fmtDate(jangada.dataFabrico) || jangada.dataFabrico} w="10ch" /></td>
                <td className="py-[3px] pr-2 font-semibold text-slate-600">Last service</td>
                <td className="py-[3px]"><Val v="" w="10ch" /></td>
              </tr>
              <tr>
                <td className="py-[3px] pr-2 font-semibold text-slate-600">Painter Line length</td>
                <td className="py-[3px] pr-2"><Val v={Mtw(jangada.painterLength)} w="10ch" /></td>
                <td className="py-[3px] pr-2 font-semibold text-slate-600">By station n°</td>
                <td className="py-[3px]"><Val v="" w="10ch" /></td>
              </tr>
              <tr>
                <td className="py-[3px] pr-2 font-semibold text-slate-600">Stowage height</td>
                <td className="py-[3px] pr-2"><Val v={Mtw(jangada.maxStowageHeight)} w="10ch" /></td>
                <td className="py-[3px] pr-2 font-semibold text-slate-600">Last certificate n°</td>
                <td className="py-[3px]"><Val v="" w="14ch" /></td>
              </tr>
            </tbody>
          </table>

          {/* MES SIS info block */}
          <div className="mt-2 border border-slate-300 p-2 text-[9px]">
            <div className="font-semibold text-slate-600">Information if MES SIS raft (mini slide)</div>
            <div className="mt-1 grid grid-cols-4 gap-x-6 gap-y-1">
              <span>Position of container on board</span>
              <span>Left <Val v="" w="5ch" /> Right <Val v="" w="5ch" /></span>
              <span>Port side <Val v="" w="5ch" /> Starboard <Val v="" w="5ch" /></span>
              <span>Firing Line Length (if EBL) <Val v="" w="7ch" /></span>
              <span className="col-span-3">Mooring Springs Position for SIS slide connection</span>
              <span>1 | 2 | 3 | 4 | 5 | 6</span>
            </div>
          </div>

          <SectionTitle n="1">Blast test on inflation hoses</SectionTitle>
          <div className="text-[9px]">Result: <Val v="" w="6ch" /></div>

          <SectionTitle n="2">Overpressure valves *</SectionTitle>
          <table className="w-full border-collapse text-[8px]">
            <thead>
              <tr className="text-slate-600">
                <th className="border border-slate-300 px-1 py-[2px] text-left">Start / End</th>
                <th className="border border-slate-300 px-1 py-[2px]">UP/F1</th>
                <th className="border border-slate-300 px-1 py-[2px]">LOW/F2</th>
                <th className="border border-slate-300 px-1 py-[2px]">F3</th>
                <th className="border border-slate-300 px-1 py-[2px]">F4</th>
                <th className="border border-slate-300 px-1 py-[2px]">F5</th>
                <th className="border border-slate-300 px-1 py-[2px]">F6</th>
                <th className="border border-slate-300 px-1 py-[2px]">A1</th>
                <th className="border border-slate-300 px-1 py-[2px]">A2</th>
                <th className="border border-slate-300 px-1 py-[2px]">A3</th>
                <th className="border border-slate-300 px-1 py-[2px]">A4</th>
                <th className="border border-slate-300 px-1 py-[2px]">A5</th>
                <th className="border border-slate-300 px-1 py-[2px]">A6</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 px-1 py-[2px]">Opening</td>
                {Array.from({ length: 12 }).map((_, i) => (
                  <td key={i} className="border border-slate-300 px-1 py-[2px] text-center">&nbsp;</td>
                ))}
              </tr>
              <tr>
                <td className="border border-slate-300 px-1 py-[2px]">Reset</td>
                {Array.from({ length: 12 }).map((_, i) => (
                  <td key={i} className="border border-slate-300 px-1 py-[2px] text-center">&nbsp;</td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="mt-[2px] text-[7px] italic text-slate-500">
            * Opening/reset pressures of the over pressure valves according to the color of the dot on the valve.
            Refer to Manual MS003, page 4 in PART I - Controls, Solas Tests.
          </p>

          <div className="mt-2 border border-slate-300 p-2 text-[8px]">
            <div className="font-semibold text-slate-600">LIFERAFT FITTED WITH ASPIRATOR: ASPIRATOR PROTECTIVE TUBE</div>
            <table className="mt-1 w-full border-collapse">
              <tbody>
                <tr>
                  <td className="px-1 py-[2px]">Overpressure valves test</td>
                  <td className="px-1 py-[2px]">Upper opening (max 296) <Val v={jangada.testePressaoCamaraSuperior} w="5ch" /></td>
                  <td className="px-1 py-[2px]">Upper reset (min 206) <Val v="" w="5ch" /></td>
                  <td className="px-1 py-[2px]">Lower opening (max 296) <Val v={jangada.testePressaoCamaraInferior} w="5ch" /></td>
                  <td className="px-1 py-[2px]">Lower reset (min 206) <Val v="" w="5ch" /></td>
                </tr>
              </tbody>
            </table>
          </div>

          <SectionTitle n="3">Working pressure test (WP test) — Tolerance 5% of start pressure</SectionTitle>
          <table className="w-full border-collapse text-[8px]">
            <tbody>
              <tr>
                <td className="border border-slate-300 px-1 py-[2px]">Time</td>
                <td className="border border-slate-300 px-1 py-[2px]">Star <Val v={jangada.testeWPHoraInicio} w="6ch" /></td>
                <td className="border border-slate-300 px-1 py-[2px]">End <Val v={jangada.testeWPHoraFim} w="6ch" /></td>
                <td className="border border-slate-300 px-1 py-[2px]">Temperature</td>
                <td className="border border-slate-300 px-1 py-[2px]">T1 <Val v={jangada.testeWPTemperaturaInicial} w="6ch" /></td>
                <td className="border border-slate-300 px-1 py-[2px]">T2 <Val v={jangada.testeWPTemperaturaFinal} w="6ch" /></td>
                <td className="border border-slate-300 px-1 py-[2px]">Atm. pressure</td>
                <td className="border border-slate-300 px-1 py-[2px]">P1 <Val v={jangada.testeWPPressaoAtmosfericaInicial} w="6ch" /></td>
                <td className="border border-slate-300 px-1 py-[2px]">P2 <Val v={jangada.testeWPPressaoAtmosfericaFinal} w="6ch" /></td>
              </tr>
            </tbody>
          </table>
          <table className="mt-1 w-full border-collapse text-[8px]">
            <thead>
              <tr className="text-slate-600">
                <th className="border border-slate-300 px-1 py-[2px]">Chamber</th>
                <th className="border border-slate-300 px-1 py-[2px]">Start</th>
                <th className="border border-slate-300 px-1 py-[2px]">End</th>
                <th className="border border-slate-300 px-1 py-[2px]">Result (drop)</th>
                <th className="border border-slate-300 px-1 py-[2px]">Valid test</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 px-1 py-[2px]">Upper camber</td>
                <td className="border border-slate-300 px-1 py-[2px] text-center">{jangada.testeWPCamaraSuperiorInicio || "\u00A0"}</td>
                <td className="border border-slate-300 px-1 py-[2px] text-center">{jangada.testeWPCamaraSuperiorFim || "\u00A0"}</td>
                <td className="border border-slate-300 px-1 py-[2px] text-center">{jangada.testeWPCamaraSuperiorQueda || "\u00A0"}</td>
                <td className="border border-slate-300 px-1 py-[2px] text-center">{tWP === "yes" ? "YES" : tWP === "no" ? "NO" : "\u00A0"}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-1 py-[2px]">Lower camber</td>
                <td className="border border-slate-300 px-1 py-[2px] text-center">{jangada.testeWPCamaraInferiorInicio || "\u00A0"}</td>
                <td className="border border-slate-300 px-1 py-[2px] text-center">{jangada.testeWPCamaraInferiorFim || "\u00A0"}</td>
                <td className="border border-slate-300 px-1 py-[2px] text-center">{jangada.testeWPCamaraInferiorQueda || "\u00A0"}</td>
                <td className="border border-slate-300 px-1 py-[2px] text-center">{tWP === "yes" ? "YES" : tWP === "no" ? "NO" : "\u00A0"}</td>
              </tr>
            </tbody>
          </table>

          <PageFooter />
        </section>

        {/* ============================ PAGE 2 ============================ */}
        <section className="mb-6 bg-white p-6 print:mb-0 print:p-0" style={{ breakAfter: "page" }}>
          <PageHeader page={2} total={3} stationNo={stationNo} certNo={certNo} dateStr={dateStr} />

          <SectionTitle n="4">Cylinders</SectionTitle>
          <table className="w-full border-collapse text-[8px]">
            <tbody>
              {[
                ["Cylinder N°", jangada.cylinderSerial],
                ["CO2 Weight", jangada.cylinderCo2 ? `${jangada.cylinderCo2} Kg` : ""],
                ["N2 Weight", jangada.cylinderN2 ? `${jangada.cylinderN2} Kg` : ""],
                ["Full Weight", jangada.cylinderPesoBruto ? `${jangada.cylinderPesoBruto} Kg` : ""],
                ["Tare / Tara", jangada.cylinderTara ? `${jangada.cylinderTara} Kg` : ""],
                ["Last Hydro test", fmtMonth(jangada.cylinderDataTeste) || jangada.cylinderDataTeste],
                ["Next Hydro test", fmtMonth(jangada.cylinderDataProxTeste) || jangada.cylinderDataProxTeste],
                ["Firing head type", jangada.cylinderCabecaDisparoRef],
                ["Firing head n°", jangada.cylinderCabecaDisparoSerial],
              ].map(([label, value], i) => (
                <tr key={i}>
                  <td className="w-[28%] border border-slate-300 bg-slate-50 px-1 py-[2px] font-semibold text-slate-600">{label}</td>
                  <td className="border border-slate-300 px-1 py-[2px]">{value || "\u00A0"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <SectionTitle n="5">Tests carried out</SectionTitle>
          <table className="w-full border-collapse text-[8px]">
            <thead>
              <tr className="text-slate-600">
                <th className="border border-slate-300 px-1 py-[2px] text-left">Test</th>
                <th className="border border-slate-300 px-1 py-[2px] w-10">YES</th>
                <th className="border border-slate-300 px-1 py-[2px] w-10">NO</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["NAP TEST", tNAP],
                ["GI test", tGI],
                ["Floor seam test (FS)", tFS],
                ["Over load test (DL)", tDL],
                ["Working pressure (WP)", tWP],
              ].map(([label, mark], i) => (
                <tr key={i}>
                  <td className="border border-slate-300 px-1 py-[2px]">{label as string}</td>
                  <td className="border border-slate-300 px-1 py-[2px] text-center"><CheckCell mark={mark as "yes" | "no" | ""} /></td>
                  <td className="border border-slate-300 px-1 py-[2px] text-center"><CheckCell mark={mark === "no" ? "yes" : ""} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <SectionTitle n="6">Liferaft inspection</SectionTitle>
          <table className="w-full border-collapse text-[8px]">
            <thead>
              <tr className="text-slate-600">
                <th className="border border-slate-300 px-1 py-[2px] text-left">Main buoyancies</th>
                <th className="border border-slate-300 px-1 py-[2px] w-8">Chek</th>
                <th className="border border-slate-300 px-1 py-[2px] w-8">R*</th>
                <th className="border border-slate-300 px-1 py-[2px] text-left">Canopy</th>
                <th className="border border-slate-300 px-1 py-[2px] w-8">Chek</th>
                <th className="border border-slate-300 px-1 py-[2px] w-8">R*</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Buoyancy", "Canopy"],
                ["Reflective tape", "Reflective tape"],
                ["Outer lifeline", "Rainwater collector"],
                ["Inner lifeline", "Entrances"],
                ["Painter patch", "External flash light"],
                ["Towing patch", "Arches"],
                ["Bowsing lines", "Shackle / Ring (DL)"],
                ["Ramp / Ladder", "Webbings (DL)"],
                ["Overpressure valves", ""],
                ["Overpressure valves caps", ""],
                ["Labels", ""],
                ["Floating knife", ""],
                ["Sea Anchor", ""],
                ["Quoit + Line", ""],
                ["Painter line retrieving line", ""],
                ["Signal card", ""],
                ["Immediate actions card", ""],
                ["Lighting system", ""],
              ].map(([a, b], i) => (
                <tr key={i}>
                  <td className="border border-slate-300 px-1 py-[2px]">{a}</td>
                  <td className="border border-slate-300 px-1 py-[2px] text-center">&nbsp;</td>
                  <td className="border border-slate-300 px-1 py-[2px] text-center">&nbsp;</td>
                  <td className="border border-slate-300 px-1 py-[2px]">{b}</td>
                  <td className="border border-slate-300 px-1 py-[2px] text-center">&nbsp;</td>
                  <td className="border border-slate-300 px-1 py-[2px] text-center">&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-[2px] text-[7px] italic text-slate-500">R* = replacement</p>

          <SectionTitle n="7">If MES liferafts: connection lines</SectionTitle>
          <div className="text-[8px]">
            <div className="font-semibold text-slate-600">MES SIS liferafts (mini slide)</div>
            <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
              <span>Extremity Bowsing Line (EBL) — Chek <Val v="" w="5ch" /> R* <Val v="" w="5ch" /></span>
              <span>Central Bowsing Line (CBL) — Chek <Val v="" w="5ch" /> R* <Val v="" w="5ch" /></span>
            </div>
            <div className="mt-2 font-semibold text-slate-600">MES MIS liferafts (super slide)</div>
            <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
              <span>PRIMARY — Chek <Val v="" w="5ch" /> R* <Val v="" w="5ch" /></span>
              <span>SECONDARY / ADDITIONAL — Chek <Val v="" w="5ch" /> R* <Val v="" w="5ch" /></span>
            </div>
            <div className="mt-1 text-[7px] text-slate-500">
              Blue tether line attached with 9 kg (x2) zip ties · Bowsing lines V connected with shackle + secured · Slings connected to the Bowsing V.
            </div>
          </div>

          <PageFooter />
        </section>

        {/* ============================ PAGE 3 ============================ */}
        <section className="bg-white p-6 print:p-0">
          <PageHeader page={3} total={3} stationNo={stationNo} certNo={certNo} dateStr={dateStr} />

          <SectionTitle n="8">Accessories inspection</SectionTitle>
          <table className="w-full border-collapse text-[8px]">
            <thead>
              <tr className="text-slate-600">
                <th className="border border-slate-300 px-1 py-[2px] text-left">Equipment (in the pack)</th>
                <th className="border border-slate-300 px-1 py-[2px] w-8">Qty</th>
                <th className="border border-slate-300 px-1 py-[2px] w-8">Check</th>
                <th className="border border-slate-300 px-1 py-[2px] w-16">Expiry date</th>
              </tr>
            </thead>
            <tbody>
              {artigos.length === 0 ? (
                <tr>
                  <td colSpan={4} className="border border-slate-300 px-1 py-3 text-center text-slate-400 italic">
                    Sem artigos registados para esta jangada.
                  </td>
                </tr>
              ) : (
                artigos.map((a) => (
                  <tr key={a.id}>
                    <td className="border border-slate-300 px-1 py-[2px]">{a.name}</td>
                    <td className="border border-slate-300 px-1 py-[2px] text-center">{a.quantidade}</td>
                    <td className="border border-slate-300 px-1 py-[2px] text-center">OK</td>
                    <td className="border border-slate-300 px-1 py-[2px] text-center">{fmtArtigoValidade(a.validade)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="mt-2 text-[8px]">
            <div className="font-semibold text-slate-600">Outside of the pack</div>
            <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
              <span>Radar transponder <Val v="" w="5ch" /></span>
              <span>HRU <Val v={jangada.hruReferencia} w="12ch" /> Val. <Val v={fmtMonth(jangada.hruValidade) || jangada.hruValidade} w="7ch" /></span>
              <span>Lighting system <Val v="" w="6ch" /></span>
            </div>
          </div>

          <SectionTitle n="9">Liferaft and equipment condition information</SectionTitle>
          <table className="w-full border-collapse text-[8px]">
            <tbody>
              {[
                "Was the raft wet?",
                "Was the container damaged?",
                "Was the liferaft damaged?",
                "Had the liferaft been fired",
              ].map((q, i) => (
                <tr key={i}>
                  <td className="border border-slate-300 px-1 py-[2px]">{q}</td>
                  <td className="border border-slate-300 px-1 py-[2px] w-12 text-center">Yes</td>
                  <td className="border border-slate-300 px-1 py-[2px] w-12 text-center">No</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-[8px] space-y-2">
            <div>Nature and extent of the damages: <span className="inline-block w-[70%] border-b border-dotted border-slate-400">&nbsp;</span></div>
            <div>Nature and extent of the defects: <span className="inline-block w-[70%] border-b border-dotted border-slate-400">&nbsp;</span></div>
            <div>Repairs carried out / remarks: <span className="inline-block w-[65%] border-b border-dotted border-slate-400">&nbsp;</span></div>
          </div>

          <SectionTitle n="10">Repacking with safety check — packer / checker</SectionTitle>
          <table className="w-full border-collapse text-[8px]">
            <thead>
              <tr className="text-slate-600">
                <th className="border border-slate-300 px-1 py-[2px] text-left">Documents</th>
                <th className="border border-slate-300 px-1 py-[2px] w-16">Packer</th>
                <th className="border border-slate-300 px-1 py-[2px] w-16">Checker</th>
                <th className="border border-slate-300 px-1 py-[2px] text-left">Connections</th>
                <th className="border border-slate-300 px-1 py-[2px] w-16">Packer</th>
                <th className="border border-slate-300 px-1 py-[2px] w-16">Checker</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Liferaft label completed", "Light connected"],
                ["ID card completed", "Painter line connected"],
                ["Re-inspection certificate completed", "Quick firing line connected"],
                ["Container label completed", "DL container: shackle access cover glued"],
                ["Servicing history completed", "Venturi flap cover / caps / secured"],
              ].map(([a, b], i) => (
                <tr key={i}>
                  <td className="border border-slate-300 px-1 py-[2px]">{a}</td>
                  <td className="border border-slate-300 px-1 py-[2px] text-center">&nbsp;</td>
                  <td className="border border-slate-300 px-1 py-[2px] text-center">&nbsp;</td>
                  <td className="border border-slate-300 px-1 py-[2px]">{b}</td>
                  <td className="border border-slate-300 px-1 py-[2px] text-center">&nbsp;</td>
                  <td className="border border-slate-300 px-1 py-[2px] text-center">&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4 text-[9px]">
            <div>Station nº: <Val v={stationNo} w="8ch" /></div>
            <div>Technician&apos;s name: <Val v="" w="18ch" /></div>
            <div>Signature: <span className="inline-block w-[20ch] border-b border-slate-500">&nbsp;</span></div>
          </div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4 text-[9px]">
            <div>Checker&apos;s name: <Val v="" w="18ch" /></div>
            <div>Signature: <span className="inline-block w-[20ch] border-b border-slate-500">&nbsp;</span></div>
          </div>

          <p className="mt-3 text-[7px] leading-snug text-slate-500">
            IMPORTANT — The «Technician or Packer» as well as the «Checker» must be approved by SurvitecZodiac.
            Please contact SurvitecZodiac for approval if an exemption is needed. The fields «Packer» and «Checker»
            must always be filled with the initials or with «N/A».
          </p>

          <PageFooter />
        </section>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              @page { size: A4; margin: 10mm; }
            }
          `,
        }}
      />
    </div>
  );
}
