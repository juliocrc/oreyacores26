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

function Mtw(v?: string | null, suffix = "Mt"): string {
  if (!v || !String(v).trim()) return "";
  const s = String(v).trim();
  return /[a-zA-Z]/.test(s) ? s : `${s} ${suffix}`;
}

function Val({ v, w }: { v?: string | null; w?: string }) {
  const text = v && String(v).trim() ? String(v) : "";
  return (
    <span
      className="inline-block border-b border-dotted border-slate-400 px-1 align-bottom"
      style={{ minWidth: w || "3ch" }}
    >
      {text || "\u00A0"}
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
          Test and Survey Report — MES MIS Slide
        </div>
        <div className="text-[9px] font-semibold text-slate-600">~PAGE {page}/{total}~</div>
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
    <div className="mt-2 text-right text-[8px] italic text-slate-400">Ed.08-2020</div>
  );
}

type SlideItem = { label?: string; inicio?: string; fim?: string; abertura?: string; reset?: string };
type SlideJson = {
  unidade?: string;
  tubes?: SlideItem[];
  arcos?: SlideItem[];
  overpressure?: {
    tubes?: SlideItem[];
    arcos?: SlideItem[];
    superior?: { abertura?: string; reset?: string };
    inferior?: { abertura?: string; reset?: string };
  };
};
type Cyl = {
  serial?: string;
  co2?: string;
  n2?: string;
  tara?: string;
  pesoBruto?: string;
  dataTeste?: string;
  dataProxTeste?: string;
};

function parseJson<T>(v: string | null | undefined, fallback: T): T {
  if (!v) return fallback;
  try {
    const p = JSON.parse(v);
    return p && typeof p === "object" ? (p as T) : fallback;
  } catch {
    return fallback;
  }
}

function drop(a?: string, b?: string): string {
  const n1 = Number(a);
  const n2 = Number(b);
  if (!Number.isFinite(n1) || !Number.isFinite(n2)) return "";
  const d = n2 - n1;
  return (Math.round(d * 100) / 100).toString();
}

function testMark(v?: string | null): "yes" | "no" | "" {
  const s = (v || "").trim().toUpperCase();
  if (s === "PASSOU" || s === "OK" || s === "SIM") return "yes";
  if (s === "REPROVOU" || s === "FAIL" || s === "NÃO" || s === "NAO") return "no";
  return "";
}

export default async function JangadaFichaSlidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId)) notFound();

  const jangada = await prisma.jangada.findUnique({
    where: { id: numericId },
    include: { serviceStation: true },
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
  const typeOfSlide = jangada.model || jangada.launchType || "MES MIS Slide";

  const camaras = parseJson<SlideJson>(jangada.testeCamarasJson, {});
  const unit = jangada.testeWPUnidadePressao || camaras.unidade || "mbar";

  const valves = camaras.overpressure?.arcos?.length ? camaras.overpressure.arcos : [];
  const wpTubes = camaras.arcos?.length ? camaras.arcos : camaras.tubes || [];
  const labels = (wpTubes.length ? wpTubes : valves).map((t) => t.label || "");

  const cylinders = parseJson<Cyl[]>(jangada.cylindersJson, []);
  const tWP = testMark(jangada.testeWP);

  const overSup = camaras.overpressure?.superior;
  const overInf = camaras.overpressure?.inferior;

  return (
    <div className="bg-white text-slate-900 min-h-screen font-sans">
      <div className="fixed top-4 right-4 flex items-center gap-2 print:hidden">
        <a
          href={`/api/jangadas/${numericId}/ficha-slide-excel`}
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
        >
          Exportar Excel
        </a>
        <PrintPageButton />
      </div>

      <div className="mx-auto p-6 print:p-0" style={{ maxWidth: "21cm" }}>
        {/* ============================ PAGE 1 ============================ */}
        <section className="mb-6 bg-white p-6 print:mb-0 print:p-0" style={{ breakAfter: "page" }}>
          <PageHeader page={1} total={2} stationNo={stationNo} certNo={certNo} dateStr={dateStr} />

          <table className="w-full border-collapse text-[9px]">
            <tbody>
              <tr>
                <td className="w-[16%] py-[3px] pr-2 font-semibold text-slate-600">Type of slide</td>
                <td className="w-[34%] py-[3px] pr-2"><Val v={typeOfSlide} w="18ch" /></td>
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

          <SectionTitle n="4">Inflation and control of relief valves ({unit})</SectionTitle>
          <table className="w-full border-collapse text-[8px]">
            <thead>
              <tr className="text-slate-600">
                <th className="border border-slate-300 px-1 py-[2px] text-left">Tubes</th>
                {labels.map((l, i) => (
                  <th key={i} className="border border-slate-300 px-1 py-[2px]">{l || "\u00A0"}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 px-1 py-[2px] font-semibold text-slate-600">Pressure at opening</td>
                {valves.map((t, i) => (
                  <td key={i} className="border border-slate-300 px-1 py-[2px] text-center">{t.abertura || "\u00A0"}</td>
                ))}
              </tr>
              <tr>
                <td className="border border-slate-300 px-1 py-[2px] font-semibold text-slate-600">Pressure at closing</td>
                {valves.map((t, i) => (
                  <td key={i} className="border border-slate-300 px-1 py-[2px] text-center">{t.reset || "\u00A0"}</td>
                ))}
              </tr>
              <tr>
                <td className="border border-slate-300 px-1 py-[2px] font-semibold text-slate-600">Result</td>
                {valves.map((_, i) => (
                  <td key={i} className="border border-slate-300 px-1 py-[2px] text-center">OK</td>
                ))}
              </tr>
            </tbody>
          </table>
          {(overSup || overInf) && (
            <div className="mt-1 border border-slate-300 p-2 text-[8px]">
              <div className="font-semibold text-slate-600">ASPIRATOR: Overpressure valves test</div>
              <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
                <span>Upper opening <Val v={overSup?.abertura} w="5ch" /> reset <Val v={overSup?.reset} w="5ch" /></span>
                <span>Lower opening <Val v={overInf?.abertura} w="5ch" /> reset <Val v={overInf?.reset} w="5ch" /></span>
              </div>
            </div>
          )}

          <SectionTitle n="5">Pressure test (WP test) — Tolerance 5% of start pressure ({unit})</SectionTitle>
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
                <th className="border border-slate-300 px-1 py-[2px] text-left">Tubes</th>
                {labels.map((l, i) => (
                  <th key={i} className="border border-slate-300 px-1 py-[2px]">{l || "\u00A0"}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 px-1 py-[2px] font-semibold text-slate-600">Pressure at beginning</td>
                {wpTubes.map((t, i) => (
                  <td key={i} className="border border-slate-300 px-1 py-[2px] text-center">{t.inicio || "\u00A0"}</td>
                ))}
              </tr>
              <tr>
                <td className="border border-slate-300 px-1 py-[2px] font-semibold text-slate-600">Pressure at end</td>
                {wpTubes.map((t, i) => (
                  <td key={i} className="border border-slate-300 px-1 py-[2px] text-center">{t.fim || "\u00A0"}</td>
                ))}
              </tr>
              <tr>
                <td className="border border-slate-300 px-1 py-[2px] font-semibold text-slate-600">Result (drop)</td>
                {wpTubes.map((t, i) => (
                  <td key={i} className="border border-slate-300 px-1 py-[2px] text-center">{drop(t.inicio, t.fim) || "\u00A0"}</td>
                ))}
              </tr>
              <tr>
                <td className="border border-slate-300 px-1 py-[2px] font-semibold text-slate-600">Valid test</td>
                {wpTubes.map((_, i) => (
                  <td key={i} className="border border-slate-300 px-1 py-[2px] text-center">
                    {tWP === "yes" ? "YES" : tWP === "no" ? "NO" : "\u00A0"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>

          <PageFooter />
        </section>

        {/* ============================ PAGE 2 ============================ */}
        <section className="bg-white p-6 print:p-0">
          <PageHeader page={2} total={2} stationNo={stationNo} certNo={certNo} dateStr={dateStr} />

          <SectionTitle n="8">Information about the inflation system — cylinders</SectionTitle>
          {cylinders.length === 0 ? (
            <table className="w-full border-collapse text-[8px]">
              <tbody>
                <tr>
                  <td className="w-[28%] border border-slate-300 bg-slate-50 px-1 py-[2px] font-semibold text-slate-600">Cylinder N°</td>
                  <td className="border border-slate-300 px-1 py-[2px]">{jangada.cylinderSerial || "\u00A0"}</td>
                  <td className="w-[28%] border border-slate-300 bg-slate-50 px-1 py-[2px] font-semibold text-slate-600">Firing head n°</td>
                  <td className="border border-slate-300 px-1 py-[2px]">{jangada.cylinderCabecaDisparoSerial || "\u00A0"}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 bg-slate-50 px-1 py-[2px] font-semibold text-slate-600">CO2 / N2</td>
                  <td className="border border-slate-300 px-1 py-[2px]">{`${jangada.cylinderCo2 || "—"} / ${jangada.cylinderN2 || "—"} Kg`}</td>
                  <td className="border border-slate-300 bg-slate-50 px-1 py-[2px] font-semibold text-slate-600">Next Hydro test</td>
                  <td className="border border-slate-300 px-1 py-[2px]">{fmtMonth(jangada.cylinderDataProxTeste) || jangada.cylinderDataProxTeste || "\u00A0"}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse text-[8px]">
              <thead>
                <tr className="text-slate-600">
                  <th className="border border-slate-300 px-1 py-[2px] text-left">Cylinder N°</th>
                  <th className="border border-slate-300 px-1 py-[2px]">CO² weight</th>
                  <th className="border border-slate-300 px-1 py-[2px]">N² weight</th>
                  <th className="border border-slate-300 px-1 py-[2px]">Tare</th>
                  <th className="border border-slate-300 px-1 py-[2px]">Full weight</th>
                  <th className="border border-slate-300 px-1 py-[2px]">Hydro test</th>
                  <th className="border border-slate-300 px-1 py-[2px]">Next test</th>
                </tr>
              </thead>
              <tbody>
                {cylinders.map((cyl, i) => (
                  <tr key={i}>
                    <td className="border border-slate-300 px-1 py-[2px]">{cyl.serial || "\u00A0"}</td>
                    <td className="border border-slate-300 px-1 py-[2px] text-center">{cyl.co2 ? `${cyl.co2} Kg` : "\u00A0"}</td>
                    <td className="border border-slate-300 px-1 py-[2px] text-center">{cyl.n2 ? `${cyl.n2} Kg` : "\u00A0"}</td>
                    <td className="border border-slate-300 px-1 py-[2px] text-center">{cyl.tara ? `${cyl.tara} Kg` : "\u00A0"}</td>
                    <td className="border border-slate-300 px-1 py-[2px] text-center">{cyl.pesoBruto ? `${cyl.pesoBruto} Kg` : "\u00A0"}</td>
                    <td className="border border-slate-300 px-1 py-[2px] text-center">{fmtMonth(cyl.dataTeste) || cyl.dataTeste || "\u00A0"}</td>
                    <td className="border border-slate-300 px-1 py-[2px] text-center">{fmtMonth(cyl.dataProxTeste) || cyl.dataProxTeste || "\u00A0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="mt-2 text-[8px]">
            <div className="font-semibold text-slate-600">Firing heads</div>
            <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
              <span>Type <Val v={jangada.cylinderCabecaDisparoRef} w="12ch" /></span>
              <span>Serial n° <Val v={jangada.cylinderCabecaDisparoSerial} w="12ch" /></span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4 text-[9px]">
            <div>Station nº: <Val v={stationNo} w="8ch" /></div>
            <div>Technician&apos;s name: <Val v="" w="18ch" /></div>
            <div>Signature: <span className="inline-block w-[20ch] border-b border-slate-500">&nbsp;</span></div>
          </div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4 text-[9px]">
            <div>Checker&apos;s name: <Val v="" w="18ch" /></div>
            <div>Signature: <span className="inline-block w-[20ch] border-b border-slate-500">&nbsp;</span></div>
          </div>

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
