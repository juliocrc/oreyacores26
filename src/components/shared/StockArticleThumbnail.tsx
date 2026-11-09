"use client";

import React, { useState } from "react";
import { ImageOff } from "lucide-react";

/** Catalog photo only. Inspection evidence must be rendered separately. */
export default function StockArticleThumbnail({ foto, label, className = "h-10 w-10" }: {
  foto?: string | null;
  label: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = foto?.trim();
  const frame = `shrink-0 rounded-lg border border-slate-200 bg-white ${className}`;
  return src && failedSrc !== src ? (
    // Catalog URLs include uploads, manual assets and external images.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={`Foto de ${label}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} className={`${frame} object-contain`} />
  ) : (
    <span role="img" aria-label={`Sem imagem de ${label}`} title="Sem imagem de catalogo" className={`${frame} inline-flex items-center justify-center text-slate-300`}>
      {src ? <button type="button" aria-label={`Tentar carregar foto de ${label}`} onClick={event => { event.stopPropagation(); setFailedSrc(null); }}><ImageOff size={16} aria-hidden="true" /></button> : <ImageOff size={16} aria-hidden="true" />}
    </span>
  );
}
