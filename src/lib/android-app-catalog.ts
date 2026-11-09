import 'server-only';
import stations from '../../stations/stations.json';

type AndroidApp = 'tecnicos' | 'cliente';

export type PublishedApk = {
  version: string;
  /** Nome do ficheiro publicado em public/downloads/android/<estacao>/ */
  file: string;
  sizeBytes: number;
  sha256: string;
};

/**
 * APKs de release efetivamente verificados e publicados.
 * Só entram aqui depois de assinados e validados; os builds de debug nunca
 * são listados como versão distribuível.
 */
const PUBLISHED_APKS: Record<string, Partial<Record<AndroidApp, PublishedApk>>> = {
  acores: {
    tecnicos: { version: '2.3', file: 'orey-tecnicos-acores-2.3.apk', sizeBytes: 79112814, sha256: '29918757468469CFEC13ECC6FCCBF68103F6132CD79E29CF732F68EDE1C5E74F' },
    cliente: { version: '1.0', file: 'orey-cliente-acores-1.0.apk', sizeBytes: 35248763, sha256: '1CC3ED7532EB469A0B65A970FAFF7E5982029EE8F7D116E425A5B1241CB34315' },
  },
  lisboa: {
    tecnicos: { version: '2.3', file: 'orey-tecnicos-lisboa-2.3.apk', sizeBytes: 79112818, sha256: '44A44AC64F7944C3F2DE4301F896A9D571D5F80148FEC7D58F91D232563DE3A8' },
    cliente: { version: '1.0', file: 'orey-cliente-lisboa-1.0.apk', sizeBytes: 35248763, sha256: 'FCD0861A9FF5836D26E759D51A0E1184246D5587EBC885CCC8F21206DA72E53A' },
  },
  aveleda: {
    tecnicos: { version: '2.3', file: 'orey-tecnicos-aveleda-2.3.apk', sizeBytes: 79112818, sha256: '526FD0EF711262C3740A7DDFBE2C9268E024268BA9D530EB878D05DB611182A2' },
    cliente: { version: '1.0', file: 'orey-cliente-aveleda-1.0.apk', sizeBytes: 35248767, sha256: '6935C14A70AB485FE0EC444D48EE68FACCFC9618BA7F1E4446612B168696E2CA' },
  },
  alcantarilha: {
    tecnicos: { version: '2.3', file: 'orey-tecnicos-alcantarilha-2.3.apk', sizeBytes: 79112834, sha256: 'DB4AD20B4035A4E1FE2D94081255572F231CAFA50820AD4380954CB24EB677AD' },
    cliente: { version: '1.0', file: 'orey-cliente-alcantarilha-1.0.apk', sizeBytes: 35248783, sha256: '82BAC872A53498DC1F8D38DB50B2D214107CB91FD2F0F6FD695F3B760584D38E' },
  },
  setubal: {
    tecnicos: { version: '2.3', file: 'orey-tecnicos-setubal-2.3.apk', sizeBytes: 79112822, sha256: '63A9C2006BE1DC1505A74F8E736177A448A6380C19167330EE480722EF92B39F' },
    cliente: { version: '1.0', file: 'orey-cliente-setubal-1.0.apk', sizeBytes: 35248771, sha256: 'BFF19014CE39B26E14B103494F2F85BF247B5740F94F8ED4FE8A170307DF15CE' },
  },
};

const APP_LABELS: Record<AndroidApp, string> = {
  tecnicos: 'Orey Técnicos',
  cliente: 'Orey Cliente',
};

function readPublishedOverride(app: AndroidApp, slug: string) {
  const suffix = `${app}_${slug}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  // Lido apenas no servidor; nunca entra no bundle do browser.
  // eslint-disable-next-line no-restricted-syntax
  const rawUrl = process.env[`ANDROID_APK_URL_${suffix}`]?.trim();
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    // Uma configuração inválida não deve produzir um link quebrado.
    return null;
  }
}

export function getAndroidAppCatalog() {
  return [...stations]
    .filter((station) => station.active)
    .sort((a, b) => {
      const order = (slug: string) => (slug === 'acores' ? -1 : 0);
      return order(a.slug) - order(b.slug) || a.name.localeCompare(b.name, 'pt');
    })
    .map((station) => ({
      slug: station.slug,
      name: station.name,
      apps: (Object.keys(APP_LABELS) as AndroidApp[]).map((app) => {
        const published = PUBLISHED_APKS[station.slug]?.[app] ?? null;
        const override = readPublishedOverride(app, station.slug);
        return {
          key: app,
          name: APP_LABELS[app],
          version: published?.version ?? null,
          sizeBytes: published?.sizeBytes ?? null,
          sha256: published?.sha256 ?? null,
          downloadUrl: published
            ? override ?? `/downloads/android/${station.slug}/${published.file}`
            : null,
        };
      }),
    }));
}

export function formatBytes(bytes: number | null) {
  if (!bytes) return null;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
