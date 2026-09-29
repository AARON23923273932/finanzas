'use strict';

/* ============ Utilidades ============ */
const KEY = 'finanzas.v1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const PEN = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const money = c => PEN.format((c || 0) / 100);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return isoDate(d); };
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Monto en texto -> céntimos. Acepta 18, 18.5, 18,50, 1,200.00, 1.200,00, 1.200
function toCents(s) {
  s = String(s).replace(/[^\d.,]/g, '').replace(/[.,]+$/, '');
  if (!s) return null;
  if (s.includes('.') && s.includes(',')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    const p = s.split(',');
    s = p.length === 2 && p[1].length <= 2 ? p.join('.') : p.join('');
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '');
  } else {
    const p = s.split('.');
    if (p.length === 2 && p[1].length === 3) s = p.join('');
  }
  const v = parseFloat(s);
  return isFinite(v) && v > 0 ? Math.round(v * 100) : null;
}

/* ============ Datos por defecto ============ */
const TYPES = {
  gasto: { label: 'Gasto', icon: '↓' },
  ingreso: { label: 'Ingreso', icon: '↑' },
  transferencia: { label: 'Transferencia', icon: '⇄' },
  pago_deuda: { label: 'Pago de deuda', icon: '✓' },
};
const ACC_TYPES = {
  efectivo: 'Efectivo', digital: 'Billetera digital', banco: 'Cuenta / débito', credito: 'Tarjeta de crédito', ahorro: 'Ahorro',
};
const ACC_ICON = { efectivo: '💵', digital: '📱', banco: '🏦', credito: '💳', ahorro: '🐷' };

const DEFAULT_ACCOUNTS = [
  { id: 'yape', name: 'Yape', type: 'digital', initial: 0, aliases: 'yape, yapee, yapeaste, yapearon, yapeo, yapie, yapeado' },
  { id: 'efectivo', name: 'Efectivo', type: 'efectivo', initial: 0, aliases: 'efectivo, cash, sencillo, en mano' },
  { id: 'debito', name: 'Tarjeta de débito', type: 'banco', initial: 0, aliases: 'debito, tarjeta de debito, cuenta, banco, bcp, interbank, bbva, scotiabank' },
  { id: 'credito', name: 'CMR', type: 'credito', initial: 0, aliases: 'cmr, credito, tarjeta de credito, tarjeta, visa, mastercard' },
  { id: 'ahorro', name: 'Ahorros', type: 'ahorro', initial: 0, aliases: 'ahorro, ahorros, alcancia' },
];

const DEFAULT_CATS = [
  { id: 'comida', name: 'Comida', icon: '🍽️', kind: 'gasto', words: 'almuerzo desayuno cena comida menu pollo pollada chifa ceviche cevicheria restaurante restaurant cafe snack pan pizza hamburguesa kfc bembos mcdonalds starbucks rappi pedidosya delivery jugo helado antojo salchipapa lonche galletas gaseosa' },
  { id: 'super', name: 'Supermercado', icon: '🛒', kind: 'gasto', words: 'super supermercado tottus plazavea vea metro wong vivanda makro mass tambo oxxo mercado bodega abarrotes viveres' },
  { id: 'transporte', name: 'Transporte', icon: '🚕', kind: 'gasto', words: 'taxi uber didi cabify indriver indrive bus combi micro pasaje metropolitano corredor gasolina grifo combustible peaje estacionamiento cochera colectivo mototaxi' },
  { id: 'casa', name: 'Casa y servicios', icon: '🏠', kind: 'gasto', words: 'alquiler luz internet cable gas enel sedapal claro movistar entel bitel recarga celular' },
  { id: 'salud', name: 'Salud', icon: '💊', kind: 'gasto', words: 'farmacia inkafarma mifarma botica medicina pastilla doctor medico clinica consulta dentista analisis' },
  { id: 'educacion', name: 'Educación', icon: '📚', kind: 'gasto', words: 'universidad pension matricula libro curso copia utiles udemy platzi impresion' },
  { id: 'ocio', name: 'Salidas y ocio', icon: '🎉', kind: 'gasto', words: 'cine cineplanet cinemark juego steam playstation salida discoteca fiesta cerveza chela trago concierto entrada bar' },
  { id: 'subs', name: 'Suscripciones', icon: '🔁', kind: 'gasto', words: 'netflix spotify youtube disney hbo prime icloud chatgpt claude suscripcion' },
  { id: 'ropa', name: 'Ropa y compras', icon: '🛍️', kind: 'gasto', words: 'ropa zapatilla zapato polo pantalon casaca zara saga falabella ripley oechsle amazon aliexpress temu' },
  { id: 'cuidado', name: 'Cuidado personal', icon: '💈', kind: 'gasto', words: 'corte peluqueria barberia gym gimnasio perfume' },
  { id: 'regalos', name: 'Regalos', icon: '🎁', kind: 'gasto', words: 'regalo cumpleanos' },
  { id: 'intereses', name: 'Intereses y comisiones', icon: '🏦', kind: 'gasto', words: 'interes comision mantenimiento membresia' },
  { id: 'otros', name: 'Otros gastos', icon: '📦', kind: 'gasto', words: '' },
  { id: 'sueldo', name: 'Sueldo', icon: '💼', kind: 'ingreso', words: 'sueldo salario quincena planilla' },
  { id: 'extra', name: 'Ingreso extra', icon: '✨', kind: 'ingreso', words: 'freelance bono propina cachuelo venta vendi' },
  { id: 'otros_ing', name: 'Otros ingresos', icon: '💰', kind: 'ingreso', words: '' },
];

function defaults() {
  return {
    version: 1,
    accounts: DEFAULT_ACCOUNTS.map(a => ({ ...a })),
    categories: DEFAULT_CATS.map(c => ({ ...c })),
    debts: [],
    tx: [],
    rules: {},
    settings: { savingGoalPct: 20, defaultAccount: 'yape', lastBackup: null },
  };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.tx)) {
      const d = defaults();
      // categorías nuevas de versiones posteriores
      for (const c of d.categories) if (!s.categories.some(x => x.id === c.id)) s.categories.splice(s.categories.length - 3, 0, c);
      return { ...d, ...s, settings: { ...d.settings, ...s.settings } };
    }
  } catch (e) { /* datos corruptos: arranca limpio */ }
  return defaults();
}
let S = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('No se pudo guardar: ' + e.message); }
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

const acc = id => S.accounts.find(a => a.id === id);
const cat = id => S.categories.find(c => c.id === id);
const debt = id => S.debts.find(d => d.id === id);

/* ============ Lector de texto ============ */
const STOP = new Set('con en por de del a al el la los las un una y para mi mis desde use hoy ayer anteayer antier soles sol lucas luca s pague gaste compre gasto pagar me se lo le que tu su mas'.split(' '));
const DATE_WORDS = new Set(['hoy', 'ayer', 'anteayer', 'antier']);
const VERBS = new Set(['pague', 'gaste', 'compre', 'use']);
const CONNECTORS = new Set(['con', 'en', 'por', 'de', 'del', 'a', 'al', 'desde', 'y', 'mi', 'el', 'la']);
const RX_INCOME = /(^|\s)(sueldo|salario|quincena|cobre|me pagaron|me pago|me yapearon|me yapeo|te yapearon|te yapeo|me plinearon|recibi|recibiste|te enviaron|te envio|me enviaron|me depositaron|me devolvieron|devolucion|propina|vendi|ingreso)(\s|$)/;
const RX_TRANSFER = /(^|\s)(pase|transferi|transferencia|movi|retire|retiro|deposite)(\s|$)/;
const RX_SAVE = /(^|\s)(ahorre|guarde|separe)(\s|$)/;
const RX_PAY = /(^|\s)(pague|pago|abone|abono|cuota|devolvi|le devolvi)(\s|$)/;

function findAccounts(n) {
  const hits = [];
  for (const a of S.accounts) {
    for (const raw of [a.name, ...String(a.aliases || '').split(',')]) {
      const al = norm(raw).replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!al) continue;
      const re = new RegExp('(^|\\s)' + reEsc(al) + '(?=\\s|$)', 'g');
      let m;
      while ((m = re.exec(n))) {
        const start = m.index + m[1].length;
        hits.push({ id: a.id, start, end: start + al.length, al });
      }
    }
  }
  hits.sort((x, y) => (y.end - y.start) - (x.end - x.start));
  const kept = [];
  for (const h of hits) if (!kept.some(k => h.start < k.end && k.start < h.end)) kept.push(h);
  kept.sort((x, y) => x.start - y.start);
  const ids = [];
  for (const h of kept) if (!ids.includes(h.id)) ids.push(h.id);
  return { ids, words: kept.map(h => h.al) };
}

function findCategory(tokens, kind) {
  for (const t of tokens) {
    const r = S.rules[t];
    if (r && cat(r) && cat(r).kind === kind) return r;
  }
  for (const c of S.categories) {
    if (c.kind !== kind) continue;
    const words = norm(c.words || '').split(/[\s,]+/).filter(Boolean);
    if (tokens.some(t => words.includes(t))) return c.id;
  }
  return null;
}

function extractNote(text, accWords, amtRaw) {
  // Notificaciones de Yape / bancos
  if (text.length > 40 || /s\/\s*\d/i.test(text)) {
    const m =
      text.match(/yapeaste\s+s\/\.?\s*[\d.,]+\s+a\s+([^\n.!,¡]+)/i) ||
      text.match(/\ben\s+([A-Z0-9][A-Z0-9 .&*'\-]{1,40}[A-Z0-9])/) ||
      text.match(/([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ.]*){0,3})\s+te\s+(?:yape|envi)/);
    if (m) return m[1].trim();
  }
  const accSet = new Set(accWords.flatMap(w => w.split(' ')));
  const rest = amtRaw ? text.replace(amtRaw, ' ') : text;
  const words = rest.split(/\s+/).filter(Boolean).map(w => {
    const k = norm(w).replace(/[^a-z0-9ñ+/]/g, '');
    const drop = !k || accSet.has(k) || DATE_WORDS.has(k) || VERBS.has(k) || /^[+\-]?\d/.test(k) ||
      ['s/', 's', 'soles', 'sol', 'lucas', 'luca', '+'].includes(k);
    return { w, k, drop };
  });
  // conectores pegados a lo que se quitó ("con yape", "en efectivo")
  for (let i = 0; i < words.length; i++) {
    if (!words[i].drop && CONNECTORS.has(words[i].k) && (!words[i + 1] || words[i + 1].drop)) words[i].drop = true;
  }
  let kept = words.filter(x => !x.drop);
  while (kept.length && CONNECTORS.has(kept[0].k)) kept.shift();
  while (kept.length && CONNECTORS.has(kept[kept.length - 1].k)) kept.pop();
  let note = kept.map(x => x.w).join(' ').replace(/^[,.;:\-\s]+|[,.;:\-\s]+$/g, '');
  if (note.length > 60) note = note.slice(0, 57) + '…';
  return note ? note[0].toUpperCase() + note.slice(1) : '';
}

function parse(raw) {
  let text = String(raw || '').trim();
  if (!text) return null;
  // «12 cuotas», «en 6 cuotas», «sin intereses» se leen aparte para no confundirlos con el monto
  let cuotas = 1, sinInteres = false;
  const mc = text.match(/(?:\b(?:en|a)\s+)?(\d{1,2})\s*cuotas?\b/i);
  if (mc) { cuotas = Math.max(1, Math.min(60, Number(mc[1]))); text = text.replace(mc[0], ' '); }
  const ms = text.match(/sin\s+inter[eé]s(?:es)?/i);
  if (ms) { sinInteres = true; text = text.replace(ms[0], ' '); }
  text = text.replace(/\s+/g, ' ').trim();
  const n = norm(text).replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // Monto: primero "S/ 18.50", luego "18 soles", luego el primer número suelto (evita fechas, horas y tarjetas)
  let amount = null, amtRaw = '';
  let m = text.match(/S\/\.?\s*(\d[\d.,]*)/i) || text.match(/(\d[\d.,]*)\s*(?:soles|sol|lucas|luca)\b/i);
  if (m) { amtRaw = m[0]; amount = toCents(m[1]); }
  if (!amount) {
    const re = /(^|[^\d\/:*\w])(\d[\d.,]*)(?![\d\/:])/g;
    let mm;
    while ((mm = re.exec(text))) {
      const c = toCents(mm[2]);
      if (c) { amount = c; amtRaw = mm[2]; break; }
    }
  }

  const accs = findAccounts(n);
  const accWordSet = new Set(accs.words.flatMap(w => w.split(' ')));
  const all = n.split(' ').filter(Boolean);
  const tokens = [];
  for (const t of all) {
    if (/^\d+$/.test(t) || STOP.has(t) || t.length < 2 || accWordSet.has(t)) continue;
    tokens.push(t);
    if (t.length > 3 && t.endsWith('s')) tokens.push(t.slice(0, -1));
    if (t.length > 4 && t.endsWith('es')) tokens.push(t.slice(0, -2));
  }

  const nonCredit = accs.ids.filter(id => acc(id).type !== 'credito');
  const credit = accs.ids.find(id => acc(id).type === 'credito');
  const savings = S.accounts.find(a => a.type === 'ahorro');
  const cash = S.accounts.find(a => a.type === 'efectivo');
  const debtHit = S.debts.find(d => norm(d.name).split(/\s+/).some(w => w.length >= 3 && !STOP.has(w) && all.includes(w)));

  let type = /^\s*\+/.test(text) || RX_INCOME.test(n) ? 'ingreso' : 'gasto';
  let accountId = null, toAccountId = null, debtId = null, categoryId = null;

  if (type === 'ingreso') {
    categoryId = findCategory(tokens, 'ingreso');
    accountId = accs.ids[0] || null;
  } else {
    const guess = findCategory(tokens, 'gasto');
    if (RX_PAY.test(n) && debtHit && !guess) {
      type = 'pago_deuda'; debtId = debtHit.id; accountId = nonCredit[0] || null;
    } else if (RX_PAY.test(n) && credit && !guess) {
      type = 'transferencia'; toAccountId = credit; accountId = nonCredit[0] || null;
    } else if (RX_SAVE.test(n) && savings) {
      type = 'transferencia'; toAccountId = savings.id;
      accountId = accs.ids.find(id => id !== savings.id) || null;
    } else if (RX_TRANSFER.test(n) && (accs.ids.length >= 2 || /(^|\s)(retire|retiro)(\s|$)/.test(n))) {
      type = 'transferencia';
      if (accs.ids.length >= 2) { accountId = accs.ids[0]; toAccountId = accs.ids[1]; }
      else { accountId = accs.ids[0] || S.accounts.find(a => a.type === 'banco')?.id; toAccountId = cash?.id; }
    } else {
      categoryId = guess; accountId = accs.ids[0] || null;
    }
  }

  if (!accountId || !acc(accountId)) accountId = acc(S.settings.defaultAccount) ? S.settings.defaultAccount : S.accounts[0]?.id;
  if (type === 'transferencia' && toAccountId === accountId) {
    accountId = S.accounts.find(a => a.id !== toAccountId && a.type !== 'credito')?.id;
  }
  if (type === 'gasto' && cuotas > 1 && acc(accountId)?.type !== 'credito' && !accs.ids.length) {
    const cc = S.accounts.find(a => a.type === 'credito');
    if (cc) accountId = cc.id;
  }
  if ((type === 'gasto' || type === 'ingreso') && !categoryId) categoryId = type === 'ingreso' ? 'otros_ing' : 'otros';

  let date = today();
  if (/(^|\s)(anteayer|antier)(\s|$)/.test(n)) date = daysAgo(2);
  else if (/(^|\s)ayer(\s|$)/.test(n)) date = daysAgo(1);

  let note = extractNote(text, accs.words, amtRaw);
  if (type === 'transferencia' && !note.includes(' ')) note = ''; // «Pasé», «Retiré» no aportan nada
  const keys = [...new Set(tokens.filter(t => t.length >= 3 && !/^\d/.test(t)))].slice(0, 4);
  return { type, amount, categoryId, accountId, toAccountId, debtId, date, note, keys, cuotas, sinInteres };
}

/* ============ Cálculos ============ */
// Una tarjeta configurada guarda «lo que debes hoy» como foto; lo registrado antes de esa foto ya está incluido
const counts = (accountId, t) => { const a = acc(accountId); return t.virtual || !a || !a.setupAt || (t.created || 0) > a.setupAt; };

// Saldos de cada cuenta; con `upTo` (YYYY-MM-DD) solo cuenta lo registrado hasta ese día
function balances(upTo, list) {
  const b = {};
  S.accounts.forEach(a => { b[a.id] = a.initial || 0; });
  const mv = (id, t, v) => { if (counts(id, t)) b[id] = (b[id] || 0) + v; };
  for (const t of list || allTx()) {
    if (upTo && t.date > upTo) continue;
    if (t.type === 'gasto' || t.type === 'pago_deuda') mv(t.accountId, t, -t.amount);
    else if (t.type === 'ingreso') mv(t.accountId, t, t.amount);
    else if (t.type === 'transferencia') { mv(t.accountId, t, -t.amount); mv(t.toAccountId, t, t.amount); }
  }
  return b;
}

/* ============ Tarjetas de crédito ============ */
const fmtShort = iso => { const d = parseDate(iso); return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }).replace(/\.$/, '') + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''); };
const dayIn = (y, m, day) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
const isCardReady = a => !!(a && a.type === 'credito' && a.closeDay && a.payDay);
// Cierre (facturación) en el que cae algo comprado en `iso`
function closeFor(card, iso) {
  const d = parseDate(iso);
  let c = dayIn(d.getFullYear(), d.getMonth(), card.closeDay);
  if (c < d) c = dayIn(d.getFullYear(), d.getMonth() + 1, card.closeDay);
  return isoDate(c);
}
const closeAdd = (card, iso, k) => { const d = parseDate(iso); return isoDate(dayIn(d.getFullYear(), d.getMonth() + k, card.closeDay)); };
const dueFor = (card, closeIso) => { const d = parseDate(closeIso); return isoDate(dayIn(d.getFullYear(), d.getMonth() + (card.payDay > card.closeDay ? 0 : 1), card.payDay)); };
function nextDue(card, iso) {
  const d = parseDate(iso);
  let p = dayIn(d.getFullYear(), d.getMonth(), card.payDay);
  if (p < d) p = dayIn(d.getFullYear(), d.getMonth() + 1, card.payDay);
  return isoDate(p);
}

// Cuota fija (método francés) con la TEA convertida a tasa mensual
function cuotaSchedule(amount, n, tea) {
  const i = tea > 0 ? Math.pow(1 + tea / 100, 1 / 12) - 1 : 0;
  const fixed = i ? amount * i / (1 - Math.pow(1 + i, -n)) : amount / n;
  const rows = [];
  let bal = amount;
  for (let k = 1; k <= n; k++) {
    const interest = Math.round(bal * i);
    const capital = k === n ? bal : Math.round(fixed) - interest;
    bal -= capital;
    rows.push({ k, capital, interest, amount: capital + interest });
  }
  return rows;
}

function cardInfo(card) {
  if (!isCardReady(card)) return null;
  const setup = card.setupAt ? isoDate(new Date(card.setupAt)) : '2000-01-01';
  const t0 = today();
  const bills = {};
  const add = (close, v) => { bills[close] = (bills[close] || 0) + v; };
  const interest = [], plans = [];
  const first = closeFor(card, setup);
  add(closeFor(card, t0), 0); // el ciclo abierto siempre existe
  if (card.unbilled) add(first, card.unbilled);
  for (const p of card.plans || []) {
    let billed = 0;
    for (let j = 0; j < p.remaining; j++) { const c = closeAdd(card, first, j); add(c, p.cuota); if (c < t0) billed++; }
    if (billed < p.remaining) plans.push({ label: p.desc || 'Compra anterior', cuota: p.cuota, left: p.remaining - billed, of: null, end: closeAdd(card, first, p.remaining - 1) });
  }
  let paid = 0;
  for (const t of S.tx) {
    if (!counts(card.id, t)) continue;
    if (t.type === 'gasto' && t.accountId === card.id) {
      const n = t.cuotas || 1, c0 = closeFor(card, t.date);
      if (n === 1) { add(c0, t.amount); continue; }
      const rows = cuotaSchedule(t.amount, n, t.tea ?? card.tea ?? 0);
      let billed = 0;
      rows.forEach((r, k) => {
        const c = closeAdd(card, c0, k);
        add(c, r.amount);
        if (c < t0) billed++;
        if (r.interest && c <= t0) interest.push({ id: `int-${t.id}-${r.k}`, virtual: true, type: 'gasto', categoryId: 'intereses', accountId: card.id, amount: r.interest, date: c, created: 0, note: `Interés cuota ${r.k}/${n}${t.note ? ' · ' + t.note : ''}` });
      });
      if (billed < n) plans.push({ label: t.note || cat(t.categoryId)?.name || 'Compra', cuota: rows[0].amount, left: n - billed, of: n, end: closeAdd(card, c0, n - 1) });
    } else if (t.type === 'transferencia' && t.accountId === card.id) add(closeFor(card, t.date), t.amount);
    else if ((t.type === 'transferencia' && t.toAccountId === card.id) || (t.type === 'ingreso' && t.accountId === card.id)) paid += t.amount;
  }
  // Estados de cuenta en orden; cada pago cubre primero el más antiguo
  const statements = [{ close: null, due: nextDue(card, setup), amount: card.statement0 || 0 }]
    .concat(Object.keys(bills).sort().map(c => ({ close: c, due: dueFor(card, c), amount: bills[c] })));
  let pool = paid;
  for (const s of statements) { const use = Math.min(pool, s.amount); s.left = s.amount - use; pool -= use; }
  const closed = statements.filter(s => (s.close === null || s.close < t0) && s.left > 0);
  const due = closed.length ? { amount: closed.reduce((x, s) => x + s.left, 0), date: closed[0].due, overdue: closed[0].due < t0 } : null;
  const next = statements.find(s => s.close && s.close >= t0);
  return { statements, due, next, interest, plans, credit: pool };
}
const cardInterest = () => S.accounts.filter(isCardReady).flatMap(c => cardInfo(c).interest);
const allTx = () => S.tx.concat(cardInterest());
function debtRemaining(d, upTo) {
  const paid = S.tx.filter(t => t.type === 'pago_deuda' && t.debtId === d.id && (!upTo || t.date <= upTo)).reduce((s, t) => s + t.amount, 0);
  return Math.max(0, d.total - (d.paidBefore || 0) - paid);
}
function summary(month) {
  let inc = 0, exp = 0, debtPay = 0, saved = 0;
  const byCat = {};
  for (const t of allTx()) {
    if (!t.date.startsWith(month)) continue;
    if (t.type === 'ingreso') inc += t.amount;
    else if (t.type === 'gasto') { exp += t.amount; byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount; }
    else if (t.type === 'pago_deuda') debtPay += t.amount;
    else if (t.type === 'transferencia' && acc(t.toAccountId)?.type === 'ahorro' && acc(t.accountId)?.type !== 'ahorro') saved += t.amount;
  }
  return { inc, exp, debtPay, saved, byCat, net: inc - exp - debtPay };
}
const monthKey = d => d.slice(0, 7);
function shiftMonth(mk, delta) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
const monthLabel = mk => { const [y, m] = mk.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1); };
function dayLabel(d) {
  if (d === today()) return 'Hoy';
  if (d === daysAgo(1)) return 'Ayer';
  const t = parseDate(d).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  return t[0].toUpperCase() + t.slice(1);
}

/* ============ Estado de la vista ============ */
const V = { tab: 'inicio', month: monthKey(today()), text: '', over: {}, search: '', mode: 'gasto', filter: 'todo', range: 6 };
let lastSaved = null;

function draft() {
  const p = parse(V.text);
  if (!p) return null;
  const d = { ...p, ...V.over };
  // En modo Ingreso, lo que el lector tomó por gasto es un ingreso
  if (V.mode === 'ingreso' && !V.over.type && p.type === 'gasto') d.type = 'ingreso';
  if (d.type === 'gasto' || d.type === 'ingreso') {
    if (!cat(d.categoryId) || cat(d.categoryId).kind !== d.type) d.categoryId = findCategory(p.keys, d.type) || (d.type === 'ingreso' ? 'otros_ing' : 'otros');
  }
  if (d.type === 'transferencia' && !acc(d.toAccountId)) d.toAccountId = S.accounts.find(a => a.id !== d.accountId)?.id;
  if (d.type === 'pago_deuda' && !debt(d.debtId)) d.debtId = S.debts[0]?.id || null;
  d.cuotas = Number(d.cuotas) || 1;
  d.onCard = d.type === 'gasto' && acc(d.accountId)?.type === 'credito';
  if (!d.onCard) d.cuotas = 1;
  d.tea = d.sinInteres ? 0 : (acc(d.accountId)?.tea || 0);
  return d;
}

/* ============ Render ============ */
function render() {
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === V.tab));
  const app = $('#app');
  app.innerHTML = { inicio: viewInicio, movs: viewMovs, graficos: viewGraficos, cuentas: viewCuentas, ajustes: viewAjustes }[V.tab]();
  if (V.tab === 'inicio') bindComposer();
  if (V.tab === 'graficos') mountCharts();
}

function txLine(t) {
  const c = cat(t.categoryId), a = acc(t.accountId);
  let icon = c?.icon || '•', title = t.note || c?.name || TYPES[t.type].label, sub = [], cls = 'gasto', sign = '−';
  if (t.type === 'ingreso') { cls = 'ingreso'; sign = '+'; }
  if (t.type === 'transferencia') {
    icon = '⇄'; cls = 'neutral'; sign = '';
    const toType = acc(t.toAccountId)?.type;
    title = t.note || (toType === 'credito' ? 'Pago de tarjeta' : toType === 'ahorro' ? 'Ahorro' : 'Transferencia');
    sub.push(`${a?.name || '?'} → ${acc(t.toAccountId)?.name || '?'}`);
  } else if (t.type === 'pago_deuda') {
    icon = '✓'; cls = 'neutral';
    title = t.note || `Pago: ${debt(t.debtId)?.name || 'deuda'}`;
    sub.push(debt(t.debtId)?.name || 'Deuda', a?.name || '?');
  } else {
    if (t.note && c) sub.push(c.name);
    sub.push(a?.name || '?');
    if (t.cuotas > 1) sub.push(`${t.cuotas} cuotas`);
  }
  return `<button class="item" ${t.virtual ? `data-card="${t.accountId}"` : `data-edit="${t.id}"`}>
    <span class="ico">${icon}</span>
    <span class="main"><div class="title">${esc(title)}</div><div class="sub">${esc(sub.join(' · '))}</div></span>
    <span class="num ${cls}">${sign}${money(t.amount)}</span>
  </button>`;
}

function viewComposer() {
  const inc = V.mode === 'ingreso';
  return `<div class="card composer">
    <div class="seg" style="margin:-4px -6px 12px"><button data-mode="gasto" class="${inc ? '' : 'on'}">↓ Gasto</button><button data-mode="ingreso" class="${inc ? 'on' : ''}">↑ Ingreso</button></div>
    <textarea id="q" rows="1" placeholder="${inc ? '¿Cuánto te entró? Ej: sueldo 1500 interbank' : '¿Qué gastaste? Ej: almuerzo 18 yape'}" autocomplete="off" autocapitalize="sentences">${esc(V.text)}</textarea>
    <div id="preview">${previewHTML()}</div>
    <div class="row">
      <button class="btn" id="paste" title="Pegar notificación">📋 Pegar</button>
      <button class="btn primary" id="saveq" style="flex:1" ${draft()?.amount ? '' : 'disabled'}>Guardar</button>
    </div>
    ${V.text ? '' : inc ? '<div class="hint">Ejemplos: «sueldo 1500 interbank», «me yapearon 50 por la clase», «venta 80 efectivo», «cachuelo 200 yape». También puedes pegar la notificación de «Te yapearon».</div>' : '<div class="hint">Escribe como hablas: «taxi 12 efectivo», «ayer super 85 débito», «+2500 sueldo bcp», «pasé 100 de yape a efectivo». También puedes pegar la notificación de Yape o del banco, o dictar con el micrófono del teclado.</div>'}
  </div>`;
}

function previewHTML() {
  const d = draft();
  if (!d) return '';
  const a = acc(d.accountId), c = cat(d.categoryId);
  const chips = [`<button class="chip on" data-pick="type">${TYPES[d.type].icon} ${TYPES[d.type].label}</button>`];
  if (d.type === 'gasto' || d.type === 'ingreso') chips.push(`<button class="chip" data-pick="categoryId">${c?.icon || ''} ${esc(c?.name || 'Categoría')}</button>`);
  if (d.type === 'pago_deuda') chips.push(`<button class="chip" data-pick="debtId">🧾 ${esc(debt(d.debtId)?.name || 'Elige deuda')}</button>`);
  chips.push(`<button class="chip" data-pick="accountId">${ACC_ICON[a?.type] || ''} ${d.type === 'transferencia' ? 'De ' : ''}${esc(a?.name || 'Cuenta')}</button>`);
  if (d.type === 'transferencia') { const ta = acc(d.toAccountId); chips.push(`<button class="chip" data-pick="toAccountId">${ACC_ICON[ta?.type] || ''} A ${esc(ta?.name || 'Cuenta')}</button>`); }
  if (d.onCard) {
    const cuota = d.amount && d.cuotas > 1 ? ` · ${money(cuotaSchedule(d.amount, d.cuotas, d.tea)[0].amount)}/mes` : '';
    chips.push(`<button class="chip" data-pick="cuotas">📆 ${d.cuotas === 1 ? '1 cuota' : d.cuotas + ' cuotas'}${cuota}</button>`);
    if (d.cuotas > 1) chips.push(`<button class="chip ${d.sinInteres ? 'on' : ''}" data-pick="sinInteres">${d.sinInteres ? 'Sin intereses' : `TEA ${d.tea}%`}</button>`);
  }
  chips.push(`<label class="chip">📅 ${esc(dayLabel(d.date))}<input type="date" id="pdate" value="${d.date}"></label>`);
  return `<div class="preview">
    <div class="amount-line"><span class="muted">S/</span><input id="pamt" inputmode="decimal" placeholder="0.00" value="${d.amount ? (d.amount / 100).toFixed(2) : ''}"></div>
    <input class="note" id="pnote" placeholder="Descripción" value="${esc(d.note)}">
    <div class="chips">${chips.join('')}</div>
  </div>`;
}

function refreshPreview() {
  $('#preview').innerHTML = previewHTML();
  $('#saveq').disabled = !draft()?.amount;
}

function bindComposer() {
  const q = $('#q');
  const grow = () => { q.style.height = 'auto'; q.style.height = q.scrollHeight + 'px'; };
  grow();
  q.addEventListener('input', () => {
    V.text = q.value;
    if (!V.text.trim()) V.over = {};
    $('.composer .hint')?.remove();
    grow();
    refreshPreview();
  });
  q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveDraft(); } });
  $('#preview').addEventListener('input', e => {
    if (e.target.id === 'pamt') V.over.amount = toCents(e.target.value);
    if (e.target.id === 'pnote') V.over.note = e.target.value;
    $('#saveq').disabled = !draft()?.amount;
  });
  $('#preview').addEventListener('change', e => {
    if (e.target.id === 'pdate' && e.target.value) { V.over.date = e.target.value; refreshPreview(); }
  });
  $('#preview').addEventListener('click', e => {
    const b = e.target.closest('[data-pick]');
    if (b) pickForDraft(b.dataset.pick);
  });
  $('#saveq').addEventListener('click', saveDraft);
  $$('.composer [data-mode]').forEach(b => b.addEventListener('click', () => {
    V.mode = b.dataset.mode; delete V.over.type; render(); $('#q').focus();
  }));
  $('#paste').addEventListener('click', async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) return toast('El portapapeles está vacío');
      if (looksLikeBackup(t)) { importText(t); return; }
      V.text = t.trim(); V.over = {};
      render();
    } catch {
      q.focus();
      toast('Mantén presionado el cuadro y toca «Pegar»');
    }
  });
}

function pickForDraft(field) {
  const d = draft();
  if (field === 'sinInteres') { V.over.sinInteres = !d.sinInteres; refreshPreview(); return; }
  if (field === 'cuotas') {
    picker('Cuotas', [1, 2, 3, 4, 6, 9, 12, 18, 24, 36].map(k => ({ value: String(k), label: k === 1 ? '1 cuota (sin intereses)' : `${k} cuotas${d.amount ? ' · ' + money(cuotaSchedule(d.amount, k, d.tea)[0].amount) + '/mes' : ''}` })),
      String(d.cuotas), v => { V.over.cuotas = Number(v); refreshPreview(); });
    return;
  }
  let opts = [], title = '';
  if (field === 'type') { title = 'Tipo'; opts = Object.entries(TYPES).map(([k, v]) => ({ value: k, label: `${v.icon} ${v.label}` })); }
  if (field === 'categoryId') { title = 'Categoría'; opts = S.categories.filter(c => c.kind === d.type).map(c => ({ value: c.id, label: `${c.icon} ${c.name}` })); }
  if (field === 'accountId' || field === 'toAccountId') { title = field === 'accountId' ? 'Cuenta' : 'Hacia la cuenta'; opts = S.accounts.map(a => ({ value: a.id, label: `${ACC_ICON[a.type]} ${a.name}` })); }
  if (field === 'debtId') {
    title = 'Deuda';
    opts = S.debts.map(x => ({ value: x.id, label: `🧾 ${x.name} · falta ${money(debtRemaining(x))}` }));
    if (!opts.length) { toast('Primero agrega la deuda en Cuentas'); return; }
  }
  picker(title, opts, d[field], v => { V.over[field] = v; if (field === 'categoryId') V.over.learn = true; refreshPreview(); });
}

function saveDraft() {
  const d = draft();
  if (!d || !d.amount) { toast('Falta el monto'); return; }
  if (d.type === 'pago_deuda' && !debt(d.debtId)) { toast('Elige a qué deuda va el pago'); return; }
  const t = { id: uid(), type: d.type, amount: d.amount, date: d.date, note: (d.note || '').trim(), accountId: d.accountId, created: Date.now() };
  if (d.type === 'gasto' || d.type === 'ingreso') t.categoryId = d.categoryId;
  if (d.type === 'transferencia') t.toAccountId = d.toAccountId;
  if (d.type === 'pago_deuda') t.debtId = d.debtId;
  if (d.onCard && d.cuotas > 1) { t.cuotas = d.cuotas; t.tea = d.tea; }
  // Aprende: si corregiste la categoría, la próxima vez esas palabras van ahí
  if (V.over.learn && t.categoryId) d.keys.forEach(k => { S.rules[k] = t.categoryId; });
  S.tx.push(t);
  save();
  lastSaved = t.id;
  V.text = ''; V.over = {};
  render();
  $('#q').focus();
  const label = t.categoryId ? cat(t.categoryId).name : TYPES[t.type].label;
  toast(`Guardado: ${label} · ${money(t.amount)} · ${acc(t.accountId)?.name}`, 'Deshacer', () => {
    S.tx = S.tx.filter(x => x.id !== lastSaved); save(); render();
  });
}

function viewInicio() {
  const s = summary(V.month);
  const rate = s.inc > 0 ? Math.round((s.net / s.inc) * 100) : null;
  const goal = S.settings.savingGoalPct;
  const b = balances();
  const assets = S.accounts.filter(a => a.type !== 'credito').reduce((x, a) => x + (b[a.id] || 0), 0);
  const cardDebt = S.accounts.filter(a => a.type === 'credito').reduce((x, a) => x + Math.max(0, -(b[a.id] || 0)), 0);
  const otherDebt = S.debts.reduce((x, d) => x + debtRemaining(d), 0);
  const cats = Object.entries(s.byCat).sort((x, y) => y[1] - x[1]);
  const incCats = {};
  allTx().forEach(t => { if (t.type === 'ingreso' && t.date.startsWith(V.month)) incCats[t.categoryId] = (incCats[t.categoryId] || 0) + t.amount; });
  const incList = Object.entries(incCats).sort((x, y) => y[1] - x[1]);
  const debtAlerts = S.debts.filter(d => d.due && debtRemaining(d) > 0 && (parseDate(d.due) - parseDate(today())) / 864e5 <= 10);
  const max = cats[0]?.[1] || 1;
  const recent = allTx().filter(t => t.date.startsWith(V.month)).sort(byNewest).slice(0, 6);
  const cardAlerts = S.accounts.filter(isCardReady).map(c => ({ c, due: cardInfo(c).due })).filter(x => x.due);
  const needBackup = S.tx.length >= 5 && (!S.settings.lastBackup || (Date.now() - parseDate(S.settings.lastBackup)) / 864e5 > 14);

  return `
  <h1>Finanzas</h1>
  ${needBackup ? `<div class="banner"><span>Tus datos viven solo en este iPhone. Haz un respaldo.</span><button class="linkbtn" data-act="backup">Respaldar</button></div>` : ''}
  ${viewComposer()}
  ${cardAlerts.map(({ c, due }) => {
    const soon = due.overdue || (parseDate(due.date) - parseDate(today())) / 864e5 <= 3;
    return `<button class="banner" data-card="${c.id}" style="width:100%;border:0;margin-top:10px;text-align:left${soon ? ';background:color-mix(in srgb, var(--gasto) 18%, transparent)' : ''}">
      <span>💳 <b>${esc(c.name)}</b>: paga ${money(due.amount)} ${due.overdue ? '— venció el' : 'hasta el'} ${fmtShort(due.date)}</span><span class="linkbtn">Ver</span></button>`;
  }).join('')}
  ${debtAlerts.map(d => {
    const late = d.due < today();
    return `<button class="banner" data-debt="${d.id}" style="width:100%;border:0;margin-top:10px;text-align:left${late || (parseDate(d.due) - parseDate(today())) / 864e5 <= 3 ? ';background:color-mix(in srgb, var(--gasto) 18%, transparent)' : ''}">
      <span>🧾 <b>${esc(d.name)}</b>: ${money(debtRemaining(d))} ${late ? '— venció el' : 'vence el'} ${fmtShort(d.due)}</span><span class="linkbtn">Ver</span></button>`;
  }).join('')}

  <div class="month-nav">
    <button data-month="-1" aria-label="Mes anterior">‹</button>
    <strong>${monthLabel(V.month)}</strong>
    <button data-month="1" aria-label="Mes siguiente">›</button>
  </div>
  <div class="grid2">
    <div class="card stat"><div class="label">Ingresos</div><div class="value num ingreso">${money(s.inc)}</div></div>
    <div class="card stat"><div class="label">Gastos</div><div class="value num gasto">${money(s.exp)}</div></div>
  </div>
  <div class="card" style="margin-top:10px">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <div><div class="muted small">Te quedó este mes</div><div class="num" style="font-size:22px;font-weight:700">${money(s.net)}</div></div>
      <div style="text-align:right"><div class="muted small">Nivel de ahorro</div><div style="font-size:22px;font-weight:700" class="${rate !== null && rate < goal ? 'gasto' : 'ingreso'}">${rate === null ? '—' : rate + '%'}</div></div>
    </div>
    <div class="bar ${rate !== null && rate < goal ? 'warn' : ''}"><i style="width:${rate === null ? 0 : Math.max(0, Math.min(100, (rate / goal) * 100))}%"></i></div>
    <div class="muted small" style="margin-top:6px">Meta: ahorrar ${goal}% de lo que entra${s.debtPay ? ` · pagaste ${money(s.debtPay)} de deudas` : ''}${s.saved ? ` · separaste ${money(s.saved)} a ahorros` : ''}</div>
  </div>

  <div class="grid2" style="margin-top:10px">
    <div class="card stat"><div class="label">Tienes</div><div class="value num">${money(assets)}</div></div>
    <div class="card stat"><div class="label">Debes</div><div class="value num ${cardDebt + otherDebt ? 'gasto' : ''}">${money(cardDebt + otherDebt)}</div></div>
  </div>

  ${incList.length ? `<h2>De dónde vino</h2>
  <div class="card">
    ${incList.map(([id, v]) => `<div class="catrow"><span>${cat(id)?.icon || '•'}</span><span>${esc(cat(id)?.name || 'Sin categoría')}</span><span class="num ingreso">${money(v)}</span><div class="bar"><i style="width:${(v / incList[0][1]) * 100}%;background:var(--ingreso)"></i></div></div>`).join('')}
  </div>` : ''}

  <h2>En qué se fue</h2>
  <div class="card">
    ${cats.length ? cats.map(([id, v]) => `<div class="catrow"><span>${cat(id)?.icon || '•'}</span><span>${esc(cat(id)?.name || 'Sin categoría')}</span><span class="num">${money(v)}</span><div class="bar"><i style="width:${(v / max) * 100}%;background:var(--s1)"></i></div></div>`).join('') : '<div class="empty">Sin gastos este mes</div>'}
  </div>

  <h2>Últimos movimientos</h2>
  ${recent.length ? `<div class="list">${recent.map(txLine).join('')}</div>` : '<div class="card empty">Todavía no hay movimientos</div>'}
  `;
}

const byNewest = (a, b) => b.date.localeCompare(a.date) || b.created - a.created;

function viewMovs() {
  const q = norm(V.search.trim());
  let list = allTx().filter(t => t.date.startsWith(V.month));
  const inc = list.filter(t => t.type === 'ingreso').reduce((x, t) => x + t.amount, 0);
  const exp = list.filter(t => t.type === 'gasto').reduce((x, t) => x + t.amount, 0);
  if (V.filter === 'gasto') list = list.filter(t => t.type === 'gasto');
  if (V.filter === 'ingreso') list = list.filter(t => t.type === 'ingreso');
  if (V.filter === 'otros') list = list.filter(t => t.type === 'transferencia' || t.type === 'pago_deuda');
  if (q) list = list.filter(t => norm([t.note, cat(t.categoryId)?.name, acc(t.accountId)?.name, acc(t.toAccountId)?.name, debt(t.debtId)?.name].join(' ')).includes(q));
  list.sort(byNewest);
  const groups = {};
  list.forEach(t => (groups[t.date] = groups[t.date] || []).push(t));
  return `
  <h1>Movimientos</h1>
  <input class="search" id="search" type="search" placeholder="Buscar" value="${esc(V.search)}">
  <div class="month-nav">
    <button data-month="-1" aria-label="Mes anterior">‹</button>
    <strong>${monthLabel(V.month)}</strong>
    <button data-month="1" aria-label="Mes siguiente">›</button>
  </div>
  <div class="seg">${[['todo', 'Todo'], ['gasto', 'Gastos'], ['ingreso', 'Ingresos'], ['otros', 'Pagos y mov.']].map(([k, l]) => `<button data-filter="${k}" class="${V.filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  ${V.filter === 'ingreso' ? `<div class="muted small" style="margin:0 4px">Entró ${money(inc)} este mes</div>` : V.filter === 'gasto' ? `<div class="muted small" style="margin:0 4px">Salió ${money(exp)} este mes</div>` : ''}
  ${list.length ? Object.entries(groups).map(([d, ts]) => `<div class="day">${esc(dayLabel(d))}</div><div class="list">${ts.map(txLine).join('')}</div>`).join('') : '<div class="card empty">Nada por aquí</div>'}
  `;
}

function viewCuentas() {
  const b = balances();
  const savingsTotal = S.accounts.filter(a => a.type === 'ahorro').reduce((x, a) => x + (b[a.id] || 0), 0);
  return `
  <h1>Cuentas</h1>
  <div class="list">
    ${S.accounts.map(a => {
      const v = b[a.id] || 0;
      const isCredit = a.type === 'credito';
      const txt = isCredit ? (v < 0 ? `Debes ${money(-v)}` : v > 0 ? `A favor ${money(v)}` : 'Sin deuda') : money(v);
      let sub = ACC_TYPES[a.type];
      if (isCredit) {
        const due = cardInfo(a)?.due;
        sub = !isCardReady(a) ? 'Toca para poner línea y fechas' : due ? `Pagar ${money(due.amount)} ${due.overdue ? '· vencido' : 'hasta el ' + fmtShort(due.date)}` : 'Al día';
      }
      return `<button class="item" ${isCredit ? `data-card="${a.id}"` : `data-acc="${a.id}"`}><span class="ico">${ACC_ICON[a.type]}</span>
        <span class="main"><div class="title">${esc(a.name)}</div><div class="sub">${esc(sub)}</div></span>
        <span class="num ${(isCredit && v < 0) || v < 0 ? 'gasto' : ''}">${txt}</span></button>`;
    }).join('')}
  </div>
  <button class="linkbtn" data-act="new-acc" style="margin:8px 4px">+ Agregar cuenta</button>

  <h2>Deudas</h2>
  ${S.debts.length ? `<div class="list">${S.debts.map(d => {
      const rem = debtRemaining(d), pct = d.total ? Math.round(((d.total - rem) / d.total) * 100) : 0;
      return `<button class="item" data-debt="${d.id}"><span class="ico">🧾</span>
        <span class="main"><div class="title">${esc(d.name)}</div><div class="sub">${esc([d.due && rem ? (d.due < today() ? 'Venció el ' : 'Vence el ') + fmtShort(d.due) : '', d.note, pct ? `pagado ${pct}%` : ''].filter(Boolean).join(' · ') || 'Sin pagos aún')}</div><div class="bar"><i style="width:${pct}%"></i></div></span>
        <span class="num ${rem ? 'gasto' : 'ingreso'}">${rem ? money(rem) : 'Pagada'}</span></button>`;
    }).join('')}</div>` : '<div class="card empty small">Préstamos, cuotas o lo que le debas a alguien. La tarjeta de crédito se calcula sola arriba.</div>'}
  <button class="linkbtn" data-act="new-debt" style="margin:8px 4px">+ Agregar deuda</button>

  <h2>Ahorro</h2>
  <div class="card">
    <div class="muted small">Total en cuentas de ahorro</div>
    <div class="num" style="font-size:24px;font-weight:700">${money(savingsTotal)}</div>
    <div class="muted small" style="margin-top:6px">Para separar plata escribe «ahorré 200 de yape».</div>
  </div>
  `;
}

function viewAjustes() {
  const rules = Object.entries(S.rules);
  return `
  <h1>Ajustes</h1>
  <h2>General</h2>
  <div class="card">
    <label class="field"><span>Cuenta por defecto (si no dices cuál)</span>
      <select id="set-def">${S.accounts.map(a => `<option value="${a.id}" ${a.id === S.settings.defaultAccount ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
    <label class="field" style="margin:0"><span>Meta de ahorro (% de tus ingresos)</span>
      <input id="set-goal" type="number" inputmode="numeric" min="0" max="100" value="${S.settings.savingGoalPct}"></label>
  </div>

  <h2>Categorías</h2>
  <div class="list">${S.categories.map(c => `<button class="item" data-cat="${c.id}"><span class="ico">${c.icon}</span><span class="main"><div class="title">${esc(c.name)}</div><div class="sub">${c.kind === 'ingreso' ? 'Ingreso' : 'Gasto'}${c.words ? ' · ' + esc(c.words.split(/\s+/).slice(0, 6).join(', ')) + '…' : ''}</div></span></button>`).join('')}</div>
  <button class="linkbtn" data-act="new-cat" style="margin:8px 4px">+ Agregar categoría</button>

  <h2>Lo que aprendí (${rules.length})</h2>
  <div class="card small">
    ${rules.length ? rules.map(([w, c]) => `<div style="display:flex;justify-content:space-between;padding:6px 0"><span>«${esc(w)}» → ${esc(cat(c)?.name || '?')}</span><button class="linkbtn" data-unlearn="${esc(w)}">Olvidar</button></div>`).join('') : '<span class="muted">Cuando corrijas la categoría de un gasto, recordaré esas palabras para la próxima.</span>'}
  </div>

  <h2>Respaldo</h2>
  <div class="card">
    <p class="small muted" style="margin-top:0">Los datos se guardan solo en este dispositivo. Guarda el respaldo en iCloud Drive (Archivos) para no perderlos y para pasarlos al iPad.</p>
    <p class="small muted">Último respaldo: ${S.settings.lastBackup ? esc(dayLabel(S.settings.lastBackup)) : 'nunca'}</p>
    <div class="actions">
      <button class="btn primary" data-act="backup">Exportar</button>
      <label class="btn" style="text-align:center">Importar archivo<input type="file" id="import" accept="application/json,.json" hidden></label>
    </div>
    <button class="btn block" data-act="paste-backup" style="margin-top:8px">📋 Pegar respaldo como texto</button>
  </div>
  <button class="btn danger block" data-act="reset" style="margin-top:24px">Borrar todos los datos</button>
  <p class="small muted" style="text-align:center">${S.tx.length} movimientos guardados</p>
  `;
}

/* ============ Hoja inferior ============ */
function openSheet(html, onMount) {
  const sh = $('#sheet');
  sh.onclick = sh.oninput = sh.onchange = null;
  sh.innerHTML = '<div class="grab"></div><button class="sheet-x" aria-label="Cerrar">✕</button>' + html;
  sh.classList.remove('closing'); sh.style.transform = ''; sh.scrollTop = 0;
  sh.hidden = false; $('#backdrop').hidden = false; $('#toast').hidden = true;
  if (onMount) onMount(sh);
}
function closeSheet() { $('#sheet').hidden = true; $('#backdrop').hidden = true; $('#sheet').innerHTML = ''; }

function picker(title, opts, current, onPick) {
  openSheet(`<h3>${esc(title)}</h3>${opts.map(o => `<button class="opt ${o.value === current ? 'on' : ''}" data-v="${esc(o.value)}">${esc(o.label)}</button>`).join('')}`, sh => {
    sh.onclick = e => { const b = e.target.closest('[data-v]'); if (b) { closeSheet(); onPick(b.dataset.v); } };
  });
}

function editTx(id) {
  const t = S.tx.find(x => x.id === id);
  if (!t) return;
  let type = t.type;
  const draw = () => {
    const catOpts = S.categories.filter(c => c.kind === type).map(c => `<option value="${c.id}" ${c.id === t.categoryId ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('');
    const accOpts = sel => S.accounts.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
    openSheet(`<h3>Editar movimiento</h3>
      <div class="seg">${Object.entries(TYPES).map(([k, v]) => `<button data-type="${k}" class="${k === type ? 'on' : ''}">${v.label}</button>`).join('')}</div>
      <label class="field"><span>Monto (S/)</span><input id="e-amt" inputmode="decimal" value="${(t.amount / 100).toFixed(2)}"></label>
      <label class="field"><span>Descripción</span><input id="e-note" value="${esc(t.note)}"></label>
      ${type === 'gasto' || type === 'ingreso' ? `<label class="field"><span>Categoría</span><select id="e-cat">${catOpts}</select></label>` : ''}
      ${type === 'pago_deuda' ? `<label class="field"><span>Deuda</span><select id="e-debt">${S.debts.map(d => `<option value="${d.id}" ${d.id === t.debtId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>` : ''}
      <label class="field"><span>${type === 'transferencia' ? 'Desde' : 'Cuenta'}</span><select id="e-acc">${accOpts(t.accountId)}</select></label>
      ${type === 'transferencia' ? `<label class="field"><span>Hacia</span><select id="e-to">${accOpts(t.toAccountId)}</select></label>` : ''}
      ${type === 'gasto' && S.accounts.some(a => a.type === 'credito') ? `<div class="grid2">
        <label class="field"><span>Cuotas (solo tarjeta)</span><input id="e-cuotas" inputmode="numeric" value="${t.cuotas || 1}"></label>
        <label class="field"><span>TEA (%)</span><input id="e-tea" inputmode="decimal" value="${t.tea ?? ''}" placeholder="la de la tarjeta"></label></div>` : ''}
      <label class="field"><span>Fecha</span><input id="e-date" type="date" value="${t.date}"></label>
      <div class="actions"><button class="btn danger" id="e-del">Eliminar</button><button class="btn primary" id="e-save">Guardar</button></div>`, sh => {
      sh.onclick = e => {
        const tb = e.target.closest('[data-type]');
        if (tb) { type = tb.dataset.type; draw(); return; }
        if (e.target.id === 'e-del') {
          if (!confirm('¿Eliminar este movimiento?')) return;
          S.tx = S.tx.filter(x => x.id !== id); save(); closeSheet(); render();
        }
        if (e.target.id === 'e-save') {
          const amount = toCents($('#e-amt').value);
          if (!amount) return toast('Monto inválido');
          if (type === 'pago_deuda' && !$('#e-debt')?.value) return toast('No hay deudas registradas');
          const newCat = $('#e-cat')?.value;
          if (newCat && newCat !== t.categoryId && t.note) {
            parse(t.note)?.keys.forEach(k => { S.rules[k] = newCat; });
          }
          Object.assign(t, { type, amount, note: $('#e-note').value.trim(), accountId: $('#e-acc').value, date: $('#e-date').value || t.date });
          delete t.categoryId; delete t.toAccountId; delete t.debtId;
          if (newCat) t.categoryId = newCat;
          if (type === 'transferencia') t.toAccountId = $('#e-to').value;
          if (type === 'pago_deuda') t.debtId = $('#e-debt').value;
          const card = acc(t.accountId), n = parseInt($('#e-cuotas')?.value, 10) || 1;
          delete t.cuotas; delete t.tea;
          if (type === 'gasto' && card?.type === 'credito' && n > 1) {
            const tea = parseFloat(String($('#e-tea').value).replace(',', '.'));
            t.cuotas = Math.min(60, n); t.tea = isFinite(tea) ? tea : (card.tea || 0);
          }
          save(); closeSheet(); render();
        }
      };
    });
  };
  draw();
}

function editAccount(id) {
  const a = id ? acc(id) : { id: uid(), name: '', type: 'digital', initial: 0, aliases: '' };
  const isNew = !id;
  const f = {
    name: a.name, type: a.type, aliases: a.aliases, initial: a.initial || 0,
    limit: a.limit || 0, closeDay: a.closeDay || '', payDay: a.payDay || '', tea: a.tea ?? '',
    statement0: a.statement0 || 0, unbilled: a.unbilled || 0, plans: (a.plans || []).map(p => ({ ...p })),
  };
  const cents = v => (v ? (v / 100).toFixed(2) : '');
  const days = sel => '<option value="">—</option>' + Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${Number(sel) === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('');
  const read = () => {
    const sh = $('#sheet'), val = q => $(q, sh)?.value;
    f.name = val('#a-name') ?? f.name;
    f.aliases = val('#a-alias') ?? f.aliases;
    if ($('#a-init', sh)) f.initial = toCents(val('#a-init')) || 0;
    if ($('#a-limit', sh)) {
      f.limit = toCents(val('#a-limit')) || 0;
      f.closeDay = val('#a-close'); f.payDay = val('#a-pay'); f.tea = val('#a-tea');
      f.statement0 = toCents(val('#a-st0')) || 0; f.unbilled = toCents(val('#a-unb')) || 0;
      f.plans = $$('.plan-row', sh).map(r => ({ desc: $('.p-desc', r).value.trim(), cuota: toCents($('.p-cuota', r).value) || 0, remaining: Math.max(0, parseInt($('.p-rem', r).value, 10) || 0) }));
    }
  };
  const draw = () => {
    const credit = f.type === 'credito';
    const cardFields = `
      <label class="field"><span>Línea de crédito (S/)</span><input id="a-limit" inputmode="decimal" value="${cents(f.limit)}"></label>
      <div class="grid2">
        <label class="field"><span>Día de cierre (facturación)</span><select id="a-close">${days(f.closeDay)}</select></label>
        <label class="field"><span>Último día de pago</span><select id="a-pay">${days(f.payDay)}</select></label>
      </div>
      <label class="field"><span>TEA de compras en cuotas (%)</span><input id="a-tea" inputmode="decimal" value="${esc(f.tea)}" placeholder="Sale en tu estado de cuenta"></label>
      <h2 style="margin:20px 0 10px">Lo que debes hoy</h2>
      <label class="field"><span>Monto a pagar de tu último estado de cuenta (S/)</span><input id="a-st0" inputmode="decimal" value="${cents(f.statement0)}" placeholder="0.00"></label>
      <label class="field"><span>Compras en 1 cuota hechas después del último cierre (S/)</span><input id="a-unb" inputmode="decimal" value="${cents(f.unbilled)}" placeholder="0.00"></label>
      <div class="field"><span>Compras en cuotas que ya vienes pagando: la cuota y cuántas faltan después de este estado de cuenta</span>
        ${f.plans.map((p, i) => `<div class="plan-row" style="display:grid;grid-template-columns:1fr 84px 60px 24px;gap:6px;margin-bottom:6px;align-items:center">
          <input class="p-desc" placeholder="Qué fue" value="${esc(p.desc)}"><input class="p-cuota" inputmode="decimal" placeholder="Cuota" value="${cents(p.cuota)}"><input class="p-rem" inputmode="numeric" placeholder="Faltan" value="${p.remaining || ''}"><button class="linkbtn" data-rmplan="${i}" aria-label="Quitar">✕</button></div>`).join('')}
        <button class="linkbtn" id="a-addplan">+ Agregar compra en cuotas</button>
      </div>`;
    openSheet(`<h3>${isNew ? 'Nueva cuenta' : credit ? 'Configurar tarjeta' : 'Editar cuenta'}</h3>
      <label class="field"><span>Nombre</span><input id="a-name" value="${esc(f.name)}" placeholder="${credit ? 'Ej: CMR, Oh!, Visa BCP' : 'Ej: Plin, BBVA'}"></label>
      <label class="field"><span>Tipo</span><select id="a-type">${Object.entries(ACC_TYPES).map(([k, v]) => `<option value="${k}" ${k === f.type ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      ${credit ? cardFields : `<label class="field"><span>Saldo al empezar a usar la app (S/)</span><input id="a-init" inputmode="decimal" value="${(f.initial / 100).toFixed(2)}"></label>`}
      <label class="field"><span>Palabras que la identifican (separadas por coma)</span><input id="a-alias" value="${esc(f.aliases)}" placeholder="Ej: plin, bbva"></label>
      <div class="actions">${isNew ? '' : '<button class="btn danger" id="a-del">Eliminar</button>'}<button class="btn primary" id="a-save">Guardar</button></div>`, sh => {
      $('#a-type', sh).onchange = e => { read(); f.type = e.target.value; draw(); };
      sh.onclick = e => {
        if (e.target.id === 'a-addplan') { read(); f.plans.push({ desc: '', cuota: 0, remaining: 0 }); draw(); return; }
        if (e.target.dataset.rmplan) { read(); f.plans.splice(Number(e.target.dataset.rmplan), 1); draw(); return; }
        if (e.target.id === 'a-del') {
          if (S.tx.some(t => t.accountId === a.id || t.toAccountId === a.id)) return toast('Tiene movimientos: bórralos o muévelos primero');
          if (!confirm(`¿Eliminar ${a.name}?`)) return;
          S.accounts = S.accounts.filter(x => x.id !== a.id); save(); closeSheet(); render();
        }
        if (e.target.id === 'a-save') {
          read();
          const name = f.name.trim();
          if (!name) return toast('Ponle un nombre');
          Object.assign(a, { name, type: f.type, aliases: f.aliases });
          if (f.type === 'credito') {
            const plans = f.plans.filter(p => p.cuota && p.remaining);
            // La primera configuración es la foto de partida: lo registrado antes ya está en «lo que debes hoy».
            // Correcciones posteriores no la mueven, para no perder compras registradas después.
            if (!a.setupAt) a.setupAt = Date.now();
            const tea = parseFloat(String(f.tea).replace(',', '.'));
            Object.assign(a, { limit: f.limit, closeDay: Number(f.closeDay) || null, payDay: Number(f.payDay) || null, tea: isFinite(tea) ? tea : 0, statement0: f.statement0, unbilled: f.unbilled, plans });
            a.initial = -(f.statement0 + f.unbilled + plans.reduce((x, p) => x + p.cuota * p.remaining, 0));
          } else {
            a.initial = f.initial;
            ['limit', 'closeDay', 'payDay', 'tea', 'statement0', 'unbilled', 'plans', 'setupAt'].forEach(k => delete a[k]);
          }
          if (isNew) S.accounts.push(a);
          save(); closeSheet(); render();
          if (f.type === 'credito' && isCardReady(a)) cardSheet(a.id);
        }
      };
    });
  };
  draw();
}

/* ============ Ficha de la tarjeta, pago y simulador ============ */
function cardSheet(id) {
  const c = acc(id), info = cardInfo(c);
  if (!info) { editAccount(id); toast('Pon la línea, el día de cierre y el día de pago'); return; }
  const debtNow = Math.max(0, -(balances()[c.id] || 0));
  const avail = (c.limit || 0) - debtNow;
  const { due, next } = info;
  const box = 'class="card" style="background:var(--bg);box-shadow:none;margin-top:10px"';
  openSheet(`<h3>💳 ${esc(c.name)}</h3>
    <div class="grid2">
      <div class="stat"><div class="label">Debes en total</div><div class="value num ${debtNow ? 'gasto' : ''}">${money(debtNow)}</div></div>
      <div class="stat"><div class="label">Línea disponible</div><div class="value num">${c.limit ? money(avail) : '—'}</div></div>
    </div>
    ${c.limit ? `<div class="bar ${avail < c.limit * 0.2 ? 'warn' : ''}"><i style="width:${Math.min(100, (debtNow / c.limit) * 100)}%"></i></div>
      <div class="muted small" style="margin-top:4px">Usas el ${Math.round((debtNow / c.limit) * 100)}% de tu línea de ${money(c.limit)}</div>` : ''}
    <div ${box}>
      <div class="muted small">${due ? (due.overdue ? `Pago vencido desde el ${fmtShort(due.date)}` : `Pagar hasta el ${fmtShort(due.date)}`) : 'Estado de cuenta actual'}</div>
      <div class="num ${due?.overdue ? 'gasto' : ''}" style="font-size:24px;font-weight:700">${due ? money(due.amount) : 'Al día ✓'}</div>
    </div>
    <div ${box}>
      <div class="muted small">Próximo estado de cuenta · cierra el ${fmtShort(next.close)}, se paga hasta el ${fmtShort(next.due)}</div>
      <div class="num" style="font-size:20px;font-weight:700">${money(next.left)}</div>
      <div class="muted small">Sube con lo que compres antes del cierre.</div>
    </div>
    ${info.credit ? `<p class="small ingreso">Tienes ${money(info.credit)} pagados por adelantado.</p>` : ''}
    <h2>Cuotas vigentes</h2>
    ${info.plans.length ? `<div class="list">${info.plans.map(p => `<div class="item"><span class="ico">📆</span>
      <span class="main"><div class="title">${esc(p.label)}</div><div class="sub">Faltan ${p.left}${p.of ? ' de ' + p.of : ''} · última el ${fmtShort(dueFor(c, p.end))}</div></span>
      <span class="num">${money(p.cuota)}</span></div>`).join('')}</div>` : '<div class="muted small">No tienes compras en cuotas.</div>'}
    <div class="actions" style="margin-top:16px"><button class="btn" id="k-edit">Configurar</button><button class="btn" id="k-sim">Simular cuotas</button></div>
    <button class="btn primary block" id="k-pay" style="margin-top:8px">Registrar pago</button>`, sh => {
    sh.onclick = e => {
      if (e.target.id === 'k-edit') editAccount(id);
      if (e.target.id === 'k-sim') simulate(id);
      if (e.target.id === 'k-pay') payCard(id, due?.amount);
    };
  });
}

function payCard(id, suggested) {
  const c = acc(id);
  openSheet(`<h3>Pagar ${esc(c.name)}</h3>
    <label class="field"><span>Monto (S/)</span><input id="k-amt" inputmode="decimal" value="${suggested ? (suggested / 100).toFixed(2) : ''}" placeholder="0.00"></label>
    <label class="field"><span>Desde</span><select id="k-from">${S.accounts.filter(a => a.type !== 'credito').map(a => `<option value="${a.id}" ${a.id === S.settings.defaultAccount ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
    <button class="btn primary block" id="k-save">Registrar pago</button>`, sh => {
    sh.onclick = e => {
      if (e.target.id !== 'k-save') return;
      const amount = toCents($('#k-amt').value);
      if (!amount) return toast('Pon el monto');
      S.tx.push({ id: uid(), type: 'transferencia', amount, accountId: $('#k-from').value, toAccountId: id, date: today(), note: '', created: Date.now() });
      save(); render(); cardSheet(id);
      toast(`Pago de ${money(amount)} a ${c.name} registrado`);
    };
  });
}

function simulate(id) {
  const c = acc(id), info = cardInfo(c);
  const st = { amount: '', n: 12, tea: c.tea || 0, free: false };
  const incomes = [1, 2, 3].map(k => summary(shiftMonth(monthKey(today()), -k)).inc).filter(v => v > 0);
  const avgIncome = incomes.length ? incomes.reduce((x, y) => x + y, 0) / incomes.length : 0;
  const results = () => {
    const P = toCents(st.amount);
    if (!P) return '<p class="muted small">Pon el precio para ver las cuotas.</p>';
    const n = Math.max(1, Math.min(60, parseInt(st.n, 10) || 1));
    const tea = st.free ? 0 : parseFloat(String(st.tea).replace(',', '.')) || 0;
    const rows = cuotaSchedule(P, n, tea), total = rows.reduce((x, r) => x + r.amount, 0);
    const c0 = closeFor(c, today()), debtNow = Math.max(0, -(balances()[c.id] || 0));
    const bill = cl => info.statements.find(s => s.close === cl)?.left || 0;
    const proj = rows.slice(0, 12).map((r, k) => { const cl = closeAdd(c, c0, k), before = bill(cl); return { due: dueFor(c, cl), before, after: before + r.amount }; });
    const pct = avgIncome ? Math.round((rows[0].amount / avgIncome) * 100) : null;
    return `
      <div class="grid2" style="margin-top:4px">
        <div class="stat"><div class="label">Cuota mensual</div><div class="value num">${money(rows[0].amount)}</div></div>
        <div class="stat"><div class="label">Total a pagar</div><div class="value num">${money(total)}</div></div>
      </div>
      <p class="small ${total > P ? 'gasto' : 'ingreso'}">${total > P ? `Pagarías ${money(total - P)} de intereses: ${Math.round(((total - P) / P) * 100)}% más que al contado.` : 'Sin intereses: pagas lo mismo que al contado.'}</p>
      <p class="small muted">La primera cuota llega en el estado de cuenta que cierra el ${fmtShort(c0)} y la pagas hasta el ${fmtShort(dueFor(c, c0))}. Terminas de pagar el ${fmtShort(dueFor(c, closeAdd(c, c0, n - 1)))}.</p>
      ${c.limit ? `<p class="small ${debtNow + P > c.limit ? 'gasto' : 'muted'}">${debtNow + P > c.limit ? `No te alcanza la línea: tienes ${money(c.limit - debtNow)} disponibles.` : `Tu línea disponible bajaría de ${money(c.limit - debtNow)} a ${money(c.limit - debtNow - P)}.`}</p>` : ''}
      ${pct !== null ? `<p class="small ${pct >= 20 ? 'gasto' : 'muted'}">La cuota es el ${pct}% de lo que te entra al mes (promedio de los últimos meses).</p>` : ''}
      <h2 style="margin:16px 0 6px">Lo que pagarías cada mes</h2>
      <div class="small">
        <div class="muted" style="display:grid;grid-template-columns:1fr auto auto;gap:12px;padding-bottom:4px"><span>Pagas hasta</span><span>Sin esta compra</span><span>Con esta compra</span></div>
        ${proj.map(p => `<div style="display:grid;grid-template-columns:1fr auto auto;gap:12px;padding:6px 0;border-top:1px solid var(--line)"><span>${fmtShort(p.due)}</span><span class="num muted">${money(p.before)}</span><span class="num"><b>${money(p.after)}</b></span></div>`).join('')}
        ${n > 12 ? `<div class="muted" style="padding-top:6px">…y ${n - 12} cuotas más.</div>` : ''}
      </div>
      <p class="small muted">Es un cálculo aproximado con cuota fija. El banco puede sumar seguro de desgravamen y ajustar la primera cuota por los días.</p>`;
  };
  openSheet(`<h3>Simular compra en cuotas · ${esc(c.name)}</h3>
    <label class="field"><span>Precio (S/)</span><input id="s-amt" inputmode="decimal" placeholder="0.00"></label>
    <div class="field"><span>Cuotas</span><div class="chips" id="s-chips">${[1, 3, 6, 12, 18, 24, 36].map(k => `<button class="chip ${k === st.n ? 'on' : ''}" data-n="${k}">${k}</button>`).join('')}
      <input id="s-n" inputmode="numeric" value="${st.n}" style="width:64px;padding:6px 10px"></div></div>
    <div class="grid2" style="align-items:end">
      <label class="field"><span>TEA (%)</span><input id="s-tea" inputmode="decimal" value="${st.tea}"></label>
      <div class="field"><button class="chip" id="s-free" style="width:100%;justify-content:center;padding:12px">Sin intereses</button></div>
    </div>
    <div id="s-res">${results()}</div>
    <h2>Si decides comprarlo</h2>
    <label class="field"><span>Qué es</span><input id="s-note" placeholder="Ej: Laptop"></label>
    <label class="field"><span>Categoría</span><select id="s-cat">${S.categories.filter(x => x.kind === 'gasto').map(x => `<option value="${x.id}" ${x.id === 'ropa' ? 'selected' : ''}>${x.icon} ${esc(x.name)}</option>`).join('')}</select></label>
    <button class="btn primary block" id="s-save">Registrar esta compra</button>`, sh => {
    const refresh = () => {
      $('#s-res').innerHTML = results();
      $$('#s-chips [data-n]').forEach(b => b.classList.toggle('on', Number(b.dataset.n) === Number(st.n)));
      $('#s-free').classList.toggle('on', st.free);
      $('#s-tea').disabled = st.free;
    };
    sh.oninput = e => {
      if (e.target.id === 's-amt') st.amount = e.target.value;
      if (e.target.id === 's-n') st.n = e.target.value;
      if (e.target.id === 's-tea') st.tea = e.target.value;
      if (['s-amt', 's-n', 's-tea'].includes(e.target.id)) refresh();
    };
    sh.onclick = e => {
      const nb = e.target.closest('[data-n]');
      if (nb) { st.n = Number(nb.dataset.n); $('#s-n').value = st.n; refresh(); return; }
      if (e.target.id === 's-free') { st.free = !st.free; refresh(); return; }
      if (e.target.id === 's-save') {
        const amount = toCents(st.amount), n = Math.max(1, Math.min(60, parseInt(st.n, 10) || 1));
        if (!amount) return toast('Pon el precio');
        const t = { id: uid(), type: 'gasto', amount, date: today(), note: $('#s-note').value.trim(), accountId: id, categoryId: $('#s-cat').value, created: Date.now() };
        if (n > 1) { t.cuotas = n; t.tea = st.free ? 0 : parseFloat(String(st.tea).replace(',', '.')) || 0; }
        S.tx.push(t); save(); render(); cardSheet(id);
        toast(`Compra registrada en ${n === 1 ? '1 cuota' : n + ' cuotas'}`);
      }
    };
  });
}

function editDebt(id) {
  const d = id ? debt(id) : { id: uid(), name: '', total: 0, paidBefore: 0 };
  const isNew = !id;
  openSheet(`<h3>${isNew ? 'Nueva deuda' : esc(d.name)}</h3>
    ${isNew ? '' : `<p class="muted small" style="margin-top:-6px">Falta pagar ${money(debtRemaining(d))}</p>
    <div class="card" style="background:var(--bg);box-shadow:none;margin-bottom:14px">
      <label class="field"><span>Registrar un pago (S/)</span><input id="p-amt" inputmode="decimal" placeholder="0.00"></label>
      <label class="field"><span>Desde</span><select id="p-acc">${S.accounts.filter(a => a.type !== 'credito').map(a => `<option value="${a.id}" ${a.id === S.settings.defaultAccount ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      <button class="btn primary block" id="p-save">Registrar pago</button>
    </div>`}
    <label class="field"><span>A quién o qué (ej: Préstamo Tío, Cuotas laptop)</span><input id="d-name" value="${esc(d.name)}"></label>
    <label class="field"><span>Monto total de la deuda (S/)</span><input id="d-total" inputmode="decimal" value="${d.total ? (d.total / 100).toFixed(2) : ''}"></label>
    <label class="field"><span>Ya pagado antes de usar la app (S/)</span><input id="d-paid" inputmode="decimal" value="${d.paidBefore ? (d.paidBefore / 100).toFixed(2) : ''}"></label>
    <label class="field"><span>Fecha en que vence (opcional)</span><input id="d-due" type="date" value="${d.due || ''}"></label>
    <label class="field"><span>Nota (opcional)</span><input id="d-note" value="${esc(d.note || '')}" placeholder="Ej: se cobra solo de Yape"></label>
    <div class="actions">${isNew ? '' : '<button class="btn danger" id="d-del">Eliminar</button>'}<button class="btn" id="d-save">Guardar</button></div>`, sh => {
    sh.onclick = e => {
      if (e.target.id === 'p-save') {
        const amount = toCents($('#p-amt').value);
        if (!amount) return toast('Pon el monto del pago');
        S.tx.push({ id: uid(), type: 'pago_deuda', amount, debtId: d.id, accountId: $('#p-acc').value, date: today(), note: '', created: Date.now() });
        save(); closeSheet(); render(); toast(`Pago de ${money(amount)} registrado`);
      }
      if (e.target.id === 'd-del') {
        if (S.tx.some(t => t.debtId === d.id)) return toast('Tiene pagos registrados: bórralos primero');
        if (!confirm(`¿Eliminar ${d.name}?`)) return;
        S.debts = S.debts.filter(x => x.id !== d.id); save(); closeSheet(); render();
      }
      if (e.target.id === 'd-save') {
        const name = $('#d-name').value.trim(), total = toCents($('#d-total').value);
        if (!name || !total) return toast('Falta nombre o monto');
        Object.assign(d, { name, total, paidBefore: toCents($('#d-paid').value) || 0, due: $('#d-due').value || null, note: $('#d-note').value.trim() });
        if (isNew) S.debts.push(d);
        save(); closeSheet(); render();
      }
    };
  });
}

function editCategory(id) {
  const c = id ? cat(id) : { id: uid(), name: '', icon: '🏷️', kind: 'gasto', words: '' };
  const isNew = !id;
  openSheet(`<h3>${isNew ? 'Nueva categoría' : 'Editar categoría'}</h3>
    <div style="display:grid;grid-template-columns:72px 1fr;gap:8px">
      <label class="field"><span>Ícono</span><input id="c-icon" value="${esc(c.icon)}" style="text-align:center"></label>
      <label class="field"><span>Nombre</span><input id="c-name" value="${esc(c.name)}"></label>
    </div>
    <label class="field"><span>Tipo</span><select id="c-kind"><option value="gasto" ${c.kind === 'gasto' ? 'selected' : ''}>Gasto</option><option value="ingreso" ${c.kind === 'ingreso' ? 'selected' : ''}>Ingreso</option></select></label>
    <label class="field"><span>Palabras que la activan (separadas por espacio)</span><textarea id="c-words" rows="3">${esc(c.words)}</textarea></label>
    <div class="actions">${isNew ? '' : '<button class="btn danger" id="c-del">Eliminar</button>'}<button class="btn primary" id="c-save">Guardar</button></div>`, sh => {
    sh.onclick = e => {
      if (e.target.id === 'c-del') {
        if (['otros', 'otros_ing'].includes(c.id)) return toast('Esta categoría es la de respaldo, no se puede borrar');
        const fallback = c.kind === 'ingreso' ? 'otros_ing' : 'otros';
        const n = S.tx.filter(t => t.categoryId === c.id).length;
        if (!confirm(`¿Eliminar ${c.name}?${n ? ` Sus ${n} movimientos pasan a «${cat(fallback).name}».` : ''}`)) return;
        S.tx.forEach(t => { if (t.categoryId === c.id) t.categoryId = fallback; });
        Object.keys(S.rules).forEach(k => { if (S.rules[k] === c.id) delete S.rules[k]; });
        S.categories = S.categories.filter(x => x.id !== c.id); save(); closeSheet(); render();
      }
      if (e.target.id === 'c-save') {
        const name = $('#c-name').value.trim();
        if (!name) return toast('Ponle un nombre');
        Object.assign(c, { name, icon: $('#c-icon').value.trim() || '🏷️', kind: $('#c-kind').value, words: norm($('#c-words').value).replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim() });
        if (isNew) S.categories.push(c);
        save(); closeSheet(); render();
      }
    };
  });
}

/* ============ Respaldo ============ */
async function exportData() {
  const name = `finanzas-${today()}.json`;
  const file = new File([JSON.stringify(S, null, 2)], name, { type: 'application/json' });
  const done = () => { S.settings.lastBackup = today(); save(); render(); };
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); done(); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  done();
}

const looksLikeBackup = t => /^\s*\{/.test(t) && /"accounts"\s*:/.test(t) && /"tx"\s*:/.test(t);

function importText(text) {
  try {
    const data = JSON.parse(String(text).trim());
    if (!Array.isArray(data.tx) || !Array.isArray(data.accounts)) throw new Error('No parece un respaldo de esta app');
    if (!confirm(`Esto reemplaza lo que hay ahora (${S.tx.length} movimientos) por el respaldo (${data.accounts.length} cuentas, ${(data.debts || []).length} deudas, ${data.tx.length} movimientos). ¿Seguir?`)) return false;
    S = { ...defaults(), ...data, settings: { ...defaults().settings, ...data.settings } };
    save(); closeSheet(); V.tab = 'inicio'; V.text = ''; V.over = {}; render(); toast('Datos importados');
    return true;
  } catch (e) { toast('No se pudo importar: ' + e.message); return false; }
}

async function importData(file) {
  try { importText(await file.text()); }
  catch (e) { toast('No se pudo leer el archivo: ' + e.message); }
}

function pasteBackupSheet() {
  openSheet(`<h3>Pegar respaldo</h3>
    <p class="small muted" style="margin-top:-6px">Pega aquí el texto del respaldo (empieza con <code>{</code>).</p>
    <label class="field"><textarea id="bk-text" rows="8" autocorrect="off" autocapitalize="off" spellcheck="false" style="font:13px ui-monospace,Menlo,monospace"></textarea></label>
    <button class="btn primary block" id="bk-go">Importar</button>`, sh => {
    navigator.clipboard?.readText?.().then(t => { if (looksLikeBackup(t) && !$('#bk-text').value) $('#bk-text').value = t; }).catch(() => {});
    sh.onclick = e => { if (e.target.id === 'bk-go') importText($('#bk-text').value); };
  });
}

/* ============ Toast ============ */
let toastTimer;
function toast(msg, actionLabel, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button>${esc(actionLabel)}</button>` : ''}`;
  t.hidden = false;
  if (actionLabel) $('button', t).onclick = () => { t.hidden = true; action(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, actionLabel ? 5000 : 2800);
}

/* ============ Eventos globales ============ */
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  V.tab = b.dataset.tab; render(); window.scrollTo(0, 0);
});
$('#backdrop').addEventListener('click', closeSheet);
$('#sheet').addEventListener('click', e => { if (e.target.closest('.sheet-x')) closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

// Deslizar la hoja hacia abajo para cerrarla (como en iOS)
(() => {
  const sh = $('#sheet');
  let y0 = null, dy = 0;
  sh.addEventListener('touchstart', e => {
    if (sh.scrollTop > 0 || e.target.closest('input, select, textarea')) { y0 = null; return; }
    y0 = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  sh.addEventListener('touchmove', e => {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 0) { sh.classList.add('dragging'); sh.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  sh.addEventListener('touchend', () => {
    if (y0 === null) return;
    sh.classList.remove('dragging');
    if (dy > 90) closeSheet(); else sh.style.transform = '';
    y0 = null; dy = 0;
  });
})();

$('#app').addEventListener('click', e => {
  const t = e.target.closest('[data-edit],[data-acc],[data-card],[data-debt],[data-cat],[data-month],[data-act],[data-unlearn],[data-filter]');
  if (!t) return;
  const ds = t.dataset;
  if (ds.edit) editTx(ds.edit);
  else if (ds.card) cardSheet(ds.card);
  else if (ds.filter) { V.filter = ds.filter; render(); }
  else if (ds.acc) editAccount(ds.acc);
  else if (ds.debt) editDebt(ds.debt);
  else if (ds.cat) editCategory(ds.cat);
  else if (ds.month) { V.month = shiftMonth(V.month, Number(ds.month)); render(); }
  else if (ds.unlearn) { delete S.rules[ds.unlearn]; save(); render(); }
  else if (ds.act === 'new-acc') editAccount();
  else if (ds.act === 'new-debt') editDebt();
  else if (ds.act === 'new-cat') editCategory();
  else if (ds.act === 'backup') exportData();
  else if (ds.act === 'paste-backup') pasteBackupSheet();
  else if (ds.act === 'reset') {
    if (confirm('¿Borrar TODOS los movimientos, cuentas y deudas? Haz un respaldo antes.') && confirm('¿Seguro? No se puede deshacer.')) {
      S = defaults(); save(); render();
    }
  }
});
$('#app').addEventListener('input', e => {
  if (e.target.id === 'search') {
    V.search = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const s = $('#search'); s.focus(); s.setSelectionRange(pos, pos);
  }
});
$('#app').addEventListener('change', e => {
  if (e.target.id === 'set-def') { S.settings.defaultAccount = e.target.value; save(); }
  if (e.target.id === 'set-goal') { S.settings.savingGoalPct = Math.max(1, Math.min(100, Number(e.target.value) || 20)); save(); }
  if (e.target.id === 'import' && e.target.files[0]) importData(e.target.files[0]);
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Para pruebas desde la consola
window.__finanzas = { parse, toCents, cuotaSchedule, cardInfo };

render();
