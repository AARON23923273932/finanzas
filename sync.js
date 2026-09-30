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

// Al guardar: marca con `now` lo que cambió respecto del último estado guardado, y lo borrado
function stampChanges(prev, cur, now = Date.now()) {
  cur.deleted = { ...(cur.deleted || {}) };
  cur.meta = { ...(cur.meta || {}) };
  for (const col of SYNC_COLS) {
    const before = new Map((prev[col] || []).map(r => [r.id, JSON.stringify(stripU(r))]));
    const ids = new Set();
    for (const r of cur[col] || []) {
      ids.add(r.id);
      if (before.get(r.id) !== JSON.stringify(stripU(r))) r.u = now;
    }
    for (const id of before.keys()) if (!ids.has(id)) cur.deleted[`${col}:${id}`] = now;
  }
  if (JSON.stringify(prev.settings || {}) !== JSON.stringify(cur.settings || {})) cur.meta.settingsU = now;
  if (JSON.stringify(prev.rules || {}) !== JSON.stringify(cur.rules || {})) cur.meta.rulesU = now;
  return cur;
}

// Junta dos estados. Por registro gana el `u` más alto (empate: `remote`, así todos convergen igual).
// Un registro borrado queda borrado salvo que se haya cambiado DESPUÉS del borrado.
function mergeStates(local, remote) {
  const out = { ...remote, ...local };
  const dead = { ...(remote.deleted || {}) };
  for (const [k, at] of Object.entries(local.deleted || {})) dead[k] = Math.max(dead[k] || 0, at);
  for (const col of SYNC_COLS) {
    const byId = new Map(), order = [];
    for (const r of local[col] || []) { byId.set(r.id, r); order.push(r.id); }
    for (const r of remote[col] || []) {
      const l = byId.get(r.id);
      if (!l) { byId.set(r.id, r); order.push(r.id); } else if ((r.u || 0) >= (l.u || 0)) byId.set(r.id, r);
    }
    out[col] = order.filter(id => !(dead[`${col}:${id}`] >= (byId.get(id).u || 0))).map(id => byId.get(id));
  }
  out.deleted = dead;
  const lm = local.meta || {}, rm = remote.meta || {};
  out.settings = (lm.settingsU || 0) > (rm.settingsU || 0) ? local.settings : remote.settings;
  out.rules = (lm.rulesU || 0) > (rm.rulesU || 0) ? local.rules : remote.rules;
  out.meta = { ...rm, ...lm, settingsU: Math.max(lm.settingsU || 0, rm.settingsU || 0), rulesU: Math.max(lm.rulesU || 0, rm.rulesU || 0) };
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
// getLocal() se llama al principio; devuelve el estado unido y si hubo que subir algo.
async function syncRound(cfg, getLocal, normalize = x => x) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const remote = await ghGet(cfg);
    const local = getLocal();
    const remoteState = remote ? normalize(await openState(remote.file, cfg.pass)) : null;
    const merged = remoteState ? mergeStates(local, remoteState) : local;
    const changed = !remoteState || JSON.stringify(merged) !== JSON.stringify(remoteState);
    if (changed) {
      try { await ghPut(cfg, await sealState(merged, cfg.pass, remote && remote.file.salt), remote && remote.sha); }
      catch (e) { if (e.conflict && attempt < 3) continue; throw e; }
    }
    return { merged, uploaded: changed };
  }
  throw new Error('No se pudo sincronizar: otro dispositivo estaba guardando al mismo tiempo. Reintenta.');
}

if (typeof module !== 'undefined') module.exports = { stampChanges, mergeStates, sealState, openState, ghGet, ghPut, ghCheckRepo, syncRound, toB64, fromB64 };

/* ---------- Interfaz y disparadores (usan app.js cuando se llaman) ---------- */
const syncState = { busy: false, again: false, status: 'off', msg: '', pending: null };
const readSyncCfg = () => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)); } catch (e) { return null; } };
const writeSyncCfg = cfg => { try { if (cfg) localStorage.setItem(SYNC_KEY, JSON.stringify(cfg)); else localStorage.removeItem(SYNC_KEY); } catch (e) { /* sin espacio */ } };

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
  const [ico, t] = s === 'busy' ? ['⏳', 'Sincronizando…'] : s === 'ok' ? ['☁️', 'Sincronizado'] : s === 'offline' ? ['📴', 'Sin conexión: se sincroniza luego'] : s === 'error' ? ['⚠️', syncState.msg || 'Error al sincronizar'] : ['☁️', ''];
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
    </div>`;
  }
  return `<div class="card">
    <p class="small muted" style="margin-top:0">Guarda tus datos cifrados en un repositorio privado de GitHub para verlos en el iPhone y el iPad. Usa el mismo código y la misma contraseña en los dos.</p>
    <label class="field"><span>Usuario de GitHub</span><input id="sy-owner" autocapitalize="off" autocorrect="off" value="AARON23923273932"></label>
    <label class="field"><span>Repositorio privado</span><input id="sy-repo" autocapitalize="off" autocorrect="off" value="finanzas-datos"></label>
    <label class="field"><span>Código de acceso de GitHub (token)</span><input id="sy-token" type="password" autocapitalize="off" autocorrect="off" autocomplete="off" placeholder="github_pat_…"></label>
    <label class="field"><span>Contraseña para cifrar (mínimo 8 caracteres)</span><input id="sy-pass" type="password" autocomplete="new-password"></label>
    <label class="field"><span>Repite la contraseña</span><input id="sy-pass2" type="password" autocomplete="new-password"></label>
    <p class="small muted">Si olvidas la contraseña, los datos de la nube no se pueden abrir (los de cada dispositivo siguen ahí).</p>
    <button class="btn primary block" data-act="sync-connect">Conectar</button>
  </div>`;
}

// Clona lo local tal como está (con sus marcas `u`), para que la unión no mezcle objetos vivos
const snapshotLocal = () => JSON.parse(JSON.stringify(S));

// Aplica un estado traído de la nube. Con una hoja abierta se espera a que se cierre
// (sus formularios apuntan a los objetos actuales y se perdería lo que el usuario edita).
function applySynced(state) {
  if (!$('#sheet').hidden) { syncState.pending = state; return; }
  const now = JSON.stringify(S);
  const next = now === syncState.baseJson ? state : mergeStates(snapshotLocal(), state); // lo guardado durante la vuelta, encima
  persistState(next);
  if (JSON.stringify(next) !== JSON.stringify(state)) syncState.again = true;
}

async function syncNow() {
  const cfg = readSyncCfg();
  if (!cfg) return;
  if (syncState.busy || !$('#sheet').hidden) { syncState.again = true; return; }
  syncState.busy = true; setSyncStatus('busy');
  try {
    syncState.baseJson = JSON.stringify(S);
    const { merged } = await syncRound(cfg, snapshotLocal, s => normalizeState(s));
    applySynced(normalizeState(merged));
    writeSyncCfg({ ...cfg, lastSync: Date.now() });
    setSyncStatus('ok');
  } catch (e) {
    const offline = (typeof navigator !== 'undefined' && navigator.onLine === false) || e.name === 'TypeError';
    setSyncStatus(offline ? 'offline' : 'error', e.message);
  } finally {
    syncState.busy = false;
    if (syncState.again) { syncState.again = false; setTimeout(syncNow, 800); }
  }
}

let syncTimer = null;
function scheduleSync() {
  if (!readSyncCfg()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 1500);
}

// Al cerrar una hoja, aplicar lo que llegó de la nube mientras estaba abierta
function flushPendingSync() {
  if (syncState.pending) {
    const st = syncState.pending; syncState.pending = null;
    persistState(mergeStates(snapshotLocal(), st));
    scheduleSync();
  } else if (syncState.again && !syncState.busy) {
    // Se pidió sincronizar mientras la hoja estaba abierta: ahora sí
    syncState.again = false; scheduleSync();
  }
}

async function syncConnect() {
  const val = id => ($(`#${id}`)?.value || '').trim();
  const cfg = { owner: val('sy-owner'), repo: val('sy-repo'), path: 'datos.enc', token: val('sy-token'), pass: $('#sy-pass').value };
  if (!cfg.owner || !cfg.repo || !cfg.token) return toast('Falta usuario, repositorio o código');
  if (cfg.pass.length < 8) return toast('La contraseña debe tener al menos 8 caracteres');
  if (cfg.pass !== $('#sy-pass2').value) return toast('Las contraseñas no coinciden');
  setSyncStatus('busy');
  try {
    await ghCheckRepo(cfg);
    const remote = await ghGet(cfg);
    if (remote) {
      const remoteState = normalizeState(await openState(remote.file, cfg.pass));
      const n = remoteState.tx.length, here = S.tx.length;
      // Un dispositivo nuevo normalmente quiere lo de la nube tal cual; si también tiene datos, se juntan
      if (confirm(`En la nube ya hay datos (${remoteState.accounts.length} cuentas, ${n} movimientos).\n\nAceptar: usar los de la nube en este dispositivo (se reemplazan los ${here} movimientos de aquí).\nCancelar: juntar los de la nube con los de aquí.`)) {
        persistState(remoteState);
      }
    }
    writeSyncCfg(cfg);
    toast('Conectado. Sincronizando…');
    render();
    await syncNow();
  } catch (e) {
    setSyncStatus('off');
    toast(e.message || 'No se pudo conectar');
  }
}

function syncDisconnect() {
  if (!confirm('¿Desconectar este dispositivo? Tus datos se quedan aquí y en la nube; solo deja de sincronizar.')) return;
  writeSyncCfg(null); setSyncStatus('off'); render();
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(); });
  window.addEventListener('online', scheduleSync);
}
