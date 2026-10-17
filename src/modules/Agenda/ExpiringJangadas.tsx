import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { formatValidityDisplay } from '@/lib/date-display';

/**
 * Component that fetches expiring jangada articles and displays a daily summary.
 * It uses the `/api/expiring-jangadas` endpoint (defaults to next 365 days).
 */
export default function ExpiringJangadas() {
  const [data, setData] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/expiring-jangadas')
      .then((res) => res.json())
      .then((json) => {
        if (json && !json.error) {
          setData(json);
        } else {
          setData({});
        }
        setLoading(false);
      })
      .catch(() => {
        setData({});
        setLoading(false);
      });
  }, []);

  const sortedDates = Object.keys(data).filter(date => {
    const d = new Date(date);
    return !isNaN(d.getTime());
  }).sort();

  return (
    <div className="p-4 bg-white/80 backdrop-blur-sm rounded-xl shadow-md border border-slate-200 mb-4">
      <h3 className="text-lg font-semibold text-slate-800 mb-2">Jangadas com artigos a expirar</h3>
      {loading && <p className="text-sm text-slate-500">Carregando...</p>}
      {!loading && sortedDates.length === 0 && (
        <p className="text-sm text-slate-600">Nenhum artigo a expirar nos próximos 12 meses.</p>
      )}
      {!loading && sortedDates.length > 0 && (
        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {sortedDates.map((date) => (
            <li key={date} className="border-b border-slate-200 pb-1 last:border-0">
              <span className="block text-sm font-medium text-slate-700">
                {(() => {
                  const d = new Date(date);
                  return !isNaN(d.getTime()) ? format(d, 'dd/MM/yyyy') : date;
                })()} ({data[date]?.length || 0})
              </span>
              <ul className="ml-4 list-disc list-inside text-xs text-slate-600">
                {data[date]?.map((item, idx) => (
                  <li key={idx}>
                    Jangada <strong>{item.serial}</strong> – {item.articleName} (validade {formatValidityDisplay(item.validade)})
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
