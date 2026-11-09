"use client";

import { useState } from 'react';
import { Package } from 'lucide-react';

export default function JangadaArticleThumbnail({ photo, name }: { photo: string | null; name: string }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50 text-slate-300 align-middle print:hidden">
      {photo && photo !== failedPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={`Foto de catalogo: ${name}`} width={40} height={40} loading="lazy" className="h-full w-full object-contain bg-white" onError={() => setFailedPhoto(photo)} />
      ) : <Package size={16} aria-hidden="true" />}
    </span>
  );
}
