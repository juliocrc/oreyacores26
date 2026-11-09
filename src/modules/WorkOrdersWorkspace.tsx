'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
  Search,
} from 'lucide-react';

type Raft = {
  id: number;
  serial?: string | null;
  brand?: string | null;
  model?: string | null;
  shipNameManual?: string | null;
};
type WorkOrder = {
  id: number;
  numeroOrdem?: string | null;
  grupoNumeroOrdem?: string | null;
  status?: string | null;
  workflowStatus?: string | null;
  tipo?: string | null;
  prioridade?: string | null;
  descricao?: string | null;
  tecnicoResponsavel?: string | null;
  tecnico?: { nome?: string | null } | null;
  cliente?: { nome?: string | null; numeroCliente?: string | number | null } | null;
  serviceStation?: { nome?: string | null; codigo?: string | null } | null;
  jangadas?: Raft[];
  jangada?: Raft | null;
  orcamentoStatus?: string | null;
  valorPecas?: number | null;
  valorMaoObra?: number | null;
  valorDesconto?: number | null;
  valorTotal?: number | null;
  dataAbertura?: string | null;
  dataPlaneadaInicio?: string | null;
  dataPlaneadaFim?: string | null;
  dataPrevista?: string | null;
  dataInicio?: string | null;
  dataConclusao?: string | null;
  updatedAt?: string | null;
  metadados?: {
    shipName?: string;
    faturaNumero?: string;
    faturaId?: number;
    faturaEmitidaEm?: string;
    pagamentoStatus?: string;
    checklistItems?: {
      id?: string;
      label?: string;
      phase?: string;
      done?: boolean;
      notes?: string;
      isDefect?: boolean;
    }[];
    logs?: { id?: string; at?: string; type?: string; message?: string; user?: string }[];
  } | null;
};
type OrderPage = { orders: WorkOrder[]; total: number; page: number; totalPages: number };

const statuses: Record<string, string> = {
  pendente: 'Pendente',
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  em_progresso: 'Em progresso',
  pausada: 'Pausada',
  concluida: 'Concluida',
  cancelada: 'Cancelada',
};
const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50';
const panel = 'rounded-xl border border-slate-200 bg-white p-4 sm:p-6';
const money = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const dates = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' });

export function workOrderMoney(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? money.format(value)
    : 'Nao registado';
}

export function workOrderInvoice(meta: WorkOrder['metadados']) {
  const invoice = meta?.faturaNumero || (meta?.faturaId ? `Fatura #${meta.faturaId}` : null);
  return [invoice, meta?.pagamentoStatus].filter(Boolean).join(' / ') || 'Sem dados de faturacao';
}

function date(value?: string | null) {
  if (!value) return 'Nao registado';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? dates.format(parsed) : 'Data invalida';
}

function rafts(order: WorkOrder) {
  return order.jangadas?.length ? order.jangadas : order.jangada ? [order.jangada] : [];
}

async function load<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.ok) {
    if (response.status === 403)
      throw new Error('Sem permissao para consultar estas ordens de servico.');
    if (response.status === 404)
      throw new Error('Ordem de servico nao encontrada ou indisponivel nesta estacao.');
    if (response.status === 401)
      throw new Error('Sessao expirada. Inicie sessao novamente para continuar.');
    throw new Error('Nao foi possivel carregar os dados. Tente novamente.');
  }
  return response.json();
}

function Loading() {
  return (
    <p role="status" className="flex items-center gap-2 p-6 text-sm text-slate-600">
      <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />A carregar ordens de servico...
    </p>
  );
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <p role="alert" className="mb-3 flex items-center gap-2 text-sm text-red-800">
        <AlertCircle aria-hidden="true" className="h-5 w-5 shrink-0" />
        {message}
      </p>
      <button type="button" className={button} onClick={retry}>
        <RefreshCw aria-hidden="true" className="h-4 w-4" />
        Tentar novamente
      </button>
    </div>
  );
}

function Status({ value }: { value?: string | null }) {
  const color =
    value === 'concluida'
      ? 'bg-emerald-50 text-emerald-800'
      : value === 'cancelada'
        ? 'bg-red-50 text-red-800'
        : value === 'em_progresso'
          ? 'bg-blue-50 text-blue-800'
          : 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>
      {statuses[value || ''] || value || 'Nao registado'}
    </span>
  );
}

export function WorkOrdersList() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState({ q: '', status: '', page: 0 });
  const [reload, setReload] = useState(0);
  const requestKey = JSON.stringify([query, reload]);
  const [response, setResponse] = useState<{
    key: string;
    data?: OrderPage;
    error?: string;
  } | null>(null);
  const loading = response?.key !== requestKey;
  const result = !loading ? response?.data : null;
  const error = !loading ? response?.error : null;
  const filtering = q.trim() !== query.q || status !== query.status;

  useEffect(() => {
    const timer = setTimeout(
      () =>
        setQuery(previous =>
          previous.q === q.trim() && previous.status === status
            ? previous
            : { q: q.trim(), status, page: 0 },
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [q, status]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(query.page),
      pageSize: '20',
      includeClosed: '1',
      q: query.q,
      status: query.status,
    });
    load<OrderPage>(`/api/ordens-servico?${params}`, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        if (
          !Array.isArray(data.orders) ||
          !Number.isInteger(data.total) ||
          data.total < 0 ||
          !Number.isInteger(data.page) ||
          data.page < 0 ||
          !Number.isInteger(data.totalPages) ||
          data.totalPages < 0
        )
          throw new Error('Resposta invalida ao carregar ordens de servico.');
        const lastPage = Math.max(0, data.totalPages - 1);
        if (query.page > lastPage) {
          setQuery(previous => ({ ...previous, page: lastPage }));
          return;
        }
        setResponse({ key: requestKey, data });
      })
      .catch(reason => {
        if (!controller.signal.aborted)
          setResponse({
            key: requestKey,
            error: reason instanceof Error ? reason.message : 'Erro ao carregar ordens.',
          });
      });
    return () => controller.abort();
  }, [query, requestKey]);

  const busy = loading || filtering;
  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 text-slate-900 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ClipboardList aria-hidden="true" className="h-6 w-6 text-blue-700" />
            Ordens de Servico
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Trabalhos, orcamentos e faturacao por ordem.
          </p>
        </div>
        <Link href="/criar-ot" className={button}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Criar OT
        </Link>
      </header>
      <section
        aria-label="Filtros de ordens"
        className={`${panel} flex flex-col gap-4 sm:flex-row sm:items-end`}
      >
        <div className="flex-1">
          <label htmlFor="order-search" className="mb-1 block text-sm font-medium">
            Pesquisar ordens
          </label>
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <input
              id="order-search"
              type="search"
              value={q}
              onChange={event => setQ(event.target.value)}
              placeholder="Ordem, cliente, serial ou tecnico"
              className="min-h-11 w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm focus:outline-blue-600"
            />
          </div>
        </div>
        <div>
          <label htmlFor="order-status" className="mb-1 block text-sm font-medium">
            Estado do trabalho
          </label>
          <select
            id="order-status"
            value={status}
            onChange={event => setStatus(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:w-48"
          >
            <option value="">Todos os estados</option>
            {Object.entries(statuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </section>
      <section
        aria-label="Resultados"
        aria-busy={busy}
        className="overflow-hidden rounded-xl border border-slate-200 bg-white"
      >
        {busy ? (
          <Loading />
        ) : error ? (
          <div className="p-4">
            <LoadError message={error} retry={() => setReload(value => value + 1)} />
          </div>
        ) : result && result.orders.length === 0 ? (
          <div role="status" className="p-8 text-center">
            <h2 className="font-semibold">Nenhuma ordem encontrada</h2>
            <p className="mt-1 text-sm text-slate-600">
              {query.q || query.status
                ? 'Altere os filtros para procurar outros trabalhos.'
                : 'Crie uma OT para registar um novo trabalho.'}
            </p>
          </div>
        ) : result ? (
          <>
            <div
              className="overflow-x-auto"
              role="region"
              aria-label="Tabela de ordens de servico"
              tabIndex={0}
            >
              <table className="w-full min-w-[900px] text-left text-sm">
                <caption className="sr-only">
                  Ordens de servico e progresso de orcamento e faturacao
                </caption>
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600">
                  <tr>
                    {[
                      'Ordem',
                      'Cliente',
                      'Navio / Jangadas',
                      'Tecnico',
                      'Trabalho',
                      'Orcamento',
                      'Faturacao',
                    ].map(label => (
                      <th key={label} scope="col" className="px-4 py-3">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.orders.map(order => (
                    <tr key={order.id} className="align-top hover:bg-slate-50">
                      <th scope="row" className="px-4 py-4 font-medium">
                        <Link
                          className="text-blue-700 underline decoration-blue-200 underline-offset-4 hover:decoration-blue-700"
                          href={`/ordens-servico/${order.id}`}
                        >
                          {order.numeroOrdem || `OT #${order.id}`}
                        </Link>
                        {order.grupoNumeroOrdem && (
                          <p className="mt-1 text-xs font-normal text-slate-500">
                            Obra: {order.grupoNumeroOrdem}
                          </p>
                        )}
                      </th>
                      <td className="px-4 py-4">{order.cliente?.nome || 'Nao registado'}</td>
                      <td className="max-w-64 px-4 py-4">
                        <p>
                          {order.metadados?.shipName ||
                            rafts(order).find(raft => raft.shipNameManual)?.shipNameManual ||
                            'Navio nao registado'}
                        </p>
                        <p className="mt-1 break-words text-xs text-slate-500">
                          {rafts(order)
                            .map(raft => raft.serial || `Jangada #${raft.id}`)
                            .join(', ') || 'Sem jangadas associadas'}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        {order.tecnico?.nome || order.tecnicoResponsavel || 'Nao atribuido'}
                      </td>
                      <td className="px-4 py-4">
                        <Status value={order.status} />
                      </td>
                      <td className="px-4 py-4">
                        <p>{order.orcamentoStatus || 'Sem estado registado'}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {workOrderMoney(order.valorTotal)}
                        </p>
                      </td>
                      <td className="px-4 py-4">{workOrderInvoice(order.metadados)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav
              aria-label="Paginacao de ordens"
              className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3"
            >
              <p role="status" className="text-sm text-slate-600">
                {result.total} ordens | Pagina {result.page + 1} de {Math.max(1, result.totalPages)}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={button}
                  disabled={result.page === 0}
                  onClick={() =>
                    setQuery(previous => ({ ...previous, page: Math.max(0, previous.page - 1) }))
                  }
                >
                  <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                  Anterior
                </button>
                <button
                  type="button"
                  className={button}
                  disabled={result.page + 1 >= result.totalPages}
                  onClick={() => setQuery(previous => ({ ...previous, page: previous.page + 1 }))}
                >
                  Seguinte
                  <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </nav>
          </>
        ) : null}
      </section>
    </main>
  );
}

export function WorkOrderDetail({ id }: { id: number }) {
  const [reload, setReload] = useState(0);
  const requestKey = `${id}:${reload}`;
  const [response, setResponse] = useState<{
    key: string;
    data?: WorkOrder;
    error?: string;
  } | null>(null);
  const loading = response?.key !== requestKey;
  const order = !loading ? response?.data : null;
  const error = !loading ? response?.error : null;
  useEffect(() => {
    const controller = new AbortController();
    load<WorkOrder>(`/api/ordens-servico/${id}`, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        if (!data || data.id !== id)
          throw new Error('Resposta invalida ao carregar a ordem de servico.');
        setResponse({ key: requestKey, data });
      })
      .catch(reason => {
        if (!controller.signal.aborted)
          setResponse({
            key: requestKey,
            error: reason instanceof Error ? reason.message : 'Erro ao carregar a ordem.',
          });
      });
    return () => controller.abort();
  }, [id, requestKey]);

  const checklist = order?.metadados?.checklistItems || [];
  const logs = order?.metadados?.logs || [];
  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 text-slate-900 sm:p-6">
      <Link href="/ordens-servico" className={button}>
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Ordens de Servico
      </Link>
      {loading ? (
        <Loading />
      ) : error ? (
        <LoadError message={error} retry={() => setReload(value => value + 1)} />
      ) : order ? (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{order.numeroOrdem || `OT #${order.id}`}</h1>
              <p className="mt-1 text-sm text-slate-600">
                Consulta do trabalho | Atualizada em {date(order.updatedAt)}
              </p>
            </div>
            <Status value={order.status} />
          </header>
          <section aria-labelledby="order-context" className={panel}>
            <h2 id="order-context" className="mb-4 text-lg font-semibold">
              Trabalho
            </h2>
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Cliente', order.cliente?.nome],
                ['Tecnico', order.tecnico?.nome || order.tecnicoResponsavel],
                ['Estacao', order.serviceStation?.nome || order.serviceStation?.codigo],
                ['Obra', order.grupoNumeroOrdem],
                ['Tipo', order.tipo],
                ['Prioridade', order.prioridade],
                ['Etapa operacional', order.workflowStatus?.replaceAll('_', ' ')],
                ['Abertura', date(order.dataAbertura)],
                ['Inicio planeado', date(order.dataPlaneadaInicio)],
                ['Fim planeado', date(order.dataPlaneadaFim)],
                ['Entrega prevista', date(order.dataPrevista)],
                ['Inicio efetivo', date(order.dataInicio)],
                ['Conclusao', date(order.dataConclusao)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="mt-1 break-words font-medium">{value || 'Nao registado'}</dd>
                </div>
              ))}
            </dl>
            <h3 className="mb-1 mt-5 text-sm font-semibold">Descricao</h3>
            <p className="whitespace-pre-wrap break-words text-sm text-slate-700">
              {order.descricao || 'Sem descricao registada.'}
            </p>
          </section>
          <section aria-labelledby="order-assets" className={panel}>
            <h2 id="order-assets" className="text-lg font-semibold">
              Navio e jangadas
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {order.metadados?.shipName ||
                rafts(order).find(raft => raft.shipNameManual)?.shipNameManual ||
                'Navio nao registado'}
            </p>
            {rafts(order).length ? (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rafts(order).map(raft => (
                  <li key={raft.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <p className="font-medium">{raft.serial || `Jangada #${raft.id}`}</p>
                    <p className="mt-1 text-slate-500">
                      {[raft.brand, raft.model].filter(Boolean).join(' ') ||
                        'Marca / modelo nao registados'}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Sem jangadas associadas.</p>
            )}
          </section>
          <div className="grid gap-5 lg:grid-cols-2">
            <section aria-labelledby="order-finance" className={panel}>
              <h2 id="order-finance" className="text-lg font-semibold">
                Orcamento e faturacao
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Valores registados na OT. A edicao financeira e feita nos modulos respetivos.
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                {[
                  ['Estado do orcamento', order.orcamentoStatus || 'Nao registado'],
                  ['Pecas', workOrderMoney(order.valorPecas)],
                  ['Mao de obra', workOrderMoney(order.valorMaoObra)],
                  ['Desconto', workOrderMoney(order.valorDesconto)],
                  ['Total da OT', workOrderMoney(order.valorTotal)],
                  ['Faturacao', workOrderInvoice(order.metadados)],
                  ['Emissao da fatura', date(order.metadados?.faturaEmitidaEm)],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="break-words font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              <nav aria-label="Modulos financeiros" className="mt-5 flex flex-wrap gap-2">
                <Link href="/orcamentos" className={button}>
                  <FileText aria-hidden="true" className="h-4 w-4" />
                  Abrir Orcamentos
                </Link>
                <Link href="/faturacao" className={button}>
                  <Receipt aria-hidden="true" className="h-4 w-4" />
                  Abrir Faturacao
                </Link>
              </nav>
            </section>
            <section aria-labelledby="order-checklist" className={panel}>
              <h2 id="order-checklist" className="text-lg font-semibold">
                Checklist tecnica
              </h2>
              {checklist.length ? (
                <>
                  <p className="mt-1 text-sm text-slate-500">
                    {checklist.filter(item => item.done === true).length} de {checklist.length}{' '}
                    itens concluidos
                  </p>
                  <ul className="mt-4 divide-y divide-slate-100">
                    {checklist.map((item, index) => (
                      <li key={item.id || index} className="py-3 text-sm">
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="font-medium">{item.label || 'Item sem descricao'}</p>
                          <span
                            className={item.done === true ? 'text-emerald-700' : 'text-amber-800'}
                          >
                            {item.done === true
                              ? 'Concluido'
                              : item.done === false
                                ? 'Pendente'
                                : 'Sem estado'}
                          </span>
                        </div>
                        {item.phase && (
                          <p className="mt-1 text-xs text-slate-500">Fase: {item.phase}</p>
                        )}
                        {item.isDefect && <p className="mt-1 text-red-700">Defeito registado</p>}
                        {item.notes && (
                          <p className="mt-1 whitespace-pre-wrap break-words text-slate-600">
                            {item.notes}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Sem checklist registada.</p>
              )}
            </section>
          </div>
          <section aria-labelledby="order-history" className={panel}>
            <h2 id="order-history" className="text-lg font-semibold">
              Historico registado
            </h2>
            {logs.length ? (
              <ol className="mt-3 divide-y divide-slate-100">
                {logs.map((entry, index) => (
                  <li key={entry.id || index} className="py-3 text-sm">
                    <p className="whitespace-pre-wrap break-words text-slate-800">
                      {entry.message || 'Evento sem descricao'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {date(entry.at)}
                      {entry.user ? ` | ${entry.user}` : ''}
                      {entry.type ? ` | ${entry.type}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Sem eventos registados.</p>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
