// Never print response bodies, child output, credentials, or startup logs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const ownerId = 'tea-d9d2sanaqgkc73cpbbe0';
const name = 'orey-acores-openwa';
const imagePath = 'docker.io/rmyndharis/openwa:0.25.0@sha256:bb883bd67101b9c985649ebd4e7677dc7ecd9db034c2d164a8f3d522fdd4311d';
const digestPath = imagePath.replace(':0.25.0@', '@');
const emit = (value) => console.log(JSON.stringify(value));
const fail = (code) => { throw new Error(code); };
let token;
async function api(endpoint, method = 'GET', body) {
  const response = await fetch(`https://api.render.com/v1${endpoint}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) fail(`RENDER_HTTP_${response.status}`);
  return response.status === 204 ? null : response.json();
}
async function findService() {
  const matches = [];
  let cursor = '';
  for (let page = 0; page < 100; page++) {
    const rows = await api(`/services?ownerId=${ownerId}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!Array.isArray(rows)) fail('INVALID_SERVICE_LIST');
    for (const row of rows) {
      const service = row.service;
      if (service?.name === name) matches.push(service);
    }
    if (rows.length < 100) break;
    const next = rows.at(-1)?.cursor;
    if (!next || next === cursor || page === 99) fail('INCOMPLETE_SERVICE_LIST');
    cursor = next;
  }
  if (matches.length > 1) fail('DUPLICATE_SERVICE_NAME');
  return matches[0] || null;
}
function validate(service) {
  if (!service || service.ownerId !== ownerId || service.type !== 'web_service' ||
      service.serviceDetails?.plan !== 'free' || service.serviceDetails?.region !== 'frankfurt' ||
      service.serviceDetails?.runtime !== 'image' || ![imagePath, digestPath, imagePath.split('@')[0]].includes(service.imagePath) ||
      service.serviceDetails?.healthCheckPath !== '/api/health/ready' || service.serviceDetails?.disk) {
    fail('EXISTING_SERVICE_CONFIG_MISMATCH_NO_CHANGES_MADE');
  }
}
function origin(service) {
  const url = new URL(service.serviceDetails.url);
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.onrender\.com$/.test(url.hostname) || url.username || url.password || url.port) fail('INVALID_SERVICE_ORIGIN');
  return url.origin;
}
async function environment(service) {
  const values = {};
  let cursor = '';
  for (let page = 0; page < 100; page++) {
    const rows = await api(`/services/${service.id}/env-vars?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!Array.isArray(rows)) fail('INVALID_ENV_RESPONSE');
    for (const row of rows) if (row.envVar) values[row.envVar.key] = row.envVar.value;
    if (rows.length < 100) return values;
    const next = rows.at(-1)?.cursor;
    if (!next || next === cursor) fail('INCOMPLETE_ENV_RESPONSE');
    cursor = next;
  }
  fail('INCOMPLETE_ENV_RESPONSE');
}
async function status(service) {
  validate(service);
  const rows = await api(`/services/${service.id}/deploys?limit=1`);
  const deploy = rows[0]?.deploy;
  const digest = imagePath.split('@')[1];
  // Render resolves multi-platform indexes to their linux/amd64 child manifest.
  const auth = await fetch('https://auth.docker.io/token?service=registry.docker.io&scope=repository:rmyndharis/openwa:pull', { signal: AbortSignal.timeout(15000) });
  if (!auth.ok) fail('REGISTRY_AUTH_FAILED');
  const registryToken = (await auth.json()).token;
  const manifest = await fetch(`https://registry-1.docker.io/v2/rmyndharis/openwa/manifests/${digest}`, {
    signal: AbortSignal.timeout(15000), redirect: 'error', headers: { Authorization: `Bearer ${registryToken}`,
      Accept: 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' },
  });
  if (!manifest.ok) fail('PINNED_MANIFEST_UNAVAILABLE');
  const manifestBytes = Buffer.from(await manifest.arrayBuffer());
  if (`sha256:${crypto.createHash('sha256').update(manifestBytes).digest('hex')}` !== digest) fail('REGISTRY_DIGEST_MISMATCH');
  const index = JSON.parse(manifestBytes.toString('utf8'));
  const amd64Digest = index.manifests?.find((m) => m.platform?.os === 'linux' && m.platform?.architecture === 'amd64')?.digest;
  const imageDigestMatches = [digest, amd64Digest].filter(Boolean).some((d) => [d, d.replace('sha256:', '')].includes(deploy?.image?.sha));
  const allowed = new Set(['created', 'queued', 'build_in_progress', 'pre_deploy_in_progress', 'update_in_progress', 'live', 'deactivated', 'build_failed', 'pre_deploy_failed', 'update_failed', 'canceled']);
  const state = allowed.has(deploy?.status) ? deploy.status : 'unknown';
  const env = await environment(service);
  let healthHttp = null;
  let sessionsHttp = null;
  try {
    const response = await fetch(`${origin(service)}/api/health/ready`, { redirect: 'error', signal: AbortSignal.timeout(90000) });
    healthHttp = response.status;
    await response.body?.cancel();
    if (healthHttp === 200 && env.API_MASTER_KEY) {
      const sessions = await fetch(`${origin(service)}/api/sessions`, {
        redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'x-api-key': env.API_MASTER_KEY },
      });
      sessionsHttp = sessions.status;
      await sessions.body?.cancel();
    }
  } catch { /* Report timeout as null, never print network error details. */ }
  const result = { id: service.id, url: origin(service), plan: service.serviceDetails.plan,
    region: service.serviceDetails.region, state, healthHttp, sessionsHttp, imageDigestMatches,
    digestPinned: [imagePath, digestPath].includes(service.imagePath),
    resolvedImageSha: /^(sha256:)?[a-f0-9]{64}$/.test(deploy?.image?.sha || '') ? deploy.image.sha : null,
    imageRefMatchesTag: deploy?.image?.ref === imagePath.split('@')[0],
    masterKeyConfigured: Boolean(env.API_MASTER_KEY), pepperConfigured: Boolean(env.API_KEY_PEPPER) };
  emit(result);
  return result;
}
async function vercelVariable(key, value, sensitive) {
  // Only fixed variable names enter argv. Values travel through stdin, never a shell command.
  const args = ['env', 'add', key, 'production', '--force', '--yes', ...(sensitive ? ['--sensitive'] : [])];
  await new Promise((resolve, reject) => {
    const child = process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/s', '/c', `vercel ${args.join(' ')}`], { cwd: root, stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true })
      : spawn('vercel', args, { cwd: root, stdio: ['pipe', 'ignore', 'ignore'] });
    const timer = setTimeout(() => { child.kill(); reject(new Error('VERCEL_ENV_TIMEOUT')); }, 60000);
    child.on('error', () => { clearTimeout(timer); reject(new Error('VERCEL_ENV_SPAWN_FAILED')); });
    child.stdin.on('error', () => {});
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('VERCEL_ENV_FAILED')); });
    child.stdin.end(value);
  });
  emit({ variable: key, environment: 'production', configured: true });
}
async function connection(service) {
  const env = await environment(service);
  if (!env.API_MASTER_KEY) fail('MISSING_MASTER_KEY');
  const base = origin(service);
  if (base !== 'https://orey-acores-openwa.onrender.com') fail('UNEXPECTED_CONNECTION_ORIGIN');
  const result = { checkedAt: new Date().toISOString(), healthHttp: null, sessionsHttp: null,
    status: 'unavailable', paired: null, messagesSent: 0, readOnly: true };
  const get = (endpoint) => fetch(`${base}/api${endpoint}`, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(90000),
    headers: { 'X-API-Key': env.API_MASTER_KEY },
  });
  try {
    const health = await get('/health/ready');
    result.healthHttp = health.status;
    await health.body?.cancel();
  } catch { result.healthError = 'NETWORK_OR_TIMEOUT'; }
  try {
    const response = await get('/sessions?name=orey-acores');
    result.sessionsHttp = response.status;
    if (!response.ok) {
      await response.body?.cancel();
      result.sessionError = `HTTP_${response.status}`;
    } else {
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length > 1 || rows.some(s => s?.name !== 'orey-acores')) fail('INVALID_SESSION_RESPONSE');
      const session = rows[0];
      const allowed = new Set(['created', 'initializing', 'qr_ready', 'authenticating', 'ready', 'disconnected', 'action_required', 'failed']);
      if (session && !allowed.has(session.status)) fail('INVALID_SESSION_STATUS');
      result.status = session?.status || 'absent';
      result.paired = result.status === 'ready' ? true : ['absent', 'created', 'qr_ready'].includes(result.status) ? false : null;
      if (result.status === 'ready') result.senderAccountPresent = Boolean(session.phoneNumber);
      if (result.status === 'qr_ready') {
        if (!/^[a-zA-Z0-9_-]{1,200}$/.test(session.id || '')) fail('INVALID_SESSION');
        const qr = await get(`/sessions/${encodeURIComponent(session.id)}/qr`);
        result.qrHttp = qr.status;
        result.qrAvailable = false;
        if (qr.ok) {
          const data = await qr.json();
          const value = data?.qrCode;
          result.qrAvailable = typeof value === 'string' && value.length <= 700000 &&
            /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) &&
            Buffer.from(value.slice(22), 'base64').subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        } else await qr.body?.cancel();
      }
    }
  } catch (error) {
    result.sessionError = ['INVALID_SESSION_RESPONSE', 'INVALID_SESSION_STATUS', 'INVALID_SESSION'].includes(error?.message)
      ? error.message : 'NETWORK_TIMEOUT_OR_INVALID_RESPONSE';
  }
  emit(result);
}
async function main() {
  const action = process.argv[2] || 'inspect';
  if (!['inspect', 'create', 'status', 'connection', 'wait', 'configure-vercel', 'verify-pairing'].includes(action)) fail('INVALID_ACTION');
  const matches = fs.readFileSync(path.join(root, '.env.local'), 'utf8').match(/\brnd_[A-Za-z0-9_-]+\b/g) || [];
  if (matches.length !== 1) fail('EXPECTED_EXACTLY_ONE_RENDER_CREDENTIAL');
  token = matches[0];
  let service = await findService();
  if (action === 'inspect') {
    if (!service) return emit({ exists: false, ownerId, name });
    return emit({ exists: true, id: service.id, name: service.name, ownerId: service.ownerId,
      plan: service.serviceDetails?.plan, region: service.serviceDetails?.region,
      runtime: service.serviceDetails?.runtime, imageMatches: service.imagePath === imagePath,
      digestPinned: [imagePath, digestPath].includes(service.imagePath),
      healthCheckMatches: service.serviceDetails?.healthCheckPath === '/api/health/ready',
      diskPresent: Boolean(service.serviceDetails?.disk), url: service.serviceDetails?.url });
  }
  if (!service && action === 'create') {
    const blueprint = fs.readFileSync(path.join(root, 'deploy/openwa/render.yaml'), 'utf8');
    if (!blueprint.includes(imagePath) || !/plan: free/.test(blueprint)) fail('BLUEPRINT_MISMATCH');
    const envVars = [...blueprint.matchAll(/- key: ([A-Z0-9_]+)\r?\n\s+value: (.+)/g)].map((m) => ({ key: m[1], value: m[2].trim().replace(/^"(.*)"$/, '$1') }));
    if (envVars.length !== 21) fail('UNEXPECTED_BLUEPRINT_VARIABLE_COUNT');
    envVars.push({ key: 'API_MASTER_KEY', value: crypto.randomBytes(48).toString('hex') },
      { key: 'API_KEY_PEPPER', value: crypto.randomBytes(48).toString('hex') });
    const result = await api('/services', 'POST', { type: 'web_service', name, ownerId, autoDeployTrigger: 'off',
      image: { ownerId, imagePath }, serviceDetails: { runtime: 'image', plan: 'free', region: 'frankfurt',
        healthCheckPath: '/api/health/ready', numInstances: 1 }, envVars });
    service = result.service || result;
    emit({ created: true, id: service.id });
    service = await api(`/services/${service.id}`);
    validate(service);
    // Render strips the digest from tag@digest input; persist its digest-only equivalent.
    await api(`/services/${service.id}`, 'PATCH', { image: { ownerId, imagePath: digestPath } });
    service = await api(`/services/${service.id}`);
    if (service.imagePath !== digestPath) fail('DIGEST_PIN_NOT_PERSISTED');
  }
  if (!service) fail('SERVICE_NOT_FOUND');
  validate(service);
  if (action === 'connection') return connection(service);
  if (action === 'verify-pairing') {
    const env = await environment(service);
    if (!env.API_MASTER_KEY) fail('MISSING_MASTER_KEY');
    const call = async (endpoint, method = 'GET', body) => {
      const response = await fetch(`${origin(service)}/api${endpoint}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(90000),
        headers: { 'X-API-Key': env.API_MASTER_KEY, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) fail(`OPENWA_HTTP_${response.status}`);
      return response.json();
    };
    const sessionName = 'orey-acores';
    const matches = await call(`/sessions?name=${sessionName}`);
    if (!Array.isArray(matches) || matches.length > 1) fail('AMBIGUOUS_SESSION');
    let session = matches[0] || await call('/sessions', 'POST', { name: sessionName });
    if (!session?.id || !/^[a-zA-Z0-9_-]+$/.test(session.id)) fail('INVALID_SESSION');
    const endpoint = `/sessions/${session.id}`;
    if (session.status === 'created') session = await call(`${endpoint}/start`, 'POST');
    for (let attempt = 0; attempt < 12; attempt++) {
      session = await call(endpoint);
      if (session.status === 'ready') return emit({ pairingCheck: true, status: 'ready', messagesSent: 0 });
      if (session.status === 'qr_ready') {
        const qr = await call(`${endpoint}/qr`);
        if (!/^data:image\/png;base64,/.test(qr.qrCode || '')) fail('INVALID_QR');
        return emit({ pairingCheck: true, status: 'qr_ready', qrAvailable: true, messagesSent: 0 });
      }
      if (session.status === 'failed' || session.status === 'action_required') fail('SESSION_START_FAILED');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    fail('PAIRING_NOT_READY');
  }
  if (action === 'configure-vercel') {
    const checked = await status(service);
    if (checked.state !== 'live' || checked.healthHttp !== 200 || checked.sessionsHttp !== 200 || !checked.imageDigestMatches || !checked.digestPinned) fail('SERVICE_NOT_VERIFIED');
    const env = await environment(service);
    if (!/^[A-Za-z0-9_-]{32,}$/.test(env.API_MASTER_KEY || '')) fail('MISSING_OR_INVALID_MASTER_KEY');
    await vercelVariable('OPENWA_API_KEY', env.API_MASTER_KEY, true);
    await vercelVariable('OPENWA_BASE_URL', origin(service), false);
    await vercelVariable('OPENWA_SESSION_NAME', 'orey-acores', false);
    await vercelVariable('WHATSAPP_PROVIDER', 'openwa', false);
    return emit({ vercelProductionConfigured: true, deployed: false, renderCredentialTransferred: false });
  }
  const deadline = Date.now() + 9 * 60 * 1000;
  do {
    const checked = await status(service);
    if (checked.state === 'live' && checked.healthHttp === 200 && checked.sessionsHttp === 200 && checked.imageDigestMatches && checked.digestPinned) return;
    if (action !== 'wait') return;
    if (['build_failed', 'pre_deploy_failed', 'update_failed', 'canceled', 'deactivated'].includes(checked.state)) fail('DEPLOY_FAILED');
    if (Date.now() + 45000 >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 20000));
    service = await api(`/services/${service.id}`);
  } while (Date.now() < deadline);
  fail('VERIFICATION_TIMEOUT');
}
main().catch((error) => {
  const safe = /^(RENDER_HTTP_\d{3}|[A-Z][A-Z0-9_]+)$/.test(error?.message || '') ? error.message : 'OPERATION_FAILED_DETAILS_SUPPRESSED';
  emit({ error: safe });
  process.exitCode = 1;
});
