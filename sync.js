'use strict';

/* ============ Sincronización entre dispositivos ============
   Los datos viajan a un repositorio PRIVADO de GitHub, cifrados en el dispositivo con una
   contraseña que nunca sale de él (PBKDF2 + AES-GCM). GitHub solo guarda texto ilegible.

   Cómo se juntan dos dispositivos: cada registro (cuenta, categoría, deuda, movimiento) lleva
   `u`, la hora de su último cambio, y lo borrado deja una marca en `deleted`. Al sincronizar
   gana, registro por registro, el cambio más reciente; nada de un dispositivo pisa en bloque
   lo del otro.

   Se carga antes que app.js. Las funciones de datos no tocan el DOM (se prueban con node). */

const SYNC_KEY = 'finanzas.sync';
const SYNC_COLS = ['accounts', 'categories', 'debts', 'tx'];
const SYNC_ITER = 310000;

/* ---------- Marcas de cambio y unión ---------- */
const stripU = r => { const { u, ...rest } = r || {}; return rest; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Referencias que un movimiento vivo necesita: esas cuentas y deudas no se pueden perder al unir
const REFS = [['accounts', t => [t.accountId, t.toAccountId]], ['debts', t => [t.debtId]]];

// Al guardar: marca lo que cambió respecto de lo último guardado. Reloj híbrido: un cambio siempre
// queda después de la versión que se vio (aunque los relojes del iPhone y el iPad no coincidan).
function stampChanges(prev, cur, now = Date.now()) {
  cur.deleted = { ...(cur.deleted || {}) };
  cur.meta = { ...(cur.meta || {}) };
  const tick = old => Math.max(now, (old || 0) + 1);
  for (const col of SYNC_COLS) {
    const before = new Map((prev[col] || []).map(r => [r.id, r]));
    const ids = new Set();
    for (const r of cur[col] || []) {
      ids.add(r.id);
      const p = before.get(r.id);
      if (!p || !same(stripU(p), stripU(r))) r.u = tick(Math.max(p ? p.u || 0 : 0, cur.deleted[`${col}:${r.id}`] || 0));
    }
    for (const [id, p] of before) if (!ids.has(id)) cur.deleted[`${col}:${id}`] = tick(p.u);
  }
  // Ajustes y reglas aprendidas: cada clave por separado
  const ps = prev.settings || {}, cs = cur.settings || {};
  for (const k of new Set([...Object.keys(ps), ...Object.keys(cs)])) if (!same(ps[k], cs[k])) cur.meta[`s:${k}`] = tick(cur.meta[`s:${k}`]);
  const pr = prev.rules || {}, cr = cur.rules || {};
  for (const k of Object.keys(cr)) if (pr[k] !== cr[k]) cur.meta[`r:${k}`] = tick(Math.max(cur.meta[`r:${k}`] || 0, cur.deleted[`rules:${k}`] || 0));
  for (const k of Object.keys(pr)) if (!(k in cr)) cur.deleted[`rules:${k}`] = tick(cur.meta[`r:${k}`]);
  return cur;
}

// Datos de antes de sincronizar (sin marcas): lo que difiere de fábrica pasa a valer 1 y lo de fábrica
// que ya no está queda borrado en 1. Así le gana a una instalación sin tocar, y pierde contra cualquier cambio real.
function baselineStamp(local, def) {
  local.deleted = { ...(local.deleted || {}) };
  local.meta = { ...(local.meta || {}) };
  for (const col of SYNC_COLS) {
    const d = new Map((def[col] || []).map(r => [r.id, r]));
    const ids = new Set((local[col] || []).map(r => r.id));
    for (const r of local[col] || []) if (!r.u && !(d.has(r.id) && same(stripU(d.get(r.id)), stripU(r)))) r.u = 1;
    for (const id of d.keys()) if (!ids.has(id)) local.deleted[`${col}:${id}`] = Math.max(local.deleted[`${col}:${id}`] || 0, 1);
  }
  const ds = def.settings || {};
  for (const [k, v] of Object.entries(local.settings || {})) if (!same(ds[k], v) && !local.meta[`s:${k}`]) local.meta[`s:${k}`] = 1;
  for (const k of Object.keys(local.rules || {})) if (!local.meta[`r:${k}`]) local.meta[`r:${k}`] = 1;
  return local;
}

// Sin datos propios: igual que de fábrica y sin movimientos
function isPristine(st, def) {
  const bare = x => ({ a: (x.accounts || []).map(stripU), c: (x.categories || []).map(stripU), d: (x.debts || []).map(stripU), t: (x.tx || []).length, r: x.rules || {} });
  return same(bare(st), bare(def));
}

// Junta dos estados. Por registro gana el cambio más reciente (empate: la nube, así todos convergen igual).
// Orden: el de la nube, y al final lo que solo existe aquí. Lo borrado queda borrado salvo que se haya
// cambiado después, o que un movimiento vivo todavía lo use (cuentas y deudas).
function mergeStates(local, remote) {
  const out = { ...remote, ...local };
  const dead = { ...(remote.deleted || {}) };
  for (const [k, at] of Object.entries(local.deleted || {})) dead[k] = Math.max(dead[k] || 0, at);
  const lm = local.meta || {}, rm = remote.meta || {};
  const meta = { ...rm };
  for (const [k, v] of Object.entries(lm)) meta[k] = Math.max(meta[k] || 0, v);
  const all = {};
  for (const col of SYNC_COLS) {
    const byId = new Map(), order = [];
    for (const r of remote[col] || []) { byId.set(r.id, r); order.push(r.id); }
    for (const r of local[col] || []) {
      const x = byId.get(r.id);
      if (!x) { byId.set(r.id, r); order.push(r.id); } else if ((r.u || 0) > (x.u || 0)) byId.set(r.id, r);
    }
    all[col] = { byId, order };
  }
  const isDead = (col, id) => dead[`${col}:${id}`] >= (all[col].byId.get(id).u || 0);
  for (const id of all.tx.order) {
    if (isDead('tx', id)) continue;
    const t = all.tx.byId.get(id);
    for (const [col, refs] of REFS) for (const ref of refs(t)) {
      if (ref && all[col].byId.has(ref) && isDead(col, ref)) {
        const k = `${col}:${ref}`;
        all[col].byId.set(ref, { ...all[col].byId.get(ref), u: dead[k] + 1 }); // vuelve, marcado después del borrado
        delete dead[k];
      }
    }
  }
  for (const col of SYNC_COLS) out[col] = all[col].order.filter(id => !isDead(col, id)).map(id => all[col].byId.get(id));
  const ls = local.settings || {}, rs = remote.settings || {};
  out.settings = {};
  for (const k of new Set([...Object.keys(rs), ...Object.keys(ls)])) {
    out.settings[k] = (lm[`s:${k}`] || 0) > (rm[`s:${k}`] || 0) ? (k in ls ? ls[k] : rs[k]) : (k in rs ? rs[k] : ls[k]);
  }
  const lr = local.rules || {}, rr = remote.rules || {};
  out.rules = {};
  for (const k of new Set([...Object.keys(rr), ...Object.keys(lr)])) {
    const lu = lm[`r:${k}`] || 0, ru = rm[`r:${k}`] || 0;
    const v = lu > ru ? (k in lr ? lr[k] : rr[k]) : (k in rr ? rr[k] : lr[k]);
    if (!(dead[`rules:${k}`] >= Math.max(lu, ru))) out.rules[k] = v;
  }
  out.deleted = dead;
  out.meta = meta;
  return out;
}

/* ---------- Cifrado ---------- */
const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = s => Uint8Array.from(atob(String(s).replace(/\s/g, '')), c => c.charCodeAt(0));
const pipeBytes = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
const keyCache = new Map();

async function deriveKey(pass, salt) {
  const id = `${pass}|${toB64(salt)}`;
  if (!keyCache.has(id)) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    keyCache.set(id, await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: SYNC_ITER, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
  }
  return keyCache.get(id);
}

// Estado → sobre cifrado. Se reutiliza la sal del archivo existente para no cambiar la clave
async function sealState(state, pass, saltB64) {
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pass, salt);
  let bytes = new TextEncoder().encode(JSON.stringify(state));
  const z = typeof CompressionStream === 'function';
  if (z) bytes = await pipeBytes(bytes, new CompressionStream('gzip'));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  return { app: 'finanzas', v: 1, kdf: 'PBKDF2-SHA256', iter: SYNC_ITER, salt: toB64(salt), iv: toB64(iv), z, ct: toB64(ct) };
}

async function openState(file, pass) {
  if (!file || file.app !== 'finanzas' || file.v !== 1) throw new Error('El archivo de la nube no es de esta app');
  const key = await deriveKey(pass, fromB64(file.salt));
  let bytes;
  try { bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(file.iv) }, key, fromB64(file.ct))); }
  catch (e) { const err = new Error('La contraseña no coincide con la de la nube'); err.badPass = true; throw err; }
  if (file.z) {
    if (typeof DecompressionStream !== 'function') throw new Error('Este dispositivo no puede leer los datos comprimidos: actualiza iOS');
    bytes = await pipeBytes(bytes, new DecompressionStream('gzip'));
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/* ---------- GitHub ---------- */
const ghHeaders = cfg => ({ Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
const ghUrl = cfg => `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;

async function ghError(res, what) {
  let detail = '';
  try { detail = (await res.json()).message || ''; } catch (e) { /* sin cuerpo */ }
  const err = new Error(res.status === 401 ? 'El código de acceso no es válido o venció'
    : res.status === 403 ? 'El código de acceso no tiene permiso de escribir en el repositorio'
    : res.status === 404 ? 'No encuentro el repositorio (revisa usuario, nombre y que el código tenga acceso a él)'
    : `GitHub respondió ${res.status} al ${what}${detail ? `: ${detail}` : ''}`);
  err.status = res.status;
  return err;
}

async function ghCheckRepo(cfg) {
  const res = await fetch(ghUrl(cfg), { headers: ghHeaders(cfg), cache: 'no-store' });
  if (!res.ok) throw await ghError(res, 'revisar el repositorio');
  const repo = await res.json();
  if (!repo.private) throw new Error('El repositorio es público: tus datos deben ir a uno privado');
  return repo;
}

// Devuelve { sha, file } o null si todavía no hay datos en la nube
async function ghGet(cfg) {
  const res = await fetch(`${ghUrl(cfg)}/contents/${encodeURIComponent(cfg.path)}`, { headers: ghHeaders(cfg), cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw await ghError(res, 'leer los datos');
  const j = await res.json();
  return { sha: j.sha, file: JSON.parse(atob(String(j.content || '').replace(/\s/g, ''))) };
}

// Escribe solo si nadie más escribió desde `sha`; si alguien lo hizo, lanza { conflict: true }
async function ghPut(cfg, file, sha) {
  const body = { message: 'Sincronizar finanzas', content: btoa(JSON.stringify(file)) };
  if (sha) body.sha = sha;
  const res = await fetch(`${ghUrl(cfg)}/contents/${encodeURIComponent(cfg.path)}`, {
    method: 'PUT', headers: { ...ghHeaders(cfg), 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store',
  });
  if (res.status === 409 || res.status === 422) { const e = new Error('conflicto'); e.conflict = true; throw e; }
  if (!res.ok) throw await ghError(res, 'guardar los datos');
  return (await res.json()).content.sha;
}

// Una vuelta completa: leer la nube, juntar con lo local, subir si hace falta.
// opts.normalize valida lo que llega; opts.canUpload(local) decide si un estado sin datos se sube;
// opts.valid() se consulta antes de escribir (si el usuario desconectó a mitad, no se escribe nada).
async function syncRound(cfg, getLocal, opts = {}) {
  const normalize = opts.normalize || (x => x), canUpload = opts.canUpload || (() => true), valid = opts.valid || (() => true);
  for (let attempt = 0; attempt < 4; attempt++) {
    const remote = await ghGet(cfg);
    const local = getLocal();
    const remoteState = remote ? normalize(await openState(remote.file, cfg.pass)) : null;
    const merged = remoteState ? mergeStates(local, remoteState) : local;
    let uploaded = false;
    if (remoteState ? !same(merged, remoteState) : canUpload(local)) {
      if (!valid()) { const e = new Error('cancelado'); e.cancelled = true; throw e; }
      try { await ghPut(cfg, await sealState(merged, cfg.pass, remote && remote.file.salt), remote && remote.sha); uploaded = true; }
      catch (e) { if (e.conflict && attempt < 3) continue; throw e; }
    }
    return { merged, remoteState, uploaded };
  }
  throw new Error('No se pudo sincronizar: otro dispositivo estaba guardando al mismo tiempo. Reintenta.');
}

if (typeof module !== 'undefined') module.exports = { stampChanges, mergeStates, baselineStamp, isPristine, sealState, openState, ghGet, ghPut, ghCheckRepo, syncRound, toB64, fromB64 };

/* ---------- Interfaz y disparadores (usan app.js cuando se llaman) ---------- */
// gen cambia al conectar, desconectar o cambiar el código: una vuelta de otra «generación» se descarta
const syncState = { busy: false, again: false, status: 'off', msg: '', pending: null, gen: 0, connecting: false };
const readSyncCfg = () => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)); } catch (e) { return null; } };
const writeSyncCfg = cfg => { try { if (cfg) localStorage.setItem(SYNC_KEY, JSON.stringify(cfg)); else localStorage.removeItem(SYNC_KEY); } catch (e) { /* sin espacio */ } };
const isOfflineError = e => e && e.name === 'TypeError'; // fetch sin red lanza TypeError («Load failed» en iOS)
const friendly = e => (isOfflineError(e) ? 'Sin conexión a internet' : (e && e.message) || 'Error desconocido');

function setSyncStatus(status, msg = '') {
  syncState.status = status; syncState.msg = msg;
  const chip = typeof document !== 'undefined' && document.getElementById('sync-chip');
  if (chip) chip.outerHTML = syncChipHTML();
  const box = typeof document !== 'undefined' && document.getElementById('sync-status');
  if (box) box.outerHTML = syncStatusHTML();
}

function syncChipHTML() {
  if (!readSyncCfg()) return '<span id="sync-chip"></span>';
  const s = syncState.status;
  const [ico, t] = s === 'busy' ? ['⏳', 'Sincronizando…'] : s === 'ok' ? ['☁️', 'Sincronizado'] : s === 'offline' ? ['📴', 'Sin conexión: se sincroniza luego'] : s === 'error' ? ['⚠️', syncState.msg || 'Error al sincronizar'] : ['☁️', 'Sincronización'];
  return `<button id="sync-chip" class="sync-chip ${s}" data-tab-go="ajustes" title="${esc(t)}" aria-label="${esc(t)}">${ico}</button>`;
}

function syncStatusHTML() {
  const cfg = readSyncCfg();
  if (!cfg) return '<p id="sync-status" class="small muted" style="margin:0">Sin conectar.</p>';
  const when = cfg.lastSync ? new Date(cfg.lastSync).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca';
  const s = syncState.status;
  const line = s === 'busy' ? 'Sincronizando…' : s === 'error' ? `⚠️ ${esc(syncState.msg)}` : s === 'offline' ? '📴 Sin conexión. Se sincroniza cuando vuelva.' : `Última sincronización: ${esc(when)}`;
  return `<p id="sync-status" class="small ${s === 'error' ? 'gasto' : 'muted'}" style="margin:0 0 10px">${line}</p>`;
}

function syncSectionHTML() {
  const cfg = readSyncCfg();
  if (cfg) {
    return `<div class="card">
      <p class="small" style="margin-top:0">Conectado a <b>${esc(cfg.owner)}/${esc(cfg.repo)}</b>. Cada cambio se cifra aquí y se sube; al abrir la app se traen los cambios del otro dispositivo.</p>
      ${syncStatusHTML()}
      <div class="actions"><button class="btn" data-act="sync-off">Desconectar</button><button class="btn primary" data-act="sync-now">Sincronizar ahora</button></div>
      <details style="margin-top:12px"><summary class="small" style="color:var(--accent)">Cambiar el código de acceso (si venció)</summary>
        <label class="field" style="margin-top:10px"><span>Código nuevo</span><input id="sy-newtoken" type="password" autocapitalize="off" autocorrect="off" autocomplete="off" placeholder="github_pat_…"></label>
        <button class="btn block" data-act="sync-token">Guardar código nuevo</button></details>
    </div>`;
  }
  const busy = syncState.connecting;
  return `<div class="card">
    <p class="small muted" style="margin-top:0">Guarda tus datos cifrados en un repositorio privado de GitHub para verlos en el iPhone y el iPad. Usa el mismo código y la misma contraseña en los dos.</p>
    <label class="field"><span>Usuario de GitHub</span><input id="sy-owner" autocapitalize="off" autocorrect="off" value="AARON23923273932"></label>
    <label class="field"><span>Repositorio privado</span><input id="sy-repo" autocapitalize="off" autocorrect="off" value="finanzas-datos"></label>
    <label class="field"><span>Código de acceso de GitHub (token)</span><input id="sy-token" type="password" autocapitalize="off" autocorrect="off" autocomplete="off" placeholder="github_pat_…"></label>
    <label class="field"><span>Contraseña para cifrar (mínimo 8 caracteres)</span><input id="sy-pass" type="password" autocomplete="new-password"></label>
    <label class="field"><span>Repite la contraseña</span><input id="sy-pass2" type="password" autocomplete="new-password"></label>
    <p class="small muted">Si en este dispositivo ya tienes datos, se juntan con los de la nube (no se borra nada). Si olvidas la contraseña, lo de la nube no se puede abrir.</p>
    <button class="btn primary block" data-act="sync-connect" ${busy ? 'disabled' : ''}>${busy ? 'Conectando…' : 'Conectar'}</button>
  </div>`;
}

// Clona lo local tal como está (con sus marcas `u`), para que la unión no mezcle objetos vivos
const snapshotLocal = () => JSON.parse(JSON.stringify(S));
// Lo que llega de la nube se valida igual que un respaldo importado
const validateRemote = st => validateBackup(st);

// Aplica un estado unido. Con una hoja abierta se espera a que se cierre (sus formularios apuntan a
// los objetos actuales y se perdería lo que se edita). Si no cambió nada, no se toca la pantalla.
function applySynced(state) {
  if (!$('#sheet').hidden) { syncState.pending = state; return; }
  const next = JSON.stringify(S) === syncState.baseJson ? state : mergeStates(snapshotLocal(), state); // lo guardado durante la vuelta, encima
  if (JSON.stringify(next) !== JSON.stringify(state)) syncState.again = true;
  if (JSON.stringify(next) === JSON.stringify(S)) return;
  persistState(next);
}

async function syncNow() {
  const cfg = readSyncCfg();
  if (!cfg) return;
  if (syncState.busy || !$('#sheet').hidden) { syncState.again = true; return; }
  const gen = syncState.gen;
  const current = () => gen === syncState.gen && !!readSyncCfg();
  syncState.busy = true; setSyncStatus('busy');
  try {
    syncState.baseJson = JSON.stringify(S);
    const { merged } = await syncRound(cfg, snapshotLocal, {
      normalize: validateRemote, valid: current, canUpload: local => !isPristine(local, defaults()),
    });
    if (!current()) return; // desconectado o reconectado a mitad: no se aplica ni se escribe nada
    applySynced(normalizeState(merged));
    const cur = readSyncCfg();
    if (cur) writeSyncCfg({ ...cur, lastSync: Date.now() });
    setSyncStatus('ok');
  } catch (e) {
    if (e.cancelled || !current()) return;
    setSyncStatus(isOfflineError(e) ? 'offline' : 'error', friendly(e));
  } finally {
    syncState.busy = false;
    if (syncState.again && readSyncCfg()) { syncState.again = false; setTimeout(syncNow, 800); }
  }
}

let syncTimer = null;
function scheduleSync(delay = 1500) {
  if (!readSyncCfg()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncTimer = null; syncNow(); }, delay);
}
// Al irse de la app (bloquear, cambiar de app) lo pendiente se sube ya: iOS congela los temporizadores
function flushSyncNow() { if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; syncNow(); } }

// Al cerrar una hoja, aplicar lo que llegó de la nube mientras estaba abierta
function flushPendingSync() {
  if (syncState.pending) {
    const st = syncState.pending; syncState.pending = null;
    persistState(mergeStates(snapshotLocal(), st));
    scheduleSync();
  } else if (syncState.again && !syncState.busy) {
    syncState.again = false; scheduleSync(); // se pidió sincronizar mientras la hoja estaba abierta
  }
}

async function syncConnect() {
  if (syncState.connecting) return;
  const val = id => ($(`#${id}`)?.value || '').trim();
  const cfg = { owner: val('sy-owner'), repo: val('sy-repo'), path: 'datos.enc', token: val('sy-token'), pass: $('#sy-pass').value };
  if (!cfg.owner || !cfg.repo || !cfg.token) return toast('Falta usuario, repositorio o código');
  if (cfg.pass.length < 8) return toast('La contraseña debe tener al menos 8 caracteres');
  if (cfg.pass !== $('#sy-pass2').value) return toast('Las contraseñas no coinciden');
  closeSheet();
  syncState.connecting = true; render();
  const keep = { owner: cfg.owner, repo: cfg.repo };
  try {
    await ghCheckRepo(cfg);
    const remote = await ghGet(cfg);
    const def = defaults();
    if (remote) {
      const remoteState = validateRemote(await openState(remote.file, cfg.pass));
      if (isPristine(S, def)) {
        persistState(remoteState); // dispositivo sin datos propios: toma lo de la nube tal cual
      } else {
        const n = remoteState.tx.length;
        if (!confirm(`En la nube hay ${remoteState.accounts.length} cuentas y ${n} movimientos, y este dispositivo tiene ${S.tx.length} movimientos propios.\n\nSe van a JUNTAR: no se borra nada de ningún lado. ¿Continuar?\n\n(Si lo de aquí eran pruebas, cancela, usa «Borrar todos los datos» y vuelve a conectar.)`)) return;
        const local = baselineStamp(snapshotLocal(), def);
        persistState(mergeStates(local, remoteState));
      }
    } else if (!isPristine(S, def)) {
      persistState(baselineStamp(snapshotLocal(), def)); // primer dispositivo: sus datos de antes ganan a los de fábrica
    }
    syncState.gen++;
    writeSyncCfg(cfg);
    toast('Conectado. Sincronizando…');
    await syncNow();
  } catch (e) {
    setSyncStatus('off');
    toast(e.badPass ? 'La contraseña no coincide con la que usaste en el otro dispositivo' : friendly(e));
  } finally {
    syncState.connecting = false;
    render();
    Object.entries(keep).forEach(([k, v]) => { const el = $(`#sy-${k}`); if (el) el.value = v; });
  }
}

async function syncChangeToken() {
  const cfg = readSyncCfg();
  const token = ($('#sy-newtoken')?.value || '').trim();
  if (!cfg || !token) return toast('Pega el código nuevo');
  try {
    await ghCheckRepo({ ...cfg, token });
    syncState.gen++;
    writeSyncCfg({ ...cfg, token });
    toast('Código actualizado');
    render();
    syncNow();
  } catch (e) { toast(friendly(e)); }
}

function syncDisconnect() {
  if (!confirm('¿Desconectar este dispositivo? Tus datos se quedan aquí y en la nube; solo deja de sincronizar. El código y la contraseña se borran de este dispositivo.')) return;
  syncState.gen++;
  clearTimeout(syncTimer); syncTimer = null;
  writeSyncCfg(null); setSyncStatus('off'); render();
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(); else flushSyncNow();
  });
  window.addEventListener('pagehide', flushSyncNow);
  window.addEventListener('online', () => scheduleSync());
}
