'use client';

import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement>;

/**
 * Ãcones SVG realistas para o sidebar da aplicaÃ§Ã£o Orey AÃ§ores Deluxe.
 * Substituem os emojis por ilustraÃ§Ãµes vetoriais detalhadas, com gradientes,
 * sombras e traÃ§os que transmitem um aspeto profissional e realista.
 */

// ============================================================================
// ESTAÃ‡ÃƒO DE SERVIÃ‡O
// ============================================================================
export const ServiceStationIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ssGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4f46e5" />
        <stop offset="100%" stopColor="#312e81" />
      </linearGradient>
      <linearGradient id="ssRoof" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1e293b" />
        <stop offset="100%" stopColor="#0f172a" />
      </linearGradient>
    </defs>
    {/* EdifÃ­cio */}
    <rect x="6" y="14" width="20" height="12" rx="1.5" fill="url(#ssGrad)" stroke="#1e1b4b" strokeWidth="1" />
    <rect x="7" y="15" width="18" height="10" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
    {/* Telhado */}
    <path d="M4 14 L16 8 L28 14 Z" fill="url(#ssRoof)" stroke="#0f172a" strokeWidth="1.5" />
    <path d="M16 8 L16 14" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
    {/* Janelas */}
    <rect x="9" y="17" width="3" height="2.5" rx="0.4" fill="#93c5fd" />
    <rect x="13" y="17" width="3" height="2.5" rx="0.4" fill="#93c5fd" />
    <rect x="17" y="17" width="3" height="2.5" rx="0.4" fill="#93c5fd" />
    <rect x="21" y="17" width="3" height="2.5" rx="0.4" fill="#93c5fd" />
    {/* Porta */}
    <rect x="14" y="20" width="4" height="6" rx="0.5" fill="#1e293b" stroke="#0f172a" strokeWidth="1" />
    <circle cx="17.2" cy="23" r="0.35" fill="#c5c6c7" />
    {/* Sinal acima da porta */}
    <rect x="13" y="12" width="6" height="2" rx="0.5" fill="#f59e0b" />
    <rect x="14" y="12.6" width="1" height="0.8" rx="0.2" fill="#fbbf24" />
    <rect x="16" y="12.6" width="1" height="0.8" rx="0.2" fill="#fbbf24" />
    <rect x="18" y="12.6" width="1" height="0.8" rx="0.2" fill="#fbbf24" />
  </svg>
);

// ============================================================================
// AGENDA / CALENDÃRIO
// ============================================================================
export const AgendaIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="agGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2563eb" />
        <stop offset="100%" stopColor="#1d4ed8" />
      </linearGradient>
    </defs>
    {/* Corpo do calendÃ¡rio */}
    <rect x="6" y="8" width="20" height="20" rx="2" fill="url(#agGrad)" stroke="#1e3a8a" strokeWidth="1" />
    {/* CabeÃ§alho do calendÃ¡rio */}
    <rect x="6" y="8" width="20" height="5" rx="2" fill="#1e3a8a" />
    <rect x="6" y="8" width="20" height="5" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
    {/* Dias da semana (linhas) */}
    <path d="M10 16 H22" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M10 19 H22" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M10 22 H22" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" />
    {/* Destaque data atual */}
    <rect x="13" y="14.5" width="6" height="3" rx="1" fill="rgba(255,255,255,0.2)" />
    <circle cx="16" cy="16" r="1.6" fill="#fbbf24" />
    {/* Pinos superiores */}
    <rect x="8" y="11" width="1.5" height="1.5" rx="0.3" fill="rgba(255,255,255,0.4)" />
    <rect x="12.5" y="11" width="1.5" height="1.5" rx="0.3" fill="rgba(255,255,255,0.4)" />
    <rect x="17" y="11" width="1.5" height="1.5" rx="0.3" fill="rgba(255,255,255,0.4)" />
    <rect x="21.5" y="11" width="1.5" height="1.5" rx="0.3" fill="rgba(255,255,255,0.4)" />
    <rect x="26" y="11" width="1.5" height="1.5" rx="0.3" fill="rgba(255,255,255,0.4)" />
  </svg>
);

// ============================================================================
// TÃ‰CNICOS & GESTÃƒO / CAPACETE
// ============================================================================
export const TechniciansIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="tcGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
    </defs>
    {/* Capacete */}
    <path d="M10 14 Q16 8 22 14 L22 22 L10 22 Z" fill="url(#tcGrad)" stroke="#92400e" strokeWidth="1.5" />
    <path d="M16 8 Q16 6 16 6" stroke="none" />
    <path d="M14 14 Q16 10 18 14" stroke="#92400e" strokeWidth="1.5" fill="none" />
    {/* Visor */}
    <rect x="13.5" y="15.5" width="5" height="2" rx="0.5" fill="#1e293b" />
    {/* Faixa refletora */}
    <rect x="10" y="16.5" width="12" height="1.5" fill="#fbbf24" opacity="0.9" />
    {/* Pessoas (sombra/tÃ©cnicos) */}
    <ellipse cx="9" cy="24" rx="1.8" ry="1.2" fill="#0f172a" opacity="0.35" />
    <ellipse cx="23" cy="24" rx="1.8" ry="1.2" fill="#0f172a" opacity="0.35" />
    <rect x="8.2" y="22" width="1.6" height="2" rx="0.4" fill="#374151" opacity="0.6" />
    <rect x="22.2" y="22" width="1.6" height="2" rx="0.4" fill="#374151" opacity="0.6" />
  </svg>
);

// ============================================================================
// ESTATÃSTICAS / GRÃFICO
// ============================================================================
export const StatsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="stGrad" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0%" stopColor="#0891b2" />
        <stop offset="100%" stopColor="#0e7490" />
      </linearGradient>
    </defs>
    {/* Eixos */}
    <path d="M6 26 V6 H26" stroke="#cbd5e1" strokeWidth="1.5" />
    {/* Barras do grÃ¡fico */}
    <rect x="9" y="16" width="3" height="10" rx="0.5" fill="url(#stGrad)" />
    <rect x="13" y="11" width="3" height="15" rx="0.5" fill="url(#stGrad)" />
    <rect x="17" y="8" width="3" height="18" rx="0.5" fill="url(#stGrad)" />
    <rect x="21" y="13" width="3" height="13" rx="0.5" fill="url(#stGrad)" />
    <rect x="25" y="10" width="3" height="16" rx="0.5" fill="url(#stGrad)" />
    {/* Linha de tendÃªncia */}
    <path d="M10.5 26 Q19 14 27.5 10" stroke="#38bdf8" strokeWidth="2" fill="none" strokeLinecap="round" />
    <circle cx="27.5" cy="10" r="1.4" fill="#38bdf8" />
  </svg>
);

// ============================================================================
// OFICINA / FERRAMENTAS
// ============================================================================
export const WorkshopIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="wsGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ef4444" />
        <stop offset="100%" stopColor="#b91c1c" />
      </linearGradient>
    </defs>
    {/* Martelo */}
    <path d="M8 24 L14 18 L20 12 L24 8" stroke="url(#wsGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="13" y="17" width="4" height="5" rx="0.6" fill="#94a3b8" />
    {/* Chave de fendas cruzada */}
    <path d="M10 20 L24 6" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
    <rect x="9.5" y="19.5" width="3" height="1" rx="0.3" fill="#475569" />
    <rect x="23.5" y="5.5" width="3" height="1" rx="0.3" fill="#475569" />
    {/* Pino/prego */}
    <rect x="15.5" y="7" width="1" height="4" rx="0.3" fill="#f1f5f9" />
    {/* Caixa de ferramentas atrÃ¡s */}
    <rect x="6" y="14" width="20" height="12" rx="1.5" fill="#1e293b" stroke="#0f172a" strokeWidth="1" />
    <path d="M8 14 Q16 6 24 14" stroke="#475569" strokeWidth="1.5" fill="none" />
  </svg>
);

// ============================================================================
// CALIBRAÃ‡Ã•ES / BALANÃ‡A
// ============================================================================
export const CalibrationsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cbGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#a855f7" />
        <stop offset="100%" stopColor="#7e22ce" />
      </linearGradient>
    </defs>
    {/* BalanÃ§a */}
    <path d="M7 10 H25" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
    <rect x="14.5" y="4" width="3" height="6" rx="0.5" fill="url(#cbGrad)" stroke="#5b21b6" strokeWidth="1" />
    {/* BrasÃ£o central */}
    <circle cx="16" cy="10" r="1.2" fill="#fbbf24" stroke="#92400e" strokeWidth="1" />
    {/* Pratos */}
    <path d="M11 14 Q16 12 21 14" stroke="#94a3b8" strokeWidth="1.5" fill="none" />
    <rect x="8.5" y="18" width="5" height="6" rx="0.5" fill="#cbd5e1" stroke="#64748b" strokeWidth="1" />
    <rect x="18.5" y="18" width="5" height="6" rx="0.5" fill="#cbd5e1" stroke="#64748b" strokeWidth="1" />
    {/* Cordas */}
    <path d="M11 14 L11 18 M21 14 L21 18" stroke="#94a3b8" strokeWidth="1" />
    {/* Marcador de precisÃ£o */}
    <path d="M16 24 L16 30" stroke="url(#cbGrad)" strokeWidth="2" strokeLinecap="round" />
    <circle cx="16" cy="30" r="1" fill="#a855f7" />
  </svg>
);

// ============================================================================
// LOGÃSTICA / CAMINHÃƒO
// ============================================================================
export const LogisticsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="lgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#059669" />
        <stop offset="100%" stopColor="#047857" />
      </linearGradient>
    </defs>
    {/* Caixa do caminhÃ£o */}
    <path d="M6 20 H26 L24 12 H8 L6 20 Z" fill="url(#lgGrad)" stroke="#064e3b" strokeWidth="1.5" />
    {/* Cabina */}
    <path d="M26 12 L30 12 L30 20 H26 Z" fill="#064e3b" />
    {/* Janela da cabina */}
    <rect x="27" y="13" width="2" height="2" rx="0.4" fill="#93c5fd" />
    {/* Rodas */}
    <circle cx="9" cy="23" r="2.5" fill="#0f172a" />
    <circle cx="9" cy="23" r="1" fill="#94a3b8" />
    <circle cx="27" cy="23" r="2.5" fill="#0f172a" />
    <circle cx="27" cy="23" r="1" fill="#94a3b8" />
    {/* Caixa de carga atrÃ¡s */}
    <rect x="7" y="13" width="3" height="3" rx="0.4" fill="rgba(255,255,255,0.15)" />
    <rect x="11" y="13" width="3" height="3" rx="0.4" fill="rgba(255,255,255,0.15)" />
    <rect x="15" y="13" width="3" height="3" rx="0.4" fill="rgba(255,255,255,0.15)" />
    <rect x="19" y="13" width="3" height="3" rx="0.4" fill="rgba(255,255,255,0.15)" />
  </svg>
);

// ============================================================================
// PORTO DE PONTA DELGADA / Ã‚NCORA
// ============================================================================
export const PortIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ptGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0f766e" />
        <stop offset="100%" stopColor="#0d9488" />
      </linearGradient>
    </defs>
    {/* Ã‚ncora */}
    <path d="M16 6 V26" stroke="url(#ptGrad)" strokeWidth="3" strokeLinecap="round" />
    <path d="M12 14 H20" stroke="url(#ptGrad)" strokeWidth="3" strokeLinecap="round" />
    <path d="M12 14 Q16 10 20 14" stroke="#0f766e" strokeWidth="1.5" fill="none" />
    <path d="M11 19 L16 26 L21 19" stroke="url(#ptGrad)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <circle cx="16" cy="22" r="1.6" fill="#f1f5f9" stroke="#0f766e" strokeWidth="1" />
    {/* Ãgua */}
    <path d="M4 28 Q16 24 28 28" stroke="#38bdf8" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <path d="M4 30 Q16 26 28 30" stroke="#38bdf8" strokeWidth="2" fill="none" strokeLinecap="round" />
    {/* Docas */}
    <rect x="2" y="27" width="1" height="1" fill="#94a3b8" />
    <rect x="30" y="27" width="1" height="1" fill="#94a3b8" />
  </svg>
);

// ============================================================================
// NAVIOS / NAVIO DE CONTENTORES
// ============================================================================
export const ShipsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="shGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1e293b" />
        <stop offset="100%" stopColor="#0f172a" />
      </linearGradient>
    </defs>
    {/* Casco do navio */}
    <path d="M5 18 L7 12 H25 L27 18 Z" fill="url(#shGrad)" stroke="#0f172a" strokeWidth="1.5" />
    <path d="M5 18 L7 12" stroke="#475569" strokeWidth="1" />
    <path d="M25 12 L27 18" stroke="#475569" strokeWidth="1" />
    {/* Contentores */}
    <rect x="9" y="8" width="4" height="4" rx="0.4" fill="#ef4444" />
    <rect x="14" y="8" width="4" height="4" rx="0.4" fill="#f59e0b" />
    <rect x="19" y="8" width="4" height="4" rx="0.4" fill="#10b981" />
    <rect x="9" y="12" width="4" height="4" rx="0.4" fill="#3b82f6" />
    <rect x="14" y="12" width="4" height="4" rx="0.4" fill="#a855f7" />
    <rect x="19" y="12" width="4" height="4" rx="0.4" fill="#ec4899" />
    {/* Ponte de comando */}
    <rect x="22" y="6" width="5" height="6" rx="0.5" fill="#1e293b" stroke="#0f172a" strokeWidth="1" />
    <rect x="23" y="7" width="1" height="1" rx="0.2" fill="#fbbf24" />
    <rect x="25" y="7" width="1" height="1" rx="0.2" fill="#fbbf24" />
    {/* Ãgua */}
    <path d="M4 22 Q16 18 28 22" stroke="#22d3ee" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <path d="M4 24 Q16 20 28 24" stroke="#22d3ee" strokeWidth="2" fill="none" strokeLinecap="round" />
    {/* ChaminÃ© */}
    <rect x="15" y="6" width="2" height="4" rx="0.3" fill="#ef4444" />
    <rect x="15.5" y="6.4" width="1" height="0.8" fill="#fbbf24" />
  </svg>
);

// ============================================================================
// MARINHA PORTUGUESA / ESCUDO
// ============================================================================
export const NavyIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="nvGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1e3a8a" />
        <stop offset="100%" stopColor="#1e40af" />
      </linearGradient>
    </defs>
    {/* Escudo */}
    <path d="M10 10 Q16 4 22 10 L22 24 Q16 28 10 24 Z" fill="url(#nvGrad)" stroke="#1e3a8a" strokeWidth="1.5" />
    {/* Cruz de Malta simplificada */}
    <path d="M14 12 H18 V16 H14 Z" fill="#f1f5f9" />
    <path d="M16 10 V14 M14 12 H18" stroke="#f1f5f9" strokeWidth="1" />
    {/* Ã‚ncora marÃ­tima dentro do escudo */}
    <path d="M16 18 V24" stroke="#f1f5f9" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M14 20 H18" stroke="#f1f5f9" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M13 23 L16 26 L19 23" stroke="#f1f5f9" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    {/* Faixa dourada */}
    <rect x="10" y="10" width="12" height="1.5" fill="#f59e0b" />
  </svg>
);

// ============================================================================
// GLOBALFISH AZORES / GLOBO
// ============================================================================
export const GlobeIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="glGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0ea5e9" />
        <stop offset="100%" stopColor="#0369a1" />
      </linearGradient>
    </defs>
    {/* Globo */}
    <circle cx="16" cy="16" r="10" fill="url(#glGrad)" stroke="#0369a1" strokeWidth="1.5" />
    {/* Continentes (estilizados) */}
    <path d="M9 12 Q12 10 16 12 Q20 10 23 12" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none" />
    <path d="M10 16 Q14 14 18 16 Q22 14 24 16" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none" />
    <path d="M9 20 Q12 18 16 20 Q20 18 23 20" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none" />
    {/* Linhas de latitude/longitude */}
    <path d="M6 16 H26" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
    <path d="M16 6 V26" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
    <path d="M10 6 Q16 12 22 6" stroke="rgba(255,255,255,0.15)" strokeWidth="1" fill="none" />
    <path d="M10 26 Q16 20 22 26" stroke="rgba(255,255,255,0.15)" strokeWidth="1" fill="none" />
    {/* Peixe (referÃªncia GlobalFish) */}
    <path d="M12 20 Q14 18 16 20 Q18 18 20 20" stroke="#fbbf24" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M16 20 Q14 22 16 24" stroke="#fbbf24" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </svg>
);

// ============================================================================
// DGRM VISTORIAS / DOCUMENTO
// ============================================================================
export const DgrmIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="dgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4f46e5" />
        <stop offset="100%" stopColor="#4338ca" />
      </linearGradient>
    </defs>
    {/* Documento */}
    <rect x="8" y="8" width="16" height="20" rx="1" fill="url(#dgGrad)" stroke="#3730a3" strokeWidth="1" />
    {/* Linhas de texto */}
    <rect x="10" y="12" width="12" height="1.2" rx="0.3" fill="rgba(255,255,255,0.25)" />
    <rect x="10" y="14.2" width="10" height="1.2" rx="0.3" fill="rgba(255,255,255,0.2)" />
    <rect x="10" y="16.4" width="11" height="1.2" rx="0.3" fill="rgba(255,255,255,0.2)" />
    <rect x="10" y="22" width="10" height="1.2" rx="0.3" fill="rgba(255,255,255,0.25)" />
    <rect x="10" y="24.2" width="12" height="1.2" rx="0.3" fill="rgba(255,255,255,0.2)" />
    {/* Selo/carimbo no canto */}
    <circle cx="20" cy="25" r="2.5" fill="rgba(245,158,11,0.35)" stroke="#f59e0b" strokeWidth="1.5" />
    <circle cx="20" cy="25" r="0.6" fill="#f59e0b" />
    {/* Aba superior do documento */}
    <rect x="8" y="8" width="16" height="4" rx="1" fill="#3730a3" />
  </svg>
);

// ============================================================================
// AUDITORIA / LUPA
// ============================================================================
export const AuditIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="auGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
    </defs>
    {/* Lupa */}
    <circle cx="12" cy="12" r="6" fill="none" stroke="url(#auGrad)" strokeWidth="2.5" />
    <path d="M15.5 15.5 L20 20" stroke="url(#auGrad)" strokeWidth="2.5" strokeLinecap="round" />
    {/* Documento atrÃ¡s */}
    <rect x="14" y="10" width="14" height="18" rx="1" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="16" y="13" width="3" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="16" y="15" width="4" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="16" y="17" width="3" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="16" y="21" width="4" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="16" y="23" width="3" height="1" rx="0.2" fill="#94a3b8" />
    {/* Marca de check verde */}
    <path d="M10 16 L12 18 L18 12" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

// ============================================================================
// ALERTAS / SIRENE
// ============================================================================
export const AlertsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="alGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ef4444" />
        <stop offset="100%" stopColor="#b91c1c" />
      </linearGradient>
    </defs>
    {/* Sirene */}
    <path d="M10 10 Q16 4 22 10 L22 22 Q16 28 10 22 Z" fill="url(#alGrad)" stroke="#991b1b" strokeWidth="1.5" />
    {/* Luz intermitente */}
    <circle cx="16" cy="14" r="2" fill="#fbbf24" />
    <circle cx="16" cy="14" r="0.8" fill="#fef3c7" />
    {/* Ondas de som */}
    <path d="M12 20 Q16 16 20 20" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M10 22 Q16 18 22 22" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    {/* Base */}
    <rect x="14" y="24" width="4" height="2" rx="0.4" fill="#94a3b8" />
  </svg>
);

// ============================================================================
// NOTIFICAÃ‡Ã•ES / SINO
// ============================================================================
export const NotificationsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ntGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3b82f6" />
        <stop offset="100%" stopColor="#2563eb" />
      </linearGradient>
    </defs>
    {/* Sino */}
    <path d="M10 14 Q16 8 22 14 L22 24 H10 Z" fill="url(#ntGrad)" stroke="#1d4ed8" strokeWidth="1.5" />
    {/* Batente */}
    <rect x="14" y="10" width="4" height="4" rx="0.5" fill="#fbbf24" stroke="#d97706" strokeWidth="1" />
    {/* Ondas de som */}
    <path d="M8 16 Q16 12 24 16" stroke="rgba(59,130,246,0.3)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M6 20 Q16 16 26 20" stroke="rgba(59,130,246,0.2)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    {/* Base de suporte */}
    <path d="M12 14 L12 10 M20 14 L20 10" stroke="#1d4ed8" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// ============================================================================
// PEDIDOS DE ASSISTÃŠNCIA / ENVELOPE
// ============================================================================
export const AssistanceIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="asGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#818cf8" />
        <stop offset="100%" stopColor="#6366f1" />
      </linearGradient>
    </defs>
    {/* Envelope */}
    <path d="M7 10 L16 16 L25 10 L25 26 L7 26 Z" fill="url(#asGrad)" stroke="#4f46e5" strokeWidth="1.5" />
    <path d="M16 16 L7 10" stroke="#4338ca" strokeWidth="1" />
    <path d="M16 16 L25 10" stroke="#4338ca" strokeWidth="1" />
    <path d="M7 26 L16 16 L25 26" stroke="#4338ca" strokeWidth="1" />
    {/* Selos de prioridade */}
    <circle cx="12" cy="13" r="1" fill="#fbbf24" />
    <circle cx="20" cy="19" r="0.8" fill="#fbbf24" />
    {/* Documento a sair do envelope */}
    <rect x="13.5" y="20" width="5" height="5" rx="0.5" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="14.5" y="21" width="3" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="14.5" y="22.5" width="2.5" height="1" rx="0.2" fill="#94a3b8" />
  </svg>
);

// ============================================================================
// BACKUPS / DISCO + NUVEM
// ============================================================================
export const BackupsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bkGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="100%" stopColor="#0891b2" />
      </linearGradient>
    </defs>
    {/* Nuvem */}
    <path d="M10 14 Q8 14 8 16 Q8 20 12 20 Q16 20 16 16 Q16 12 12 12 Q8 12 10 14 Z" fill="url(#bkGrad)" stroke="#0891b2" strokeWidth="1.5" />
    {/* Disquete/disco atrÃ¡s */}
    <rect x="16" y="10" width="10" height="14" rx="0.8" fill="#1e293b" stroke="#0f172a" strokeWidth="1" />
    <rect x="17" y="11" width="8" height="3" rx="0.4" fill="#475569" />
    <rect x="17.5" y="15" width="7" height="6" rx="0.4" fill="#334155" stroke="#475569" strokeWidth="1" />
    <rect x="19" y="16" width="1" height="1" rx="0.2" fill="#64748b" />
    <rect x="21" y="16" width="1" height="1" rx="0.2" fill="#64748b" />
    <rect x="23" y="16" width="1" height="1" rx="0.2" fill="#64748b" />
    {/* Seta de download/sync na nuvem */}
    <path d="M14 16 L14 20 M12 18 L14 20 L16 18" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ============================================================================
// APLICAÃ‡Ã•ES / SMARTPHONE
// ============================================================================
export const AppsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="apGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#a855f7" />
        <stop offset="100%" stopColor="#7e22ce" />
      </linearGradient>
    </defs>
    {/* Smartphone */}
    <rect x="10" y="6" width="12" height="22" rx="2.5" fill="url(#apGrad)" stroke="#5b21b6" strokeWidth="1.5" />
    <rect x="11" y="7" width="10" height="20" rx="2" fill="#1e293b" />
    {/* Ãcones de apps no ecrÃ£ */}
    <rect x="13" y="10" width="3" height="3" rx="0.5" fill="#ef4444" />
    <rect x="17" y="10" width="3" height="3" rx="0.5" fill="#f59e0b" />
    <rect x="13" y="14" width="3" height="3" rx="0.5" fill="#10b981" />
    <rect x="17" y="14" width="3" height="3" rx="0.5" fill="#3b82f6" />
    <rect x="13" y="18" width="3" height="3" rx="0.5" fill="#a855f7" />
    <rect x="17" y="18" width="3" height="3" rx="0.5" fill="#ec4899" />
    <rect x="13" y="22" width="3" height="3" rx="0.5" fill="#06b6d4" />
    <rect x="17" y="22" width="3" height="3" rx="0.5" fill="#84cc16" />
    {/* Barra de status */}
    <rect x="12" y="9" width="1" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="14" y="9" width="1" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="16" y="9" width="1" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="18" y="9" width="1" height="1" rx="0.2" fill="#94a3b8" />
  </svg>
);

// ============================================================================
// CRIAR OT / CLIPBOARD
// ============================================================================
export const CreateOTIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="otGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
    </defs>
    {/* Clipboard */}
    <rect x="8" y="8" width="16" height="20" rx="1" fill="url(#otGrad)" stroke="#92400e" strokeWidth="1.5" />
    <rect x="8" y="8" width="16" height="5" rx="1" fill="#92400e" />
    {/* Gancho superior */}
    <rect x="13.5" y="5" width="5" height="3" rx="0.4" fill="#92400e" />
    {/* Linhas de texto */}
    <rect x="10" y="14" width="12" height="1" rx="0.2" fill="rgba(255,255,255,0.25)" />
    <rect x="10" y="16" width="10" height="1" rx="0.2" fill="rgba(255,255,255,0.2)" />
    <rect x="10" y="18" width="11" height="1" rx="0.2" fill="rgba(255,255,255,0.2)" />
    <rect x="10" y="22" width="10" height="1" rx="0.2" fill="rgba(255,255,255,0.25)" />
    <rect x="10" y="24" width="12" height="1" rx="0.2" fill="rgba(255,255,255,0.2)" />
    <rect x="10" y="26" width="8" height="1" rx="0.2" fill="rgba(255,255,255,0.2)" />
  </svg>
);

// ============================================================================
// ORDENS DE SERVIÃ‡O / LISTA
// ============================================================================
export const OrdersIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="orGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0ea5e9" />
        <stop offset="100%" stopColor="#0369a1" />
      </linearGradient>
    </defs>
    {/* Painel */}
    <rect x="8" y="8" width="16" height="20" rx="1" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="8" y="8" width="16" height="4" rx="1" fill="#e2e8f0" />
    {/* Itens da lista */}
    <rect x="10" y="14" width="14" height="1.5" rx="0.3" fill="#94a3b8" />
    <rect x="10" y="17" width="12" height="1.5" rx="0.3" fill="#94a3b8" />
    <rect x="10" y="20" width="13" height="1.5" rx="0.3" fill="#94a3b8" />
    <rect x="10" y="23" width="11" height="1.5" rx="0.3" fill="#94a3b8" />
    <rect x="10" y="26" width="14" height="1.5" rx="0.3" fill="#94a3b8" />
    {/* Marcadores de prioridade */}
    <rect x="9" y="14" width="0.8" height="1.5" rx="0.2" fill="#ef4444" />
    <rect x="9" y="20" width="0.8" height="1.5" rx="0.2" fill="#f59e0b" />
    <rect x="9" y="26" width="0.8" height="1.5" rx="0.2" fill="#10b981" />
  </svg>
);

// ============================================================================
// ORÃ‡AMENTOS / CALCULADORA
// ============================================================================
export const BudgetsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="buGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ec4899" />
        <stop offset="100%" stopColor="#be185d" />
      </linearGradient>
    </defs>
    {/* Calculadora */}
    <rect x="8" y="8" width="16" height="20" rx="1.5" fill="url(#buGrad)" stroke="#9d174d" strokeWidth="1.5" />
    {/* EcrÃ£ */}
    <rect x="10" y="11" width="12" height="3" rx="0.4" fill="#0f172a" />
    <rect x="11" y="11.6" width="2" height="1" rx="0.2" fill="#06b6d4" />
    <rect x="13.5" y="11.6" width="2" height="1" rx="0.2" fill="#06b6d4" />
    <rect x="16" y="11.6" width="2" height="1" rx="0.2" fill="#06b6d4" />
    <rect x="18.5" y="11.6" width="2" height="1" rx="0.2" fill="#06b6d4" />
    {/* Teclas */}
    <rect x="10.5" y="16" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.2)" />
    <rect x="13.5" y="16" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.2)" />
    <rect x="16.5" y="16" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.2)" />
    <rect x="19.5" y="16" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.2)" />
    <rect x="10.5" y="19" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.2)" />
    <rect x="13.5" y="19" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.2)" />
    <rect x="16.5" y="19" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.2)" />
    <rect x="19.5" y="19" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.2)" />
    <rect x="10.5" y="22" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.2)" />
    <rect x="13.5" y="22" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.2)" />
    <rect x="16.5" y="22" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.2)" />
    <rect x="19.5" y="22" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.2)" />
  </svg>
);

// ============================================================================
// FATURAÃ‡ÃƒO / FATURA
// ============================================================================
export const InvoicingIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2563eb" />
        <stop offset="100%" stopColor="#1d4ed8" />
      </linearGradient>
    </defs>
    {/* Fatura */}
    <rect x="7" y="7" width="18" height="22" rx="1" fill="url(#inGrad)" stroke="#1e3a8a" strokeWidth="1.5" />
    <rect x="7" y="7" width="18" height="5" rx="1" fill="#1e3a8a" />
    {/* Logo da fatura */}
    <rect x="10" y="9" width="3" height="2" rx="0.3" fill="#fbbf24" />
    <rect x="14" y="9" width="3" height="2" rx="0.3" fill="#fbbf24" />
    <rect x="18" y="9" width="3" height="2" rx="0.3" fill="#fbbf24" />
    {/* Linhas de itens */}
    <rect x="9" y="15" width="14" height="1.2" rx="0.3" fill="rgba(255,255,255,0.25)" />
    <rect x="9" y="17.5" width="12" height="1.2" rx="0.3" fill="rgba(255,255,255,0.2)" />
    <rect x="9" y="20" width="13" height="1.2" rx="0.3" fill="rgba(255,255,255,0.2)" />
    <rect x="9" y="23" width="14" height="1.2" rx="0.3" fill="rgba(255,255,255,0.25)" />
    {/* Total */}
    <rect x="9" y="26" width="14" height="1.2" rx="0.3" fill="rgba(255,255,255,0.35)" />
    <rect x="9" y="28.5" width="16" height="1" rx="0.3" fill="rgba(255,255,255,0.2)" />
  </svg>
);

// ============================================================================
// COBRANÃ‡AS / DINHEIRO
// ============================================================================
export const CollectionsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="coGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#84cc16" />
        <stop offset="100%" stopColor="#65a30d" />
      </linearGradient>
    </defs>
    {/* Caixa registadora */}
    <rect x="8" y="8" width="16" height="18" rx="1" fill="url(#coGrad)" stroke="#4d7c0f" strokeWidth="1.5" />
    {/* EcrÃ£ */}
    <rect x="10" y="10" width="12" height="3" rx="0.4" fill="#0f172a" />
    <rect x="11" y="10.6" width="2" height="1" rx="0.2" fill="#22c55e" />
    <rect x="13.5" y="10.6" width="2" height="1" rx="0.2" fill="#22c55e" />
    <rect x="16" y="10.6" width="2" height="1" rx="0.2" fill="#22c55e" />
    <rect x="18.5" y="10.6" width="2" height="1" rx="0.2" fill="#22c55e" />
    {/* Teclas numÃ©ricas */}
    <rect x="10.5" y="15" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.15)" />
    <rect x="13.5" y="15" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.15)" />
    <rect x="16.5" y="15" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.15)" />
    <rect x="10.5" y="18" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.15)" />
    <rect x="13.5" y="18" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.15)" />
    <rect x="16.5" y="18" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.15)" />
    <rect x="10.5" y="21" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.15)" />
    <rect x="13.5" y="21" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.15)" />
    <rect x="16.5" y="21" width="2" height="2" rx="0.4" fill="rgba(255,255,255,0.15)" />
    {/* Nota de dinheiro a sair */}
    <rect x="12" y="25" width="8" height="4" rx="0.4" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="13" y="26" width="2" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="16" y="26" width="2" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="19" y="26" width="2" height="1" rx="0.2" fill="#94a3b8" />
  </svg>
);

// ============================================================================
// CONTAS A RECEBER / GRÃFICO + DINHEIRO
// ============================================================================
export const ReceivablesIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="rcGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0891b2" />
        <stop offset="100%" stopColor="#0e7490" />
      </linearGradient>
    </defs>
    {/* GrÃ¡fico de barras invertido */}
    <rect x="8" y="12" width="3" height="6" rx="0.4" fill="url(#rcGrad)" />
    <rect x="12" y="10" width="3" height="8" rx="0.4" fill="url(#rcGrad)" />
    <rect x="16" y="8" width="3" height="10" rx="0.4" fill="url(#rcGrad)" />
    <rect x="20" y="11" width="3" height="9" rx="0.4" fill="url(#rcGrad)" />
    <rect x="24" y="10" width="3" height="8" rx="0.4" fill="url(#rcGrad)" />
    {/* SÃ­mbolo de moeda sobreposto */}
    <path d="M14 22 Q16 20 18 22 Q16 24 14 22" stroke="url(#rcGrad)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <path d="M14 24 L18 24" stroke="url(#rcGrad)" strokeWidth="2.5" strokeLinecap="round" />
    {/* Base do grÃ¡fico */}
    <path d="M7 22 H27" stroke="#cbd5e1" strokeWidth="1.5" />
  </svg>
);

// ============================================================================
// RELATÃ“RIO DE VALIDADES / CALENDÃRIO + CHECK
// ============================================================================
export const ValidityReportIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="vrGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
    </defs>
    {/* CalendÃ¡rio */}
    <rect x="7" y="7" width="18" height="20" rx="1" fill="url(#vrGrad)" stroke="#92400e" strokeWidth="1.5" />
    <rect x="7" y="7" width="18" height="5" rx="1" fill="#92400e" />
    {/* Dias */}
    <path d="M10 14 H22" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M10 17 H22" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M10 20 H22" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M10 23 H22" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" />
    {/* Data destacada com check */}
    <rect x="13" y="13" width="6" height="4" rx="0.8" fill="rgba(255,255,255,0.2)" />
    <path d="M15 15.5 L16 16.5 L18 14.5" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

// ============================================================================
// RENTABILIDADE / GRÃFICO DE CRESCIMENTO
// ============================================================================
export const ProfitabilityIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="pfGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#22c55e" />
        <stop offset="100%" stopColor="#16a34a" />
      </linearGradient>
    </defs>
    {/* GrÃ¡fico de Ã¡rea crescente */}
    <path d="M6 26 L10 20 L14 16 L18 12 L22 14 L26 10 L26 26 Z" fill="url(#pfGrad)" opacity="0.35" />
    <path d="M6 26 L10 20 L14 16 L18 12 L22 14 L26 10" stroke="url(#pfGrad)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    {/* Pontos de dados */}
    <circle cx="10" cy="20" r="1" fill="#22c55e" />
    <circle cx="14" cy="16" r="1" fill="#22c55e" />
    <circle cx="18" cy="12" r="1" fill="#22c55e" />
    <circle cx="22" cy="14" r="1" fill="#22c55e" />
    <circle cx="26" cy="10" r="1" fill="#22c55e" />
    {/* Eixo Y */}
    <path d="M6 6 V26" stroke="#cbd5e1" strokeWidth="1.5" />
    {/* Base */}
    <path d="M6 26 H26" stroke="#cbd5e1" strokeWidth="1.5" />
  </svg>
);

// ============================================================================
// JANGADAS / JANGADA SALVA-VIDAS
// ============================================================================
export const RaftsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="rfGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ef4444" />
        <stop offset="100%" stopColor="#b91c1c" />
      </linearGradient>
    </defs>
    {/* Jangada salva-vidas (estojo) */}
    <path d="M8 16 Q16 10 24 16 L24 22 Q16 28 8 22 Z" fill="url(#rfGrad)" stroke="#991b1b" strokeWidth="1.5" />
    {/* Cordas/alisas */}
    <path d="M12 18 L14 22" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
    <path d="M16 18 L16 22" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
    <path d="M20 18 L18 22" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
    {/* AlÃ§a superior */}
    <path d="M14 12 Q16 10 18 12" stroke="#991b1b" strokeWidth="1.5" fill="none" />
    <rect x="15.5" y="11.5" width="1" height="1" rx="0.2" fill="#991b1b" />
    {/* Etiqueta de identificaÃ§Ã£o */}
    <rect x="13" y="20" width="6" height="2" rx="0.4" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="14" y="20.5" width="1.5" height="1" rx="0.2" fill="#94a3b8" />
    {/* Ãgua por baixo */}
    <path d="M8 22 Q16 20 24 22" stroke="#22d3ee" strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
);

// ============================================================================
// ESTADO JANGADA
// ============================================================================
export const RaftStateIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="rsGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ef4444" />
        <stop offset="100%" stopColor="#b91c1c" />
      </linearGradient>
    </defs>
    {/* Jangada com estado */}
    <path d="M8 16 Q16 10 24 16 L24 22 Q16 28 8 22 Z" fill="url(#rsGrad)" stroke="#991b1b" strokeWidth="1.5" />
    {/* Linha de estado/inspecÃ§Ã£o */}
    <path d="M10 20 L22 20" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
    {/* Check de aprovado */}
    <path d="M14 17 L16 19 L20 16" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    {/* Cordas */}
    <path d="M12 18 L14 22" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
    <path d="M16 18 L16 22" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
    <path d="M20 18 L18 22" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
    {/* AlÃ§a */}
    <path d="M14 12 Q16 10 18 12" stroke="#991b1b" strokeWidth="1.5" fill="none" />
  </svg>
);

// ============================================================================
// INSPEÃ‡Ã•ES / LUPA + CHECK
// ============================================================================
export const InspectionsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ipGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0ea5e9" />
        <stop offset="100%" stopColor="#0369a1" />
      </linearGradient>
    </defs>
    {/* Lupa */}
    <circle cx="11" cy="11" r="5" fill="none" stroke="url(#ipGrad)" strokeWidth="2.5" />
    <path d="M14.5 14.5 L19 19" stroke="url(#ipGrad)" strokeWidth="2.5" strokeLinecap="round" />
    {/* Check dentro da lupa */}
    <path d="M9 11.5 L10.5 13 L12.5 11" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    {/* Documento inspecionado atrÃ¡s */}
    <rect x="13" y="11" width="15" height="16" rx="1" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="15" y="13" width="3" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="15" y="15" width="4" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="15" y="17" width="3" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="15" y="21" width="4" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="15" y="23" width="3" height="1" rx="0.2" fill="#94a3b8" />
  </svg>
);

// ============================================================================
// PACKS / MOCHILA DE SEGURANÃ‡A
// ============================================================================
export const PacksIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="pkGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4f46e5" />
        <stop offset="100%" stopColor="#4338ca" />
      </linearGradient>
    </defs>
    {/* Mochila/pack */}
    <path d="M10 18 L10 12 Q16 6 22 12 L22 18 Z" fill="url(#pkGrad)" stroke="#3730a3" strokeWidth="1.5" />
    {/* AlÃ§as */}
    <path d="M11 12 Q11 8 13 8" stroke="#3730a3" strokeWidth="1.5" fill="none" />
    <path d="M21 12 Q21 8 19 8" stroke="#3730a3" strokeWidth="1.5" fill="none" />
    {/* ZÃ­per */}
    <path d="M10 15 L22 15" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
    {/* Itens visÃ­veis na abertura superior */}
    <rect x="13" y="9" width="2" height="2" rx="0.4" fill="#fbbf24" />
    <rect x="17" y="9" width="2" height="2" rx="0.4" fill="#ef4444" />
    <rect x="15" y="11" width="2" height="2" rx="0.4" fill="#10b981" />
    {/* Base da mochila */}
    <path d="M10 18 Q16 24 22 18" stroke="#3730a3" strokeWidth="1.5" fill="none" />
  </svg>
);

// ============================================================================
// EPIRBS / SATÃ‰LITE + SINAL
// ============================================================================
export const EpirbsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="epGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="100%" stopColor="#0891b2" />
      </linearGradient>
    </defs>
    {/* Dispositivo EPIRB */}
    <rect x="10" y="12" width="12" height="14" rx="1" fill="url(#epGrad)" stroke="#0e7490" strokeWidth="1.5" />
    <rect x="10" y="12" width="12" height="4" rx="1" fill="#0e7490" />
    {/* Antena */}
    <path d="M16 10 L16 12" stroke="#0e7490" strokeWidth="2" strokeLinecap="round" />
    <rect x="15" y="8" width="2" height="2" rx="0.3" fill="#0e7490" />
    {/* Sinais de rÃ¡dio */}
    <path d="M10 20 Q16 14 22 20" stroke="rgba(6,182,212,0.4)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M9 24 Q16 16 23 24" stroke="rgba(6,182,212,0.25)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M14 26 Q16 24 18 26" stroke="rgba(6,182,212,0.2)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    {/* Luz de alarme */}
    <circle cx="16" cy="15" r="1" fill="#fbbf24" />
    {/* BotÃ£o de ativaÃ§Ã£o */}
    <rect x="14" y="18" width="4" height="2" rx="0.5" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
  </svg>
);

// ============================================================================
// COLETES / COLETE SALVA-VIDAS
// ============================================================================
export const LifejacketsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ljGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
    </defs>
    {/* Colete salva-vidas */}
    <path d="M10 12 Q16 6 22 12 L22 24 Q16 28 10 24 Z" fill="url(#ljGrad)" stroke="#92400e" strokeWidth="1.5" />
    {/* Faixas refletoras */}
    <rect x="10" y="16" width="12" height="1.5" fill="#fbbf24" opacity="0.9" />
    <rect x="14" y="13" width="1" height="8" fill="#fbbf24" opacity="0.9" />
    {/* AlÃ§as laterais */}
    <path d="M10 14 Q12 18 10 22" stroke="#92400e" strokeWidth="1.5" fill="none" />
    <path d="M22 14 Q20 18 22 22" stroke="#92400e" strokeWidth="1.5" fill="none" />
    {/* Etiqueta de identificaÃ§Ã£o */}
    <rect x="13" y="20" width="6" height="2" rx="0.4" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="14" y="20.5" width="1.5" height="1" rx="0.2" fill="#94a3b8" />
  </svg>
);

// ============================================================================
// FATOS DE IMERSÃƒO / FATO HÃšMIDO
// ============================================================================
export const ImmersionSuitsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="imGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1e293b" />
        <stop offset="100%" stopColor="#0f172a" />
      </linearGradient>
    </defs>
    {/* Fato de imersÃ£o */}
    <path d="M12 10 Q16 6 20 10 L22 18 Q16 24 10 18 Z" fill="url(#imGrad)" stroke="#0f172a" strokeWidth="1.5" />
    {/* Capuz */}
    <path d="M13 10 Q16 8 19 10" stroke="#0f172a" strokeWidth="1.5" fill="none" />
    {/* ZÃ­per central */}
    <path d="M16 10 L16 22" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
    {/* Punhos e tornozelos */}
    <rect x="10" y="16" width="2" height="1" rx="0.3" fill="#334155" />
    <rect x="20" y="16" width="2" height="1" rx="0.3" fill="#334155" />
    <rect x="10" y="22" width="2" height="1" rx="0.3" fill="#334155" />
    <rect x="20" y="22" width="2" height="1" rx="0.3" fill="#334155" />
    {/* Detalhe de costura */}
    <path d="M13 14 Q16 12 19 14" stroke="rgba(255,255,255,0.15)" strokeWidth="1" fill="none" />
    <path d="M13 18 Q16 16 19 18" stroke="rgba(255,255,255,0.15)" strokeWidth="1" fill="none" />
  </svg>
);

// ============================================================================
// CILINDROS / CILINDRO DE GÃS
// ============================================================================
export const CylindersIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cyGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ef4444" />
        <stop offset="100%" stopColor="#b91c1c" />
      </linearGradient>
    </defs>
    {/* Cilindro */}
    <rect x="12" y="10" width="8" height="16" rx="1" fill="url(#cyGrad)" stroke="#991b1b" strokeWidth="1.5" />
    {/* Tampa superior */}
    <ellipse cx="16" cy="10" rx="4" ry="2.5" fill="#991b1b" />
    <ellipse cx="16" cy="10" rx="3.5" ry="2" fill="#ef4444" />
    {/* Tampa inferior */}
    <ellipse cx="16" cy="26" rx="4" ry="1" fill="#991b1b" />
    {/* VÃ¡lvula */}
    <rect x="15.5" y="6" width="1" height="4" rx="0.3" fill="#94a3b8" />
    <rect x="15" y="6.5" width="2" height="1" rx="0.2" fill="#64748b" />
    {/* Etiqueta de pressÃ£o */}
    <rect x="12.5" y="17" width="7" height="4" rx="0.4" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="13.5" y="18" width="2" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="16" y="18" width="2" height="1" rx="0.2" fill="#94a3b8" />
    {/* Linhas de perigo */}
    <path d="M11 14 H21" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
    <path d="M11 16 H21" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
  </svg>
);

// ============================================================================
// STOCK / CAIXA DE ARMAZÃ‰M
// ============================================================================
export const StockIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="skGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3b82f6" />
        <stop offset="100%" stopColor="#2563eb" />
      </linearGradient>
    </defs>
    {/* ArmazÃ©m/prateleira */}
    <rect x="8" y="10" width="16" height="18" rx="1" fill="url(#skGrad)" stroke="#1e3a8a" strokeWidth="1.5" />
    <rect x="8" y="10" width="16" height="4" rx="1" fill="#1e3a8a" />
    {/* Prateleiras */}
    <path d="M10 16 H24" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
    <path d="M10 20 H24" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
    <path d="M10 24 H24" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
    {/* Caixas nas prateleiras */}
    <rect x="10.5" y="13" width="3" height="2" rx="0.3" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="18.5" y="13" width="3" height="2" rx="0.3" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="10.5" y="17" width="3" height="2" rx="0.3" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="18.5" y="17" width="3" height="2" rx="0.3" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="10.5" y="21" width="3" height="2" rx="0.3" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="18.5" y="21" width="3" height="2" rx="0.3" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="10.5" y="25" width="3" height="2" rx="0.3" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="18.5" y="25" width="3" height="2" rx="0.3" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    {/* Etiqueta de stock */}
    <rect x="12" y="28" width="8" height="2" rx="0.5" fill="#fbbf24" />
    <rect x="13" y="28.5" width="1" height="1" rx="0.2" fill="#d97706" />
    <rect x="15" y="28.5" width="1" height="1" rx="0.2" fill="#d97706" />
    <rect x="17" y="28.5" width="1" height="1" rx="0.2" fill="#d97706" />
  </svg>
);

// ============================================================================
// LEITOR DE STOCK / SCANNER
// ============================================================================
export const StockScannerIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="scGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="100%" stopColor="#0891b2" />
      </linearGradient>
    </defs>
    {/* Scanner portÃ¡til */}
    <path d="M10 14 Q16 8 22 14 L22 24 Q16 30 10 24 Z" fill="url(#scGrad)" stroke="#0e7490" strokeWidth="1.5" />
    {/* EcrÃ£ do scanner */}
    <rect x="12" y="16" width="8" height="6" rx="0.6" fill="#0f172a" />
    <rect x="13" y="17" width="2" height="1" rx="0.2" fill="#22d3ee" />
    <rect x="16" y="17" width="2" height="1" rx="0.2" fill="#22d3ee" />
    <rect x="19" y="17" width="2" height="1" rx="0.2" fill="#22d3ee" />
    {/* Linha de laser de leitura */}
    <path d="M12 21 H20" stroke="#22d3ee" strokeWidth="1" strokeDasharray="4 2" />
    <circle cx="16" cy="21" r="0.8" fill="#22d3ee" />
    {/* BotÃ£o de disparo */}
    <rect x="14" y="26" width="4" height="2" rx="0.5" fill="#ef4444" />
    {/* CÃ³digo de barras a ser lido */}
    <rect x="9" y="9" width="14" height="3" rx="0.4" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="9.5" y="9.5" width="0.6" height="2" fill="#94a3b8" />
    <rect x="10.5" y="9.5" width="0.6" height="2" fill="#94a3b8" />
    <rect x="11.5" y="9.5" width="0.6" height="2" fill="#94a3b8" />
    <rect x="12.5" y="9.5" width="0.6" height="2" fill="#94a3b8" />
    <rect x="13.5" y="9.5" width="0.6" height="2" fill="#94a3b8" />
    <rect x="14.5" y="9.5" width="0.6" height="2" fill="#94a3b8" />
    <rect x="15.5" y="9.5" width="0.6" height="2" fill="#94a3b8" />
    <rect x="16.5" y="9.5" width="0.6" height="2" fill="#94a3b8" />
    <rect x="17.5" y="9.5" width="0.6" height="2" fill="#94a3b8" />
    <rect x="18.5" y="9.5" width="0.6" height="2" fill="#94a3b8" />
    <rect x="19.5" y="9.5" width="0.6" height="2" fill="#94a3b8" />
    <rect x="20.5" y="9.5" width="0.6" height="2" fill="#94a3b8" />
    <rect x="21.5" y="9.5" width="0.6" height="2" fill="#94a3b8" />
  </svg>
);

// ============================================================================
// REPOSIÃ‡Ã•ES / CICLO DE SETAS
// ============================================================================
export const ReplenishmentsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="rpGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#a855f7" />
        <stop offset="100%" stopColor="#7e22ce" />
      </linearGradient>
    </defs>
    {/* Ciclo de reposiÃ§Ã£o */}
    <path d="M12 20 Q12 14 18 14 Q24 14 24 20" stroke="url(#rpGrad)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <path d="M24 20 Q24 26 18 26 Q12 26 12 20" stroke="url(#rpGrad)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    {/* Pontas de seta */}
    <path d="M18 14 L16 16 L18 18" stroke="url(#rpGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M12 26 L14 24 L12 22" stroke="url(#rpGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    {/* Caixa de stock no centro */}
    <rect x="13" y="17" width="6" height="6" rx="0.6" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="14" y="18" width="1" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="16" y="18" width="1" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="18" y="18" width="1" height="1" rx="0.2" fill="#94a3b8" />
  </svg>
);

// ============================================================================
// CLIENTES / PESSOAS
// ============================================================================
export const ClientsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="clGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3b82f6" />
        <stop offset="100%" stopColor="#2563eb" />
      </linearGradient>
    </defs>
    {/* TrÃªs pessoas */}
    <circle cx="10" cy="12" r="3" fill="url(#clGrad)" stroke="#1e3a8a" strokeWidth="1" />
    <path d="M7 15 Q10 22 13 15" stroke="url(#clGrad)" strokeWidth="3" strokeLinecap="round" fill="none" />
    <circle cx="16" cy="12" r="3" fill="url(#clGrad)" stroke="#1e3a8a" strokeWidth="1" />
    <path d="M13 15 Q16 22 19 15" stroke="url(#clGrad)" strokeWidth="3" strokeLinecap="round" fill="none" />
    <circle cx="22" cy="12" r="3" fill="url(#clGrad)" stroke="#1e3a8a" strokeWidth="1" />
    <path d="M19 15 Q22 22 25 15" stroke="url(#clGrad)" strokeWidth="3" strokeLinecap="round" fill="none" />
    {/* CartÃ£o de identificaÃ§Ã£o atrÃ¡s */}
    <rect x="8" y="18" width="16" height="10" rx="1" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="10" y="20" width="3" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="14" y="20" width="4" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="10" y="22" width="4" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="10" y="24" width="3" height="1" rx="0.2" fill="#94a3b8" />
  </svg>
);

// ============================================================================
// COMUNICAÃ‡Ã•ES & VOIP / TELEFONE
// ============================================================================
export const CommunicationsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cmGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0ea5e9" />
        <stop offset="100%" stopColor="#0369a1" />
      </linearGradient>
    </defs>
    {/* Telefone */}
    <path d="M10 10 Q12 12 12 20 Q12 28 10 30 Q8 32 6 30 Q4 28 4 20 Q4 12 6 10 Q8 8 10 8 Q12 8 14 10 Q14 12 14 20 Q14 28 12 30 Q10 32 8 30 Q6 28 6 20 Q6 12 8 10 Q10 8 12 8 Q14 8 16 10 Q16 12 16 20 Q16 28 14 30 Q18 32 20 30 Q22 28 22 20 Q22 12 20 10 Q18 8 16 8 Q14 8 12 10 Q12 12 10 10 Z" fill="none" stroke="url(#cmGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    {/* Ouvinte e microfone */}
    <circle cx="10" cy="10" r="0.8" fill="#fbbf24" />
    <circle cx="22" cy="30" r="0.8" fill="#fbbf24" />
    {/* Ondas de som */}
    <path d="M14 14 Q16 10 18 14" stroke="rgba(14,165,233,0.3)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M12 18 Q16 14 20 18" stroke="rgba(14,165,233,0.2)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </svg>
);

// ============================================================================
// QUALIDADE DE DADOS / CHECK + ESCUDO
// ============================================================================
export const DataQualityIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="dqGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#22c55e" />
        <stop offset="100%" stopColor="#16a34a" />
      </linearGradient>
    </defs>
    {/* Escudo de qualidade */}
    <path d="M10 10 Q16 4 22 10 L22 24 Q16 28 10 24 Z" fill="url(#dqGrad)" stroke="#14532d" strokeWidth="1.5" />
    {/* Check mark grande */}
    <path d="M12 16 L15 20 L22 12" stroke="#f8fafc" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    {/* Pontos de dados ao redor */}
    <circle cx="9" cy="9" r="0.8" fill="#f8fafc" />
    <circle cx="23" cy="9" r="0.8" fill="#f8fafc" />
    <circle cx="9" cy="25" r="0.8" fill="#f8fafc" />
    <circle cx="23" cy="25" r="0.8" fill="#f8fafc" />
    {/* Faixa de qualidade */}
    <rect x="10" y="10" width="12" height="1.5" fill="#fbbf24" />
  </svg>
);

// ============================================================================
// INTEGRIDADE / FECHO + ESCUDO
// ============================================================================
export const IntegrityIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="igGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1e3a8a" />
        <stop offset="100%" stopColor="#1e40af" />
      </linearGradient>
    </defs>
    {/* Escudo */}
    <path d="M10 10 Q16 4 22 10 L22 24 Q16 28 10 24 Z" fill="url(#igGrad)" stroke="#1e3a8a" strokeWidth="1.5" />
    {/* Fecho/cadeado */}
    <path d="M14 14 V12 Q14 10 16 10 Q18 10 18 12 V14" stroke="#fbbf24" strokeWidth="2" fill="none" strokeLinecap="round" />
    <circle cx="16" cy="13" r="2" fill="none" stroke="#fbbf24" strokeWidth="2" />
    {/* Barra vertical do fecho */}
    <path d="M16 15 V20" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
    {/* Raios de proteÃ§Ã£o */}
    <path d="M10 14 L8 12" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
    <path d="M22 14 L24 12" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
    <path d="M10 24 L8 26" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
    <path d="M22 24 L24 26" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
  </svg>
);

// ============================================================================
// CONFORMIDADE DGRM / SELO DE DOCUMENTO
// ============================================================================
export const ComplianceIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cpGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4f46e5" />
        <stop offset="100%" stopColor="#4338ca" />
      </linearGradient>
    </defs>
    {/* Documento */}
    <rect x="8" y="8" width="16" height="20" rx="1" fill="url(#cpGrad)" stroke="#3730a3" strokeWidth="1.5" />
    <rect x="8" y="8" width="16" height="4" rx="1" fill="#3730a3" />
    {/* Selo de conformidade (cÃ­rculo grande) */}
    <circle cx="16" cy="20" r="5" fill="none" stroke="#f59e0b" strokeWidth="3" />
    <circle cx="16" cy="20" r="3.5" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 4" />
    {/* Texto dentro do selo */}
    <rect x="14.5" y="19.5" width="1" height="1" fill="#f59e0b" />
    <rect x="16.5" y="19.5" width="1" height="1" fill="#f59e0b" />
    <rect x="15.5" y="20.5" width="1" height="1" fill="#f59e0b" />
    {/* Check dentro do selo */}
    <path d="M14 21 L16 23 L19 20" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    {/* Linhas do documento */}
    <rect x="10" y="14" width="12" height="1" rx="0.2" fill="rgba(255,255,255,0.2)" />
    <rect x="10" y="16" width="10" height="1" rx="0.2" fill="rgba(255,255,255,0.2)" />
  </svg>
);

// ============================================================================
// AUDITORIAS / LUPA + DOCUMENTO (diferente da Auditoria Survitec)
// ============================================================================
export const AuditsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="adGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ef4444" />
        <stop offset="100%" stopColor="#b91c1c" />
      </linearGradient>
    </defs>
    {/* Documento de auditoria */}
    <rect x="7" y="7" width="18" height="22" rx="1" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="7" y="7" width="18" height="4" rx="1" fill="#e2e8f0" />
    <rect x="9" y="13" width="14" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="9" y="15" width="12" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="9" y="19" width="13" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="9" y="23" width="14" height="1" rx="0.2" fill="#94a3b8" />
    {/* Lupa de auditoria sobreposta */}
    <circle cx="21" cy="11" r="3.5" fill="none" stroke="url(#adGrad)" strokeWidth="2.5" />
    <path d="M23.5 13.5 L27 17" stroke="url(#adGrad)" strokeWidth="2.5" strokeLinecap="round" />
    {/* Marca de revisÃ£o */}
    <path d="M10 27 L12 29 L16 25" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

// ============================================================================
// PROPOSTAS DO PORTAIL / DOCUMENTO COM LINHA
// ============================================================================
export const ProposalsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ppGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#22c55e" />
        <stop offset="100%" stopColor="#16a34a" />
      </linearGradient>
    </defs>
    {/* Documento de proposta */}
    <rect x="8" y="8" width="16" height="20" rx="1" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="8" y="8" width="16" height="4" rx="1" fill="#e2e8f0" />
    {/* TÃ­tulo da proposta */}
    <rect x="10" y="12" width="8" height="1" rx="0.2" fill="#94a3b8" />
    {/* Linhas de conteÃºdo */}
    <rect x="10" y="15" width="14" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="10" y="17" width="10" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="10" y="19" width="12" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="10" y="23" width="14" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="10" y="25" width="11" height="1" rx="0.2" fill="#94a3b8" />
    {/* Linha de assinatura */}
    <path d="M10 29 L20 29" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="10" cy="29" r="0.6" fill="#22c55e" />
    {/* Selo de aprovado */}
    <circle cx="22" cy="25" r="2" fill="rgba(34,197,94,0.2)" stroke="#22c55e" strokeWidth="1.5" />
    <path d="M21 24.5 L22 25.5 L23 24" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

// ============================================================================
// DEPARTAMENTO TÃ‰CNICO / ENGRENAGEM + CÃ‰REBRO
// ============================================================================
export const TechDeptIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="tdGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#a855f7" />
        <stop offset="100%" stopColor="#7e22ce" />
      </linearGradient>
    </defs>
    {/* Engrenagem */}
    <circle cx="16" cy="14" r="5" fill="none" stroke="url(#tdGrad)" strokeWidth="2.5" />
    <path d="M16 9 L16 7 M16 19 L16 21 M9 16 L7 16 M23 16 L25 16" stroke="url(#tdGrad)" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M11.3 11.3 L10.1 10.1 M20.7 20.7 L19.5 19.5 M20.7 11.3 L19.5 10.1 M11.3 20.7 L10.1 19.5" stroke="url(#tdGrad)" strokeWidth="2" strokeLinecap="round" />
    {/* Centro da engrenagem */}
    <circle cx="16" cy="14" r="1.2" fill="url(#tdGrad)" />
    {/* Linhas tÃ©cnicas/estruturais atrÃ¡s */}
    <rect x="11" y="22" width="10" height="6" rx="0.6" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="12" y="23" width="2" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="15" y="23" width="2" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="18" y="23" width="2" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="12" y="25" width="2" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="16" y="25" width="2" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="20" y="25" width="2" height="1" rx="0.2" fill="#94a3b8" />
  </svg>
);

// ============================================================================
// LEGISLAÃ‡ÃƒO / BALANÃ‡A DA JUSTIÃ‡A
// ============================================================================
export const LegislationIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="leGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4f46e5" />
        <stop offset="100%" stopColor="#4338ca" />
      </linearGradient>
    </defs>
    {/* BalanÃ§a da justiÃ§a */}
    <path d="M16 8 V24" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
    <path d="M10 12 H22" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
    {/* Pratos */}
    <path d="M12 16 Q16 14 20 16" stroke="#64748b" strokeWidth="1.5" fill="none" />
    <rect x="9.5" y="20" width="5" height="6" rx="0.5" fill="#cbd5e1" stroke="#64748b" strokeWidth="1" />
    <rect x="17.5" y="20" width="5" height="6" rx="0.5" fill="#cbd5e1" stroke="#64748b" strokeWidth="1" />
    {/* Cordas */}
    <path d="M12 16 L12 20 M20 16 L20 20" stroke="#64748b" strokeWidth="1" />
    {/* Livro de leis atrÃ¡s */}
    <rect x="9" y="8" width="14" height="18" rx="0.8" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="9" y="8" width="14" height="3" rx="0.8" fill="#e2e8f0" />
    {/* Linhas do livro */}
    <rect x="11" y="14" width="10" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="11" y="16" width="8" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="11" y="20" width="10" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="11" y="22" width="8" height="1" rx="0.2" fill="#94a3b8" />
  </svg>
);

// ============================================================================
// CERTIFICADOS EXTERNOS / PASTA DE CERTIFICADOS
// ============================================================================
export const CertificatesIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ceGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0ea5e9" />
        <stop offset="100%" stopColor="#0369a1" />
      </linearGradient>
    </defs>
    {/* Pasta de certificados */}
    <path d="M8 14 H24 V26 L8 26 Z" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />
    <path d="M8 14 H24 V10 L8 10 Z" fill="#e2e8f0" />
    <rect x="8" y="10" width="16" height="4" fill="none" stroke="#cbd5e1" strokeWidth="1" />
    {/* Etiqueta da pasta */}
    <rect x="12" y="10.5" width="8" height="2" rx="0.4" fill="#cbd5e1" />
    {/* Certificado a sair */}
    <rect x="10" y="6" width="12" height="10" rx="0.8" fill="#fff" stroke="#cbd5e1" strokeWidth="1.5" />
    <rect x="10" y="6" width="12" height="3" rx="0.8" fill="#f1f5f9" />
    <rect x="12" y="11" width="3" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="16" y="11" width="4" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="12" y="13" width="4" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="12" y="15" width="3" height="1" rx="0.2" fill="#94a3b8" />
    {/* Selo dourado no certificado */}
    <circle cx="19" cy="12.5" r="1.5" fill="#f59e0b" stroke="#d97706" strokeWidth="1" />
  </svg>
);

// ============================================================================
// ESTATÃSTICAS (duplicado na app) - reutiliza StatsIcon
// ============================================================================
export const StatisticsIcon = StatsIcon;

// ============================================================================
// RELATÃ“RIOS / GRÃFICO DE LINHA
// ============================================================================
export const ReportsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="rpGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#818cf8" />
        <stop offset="100%" stopColor="#6366f1" />
      </linearGradient>
    </defs>
    {/* Documento de relatÃ³rio */}
    <rect x="8" y="8" width="16" height="20" rx="1" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="8" y="8" width="16" height="4" rx="1" fill="#e2e8f0" />
    {/* GrÃ¡fico de linha dentro */}
    <path d="M10 18 Q14 14 16 18 Q18 22 20 18 Q24 14 26 18" stroke="url(#rpGrad)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="10" cy="18" r="0.8" fill="url(#rpGrad)" />
    <circle cx="16" cy="18" r="0.8" fill="url(#rpGrad)" />
    <circle cx="20" cy="18" r="0.8" fill="url(#rpGrad)" />
    <circle cx="26" cy="18" r="0.8" fill="url(#rpGrad)" />
    {/* Linhas de texto */}
    <rect x="10" y="24" width="10" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="10" y="26" width="12" height="1" rx="0.2" fill="#94a3b8" />
  </svg>
);

// ============================================================================
// CONTACTOS INTERNOS / TELEFONE FIXO
// ============================================================================
export const InternalContactsIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="icGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0ea5e9" />
        <stop offset="100%" stopColor="#0369a1" />
      </linearGradient>
    </defs>
    {/* Telefone de secretÃ¡ria */}
    <path d="M8 10 Q10 12 10 20 Q10 28 8 30 Q6 32 4 30 Q2 28 2 20 Q2 12 4 10 Q6 8 8 8 Q10 8 12 10 Q12 12 12 20 Q12 28 10 30 Q8 32 6 30 Q4 28 4 20 Q4 12 6 10 Q8 8 10 8 Q10 8 12 10 Q12 12 12 20 Q12 28 14 30 Q16 32 18 30 Q20 28 20 20 Q20 12 18 10 Q16 8 14 8 Q12 8 10 10 Q8 12 8 10 Z" fill="none" stroke="url(#icGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    {/* Base do telefone */}
    <rect x="10" y="22" width="12" height="3" rx="0.6" fill="#0f172a" />
    <rect x="14" y="22.5" width="1" height="2" rx="0.2" fill="#94a3b8" />
    <rect x="17" y="22.5" width="1" height="2" rx="0.2" fill="#94a3b8" />
  </svg>
);

// ============================================================================
// UTILIZADORES / UTILIZADOR ÃšNICO
// ============================================================================
export const UsersIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="usGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3b82f6" />
        <stop offset="100%" stopColor="#2563eb" />
      </linearGradient>
    </defs>
    {/* Utilizador */}
    <circle cx="16" cy="10" r="4" fill="url(#usGrad)" stroke="#1e3a8a" strokeWidth="1.5" />
    <path d="M10 16 Q16 22 22 16" stroke="url(#usGrad)" strokeWidth="3" strokeLinecap="round" fill="none" />
    {/* CartÃ£o de perfil atrÃ¡s */}
    <rect x="11" y="18" width="10" height="10" rx="1" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="13" y="20" width="2" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="17" y="20" width="4" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="13" y="22" width="4" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="13" y="24" width="3" height="1" rx="0.2" fill="#94a3b8" />
  </svg>
);

// ============================================================================
// ESTAÃ‡Ã•ES DE SERVIÃ‡O (duplicado) - reutiliza ServiceStationIcon
// ============================================================================
export const StationsIcon = ServiceStationIcon;

// ============================================================================
// ONEDRIVE / NUVEM
// ============================================================================
export const OneDriveIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="odGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="100%" stopColor="#0891b2" />
      </linearGradient>
    </defs>
    {/* Nuvem azul (OneDrive style) */}
    <path d="M10 14 Q8 14 8 16 Q8 20 12 20 Q16 20 16 16 Q16 12 12 12 Q8 12 10 14 Z" fill="url(#odGrad)" stroke="#0891b2" strokeWidth="1.5" />
    {/* Faixa branca da OneDrive */}
    <path d="M12 16 L12 20 L16 20 L16 16" stroke="#f8fafc" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M16 16 L20 16" stroke="#f8fafc" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    {/* Linhas de conectividade */}
    <path d="M6 18 Q11 14 16 18" stroke="rgba(6,182,212,0.3)" strokeWidth="1" fill="none" strokeLinecap="round" />
    <path d="M16 18 Q21 14 26 18" stroke="rgba(6,182,212,0.3)" strokeWidth="1" fill="none" strokeLinecap="round" />
  </svg>
);

// ============================================================================
// REGISTAR / MAIS + FORMULÃRIO
// ============================================================================
export const RegisterIcon = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="rgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#22c55e" />
        <stop offset="100%" stopColor="#16a34a" />
      </linearGradient>
    </defs>
    {/* FormulÃ¡rio de registo */}
    <rect x="8" y="8" width="16" height="20" rx="1" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
    <rect x="8" y="8" width="16" height="4" rx="1" fill="#e2e8f0" />
    {/* Campos de preenchimento */}
    <rect x="10" y="14" width="12" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="10" y="17" width="10" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="10" y="20" width="11" height="1" rx="0.2" fill="#94a3b8" />
    <rect x="10" y="24" width="10" height="1" rx="0.2" fill="#94a3b8" />
    {/* BotÃ£o de registo */}
    <rect x="11" y="27" width="10" height="2.5" rx="0.6" fill="url(#rgGrad)" />
    {/* Sinal de mais */}
    <path d="M15 27.5 L16 27.5 M15.5 27 L15.5 28" stroke="#f8fafc" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// ============================================================================
// NAVIGAÃ‡ÃƒO GERAL (usadas no header)
// ============================================================================
export const MenuIconRealistic = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="10" width="20" height="2" rx="1" fill="currentColor" />
    <rect x="6" y="15" width="20" height="2" rx="1" fill="currentColor" />
    <rect x="6" y="20" width="20" height="2" rx="1" fill="currentColor" />
  </svg>
);

export const ArrowBackRealistic = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22 16 L14 16 L18 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M14 16 L18 20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

export const ArrowForwardRealistic = (props: IconProps) => (
  <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 16 L18 16 L14 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M18 16 L14 20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

// ============================================================================
// MAPEAMENTO DE ÃCONES POR CHAVE (para uso no sidebar)
// ============================================================================
export const REALISTIC_ICONS: Record<string, React.ComponentType<IconProps>> = {
  // EstaÃ§Ã£o de ServiÃ§o
  'ðŸ—“ï¸': AgendaIcon,
  'ðŸ­': ServiceStationIcon,
  'ðŸ‘·': TechniciansIcon,
  'ðŸ“Š': StatsIcon,
  'ðŸ› ï¸': WorkshopIcon,
  'ðŸŽšï¸': CalibrationsIcon,
  'ðŸšš': LogisticsIcon,
  'âš“': PortIcon,
  'ðŸš¢': ShipsIcon,
  'ðŸ›¡ï¸': NavyIcon,
  'ðŸŒ': GlobeIcon,
  'ðŸ“œ': DgrmIcon,
  'ðŸ”': AuditIcon,
  'ðŸš¨': AlertsIcon,
  'ðŸ””': NotificationsIcon,
  'ðŸ“©': AssistanceIcon,
  'ðŸ’¾': BackupsIcon,
  'ðŸ“±': AppsIcon,
  // Ordens de ServiÃ§o
  'ðŸ“': CreateOTIcon,
  'ðŸ“‹': OrdersIcon,
  'ðŸ§®': BudgetsIcon,
  // Comercial & FaturaÃ§Ã£o
  'ðŸ’³': InvoicingIcon,
  'ðŸ’°': CollectionsIcon,
  'ðŸ“…': ValidityReportIcon,
  // Frota e Equipamento
  'ðŸ›¶': RaftsIcon,
  'ðŸ§Ÿ': RaftStateIcon,
  'ðŸŽ’': PacksIcon,
  'ðŸ“¡': EpirbsIcon,
  'ðŸ¦º': LifejacketsIcon,
  'ðŸ§¥': ImmersionSuitsIcon,
  'ðŸ«™': CylindersIcon,
  // Stock
  'ðŸ“¦': StockIcon,
  'ðŸ”„': StockScannerIcon,
  // Clientes
  'ðŸ‘¥': ClientsIcon,
  'ðŸ“¨': CommunicationsIcon,
  // DocumentaÃ§Ã£o & Qualidade
  'âœ…': DataQualityIcon,
  'ðŸ”’': IntegrityIcon,
  'ðŸ“„': ComplianceIcon,
  'ðŸ”Ž': AuditsIcon,
  'ðŸ§ ': TechDeptIcon,
  'âš–ï¸': LegislationIcon,
  'ðŸ“': CertificatesIcon,
  'ðŸ“ˆ': ReportsIcon,
  'â˜Žï¸': InternalContactsIcon,
  // AdministraÃ§Ã£o
  'ðŸ‘¤': UsersIcon,
  'â˜ï¸': OneDriveIcon,
  'âž•': RegisterIcon,
};

// Helper para obter um Ã­cone realista por chave (emoji ou nome)
export function getRealisticIcon(key: string | undefined) {
  if (!key) return ServiceStationIcon;
  return REALISTIC_ICONS[key] || ServiceStationIcon;
}

