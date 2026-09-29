'use strict';

/* ============ Gráficos ============
   SVG dibujado a mano, sin librerías, para que la app funcione sin internet.
   Se carga antes que app.js: aquí solo se definen funciones; los datos (S, V, allTx…)
   se leen de app.js cuando el usuario abre la pestaña. */

const NF0 = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
const axisFmt = c => { const s = c / 100; return Math.abs(s) >= 10000 ? NF0.format(s / 1000) + ' mil' : NF0.format(s); };
const monthShort = mk => { const [y, m] = mk.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('es-PE', { month: 'short' }).replace('.', ''); };
const monthName = mk => { const t = monthLabel(mk).split(' de ')[0]; return t[0].toUpperCase() + t.slice(1); };
const daysIn = mk => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };

// Escala con marcas redondas (0, 500, 1,000…) que siempre incluye el cero
function niceScale(lo, hi, n = 4) {
  lo = Math.min(0, lo); hi = Math.max(0, hi);
  if (hi - lo <= 0) hi = lo + 10000;
  const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => s >= raw);
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = a; v <= b + step / 1000; v += step) ticks.push(Math.round(v));
  return { lo: a, hi: b, ticks };
}

function legendHTML(series, kind) {
  if (series.length < 2) return '';
  return `<div class="legend">${series.map(s => `<span><i class="key ${kind === 'line' ? 'line' : ''} k-${s.cls}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}

function tableHTML(spec) {
  const head = [spec.xTitle || '', ...spec.series.map(s => s.name)];
  const rows = spec.labels.map((l, i) => [spec.xFmt(l, i), ...spec.series.map(s => (s.values[i] == null ? '—' : money(s.values[i])))]);
  return `<details class="tbl"><summary>Ver como tabla</summary><table>
    <thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;
}

// Tooltip: el valor manda, el nombre acompaña. Se arma con textContent (los nombres son datos del usuario).
function fillTip(tip, title, rows) {
  tip.textContent = '';
  const t = document.createElement('div'); t.className = 't'; t.textContent = title; tip.appendChild(t);
  for (const r of rows) {
    const row = document.createElement('div'); row.className = 'r';
    if (r.cls) { const k = document.createElement('i'); k.className = 'k-' + r.cls; row.appendChild(k); }
    const b = document.createElement('b'); b.textContent = r.value; row.appendChild(b);
    const s = document.createElement('span'); s.textContent = r.name; row.appendChild(s);
    tip.appendChild(row);
  }
}

function placeTip(wrap, tip, x) {
  tip.hidden = false;
  const w = tip.offsetWidth, W = wrap.clientWidth;
  tip.style.left = Math.max(0, Math.min(W - w, x - w / 2)) + 'px';
}

// Interacción común: puntero (mouse o dedo) y flechas del teclado eligen un índice
function bindScrub(svg, n, indexAt, show, hide) {
  let cur = -1;
  const go = i => { cur = Math.max(0, Math.min(n - 1, i)); show(cur); };
  svg.addEventListener('pointerdown', e => go(indexAt(e)));
  svg.addEventListener('pointermove', e => go(indexAt(e)));
  svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hide(); cur = -1; } });
  svg.addEventListener('focus', () => go(cur < 0 ? n - 1 : cur));
  svg.addEventListener('blur', () => { hide(); cur = -1; });
  svg.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1); }
    if (e.key === 'Escape') { hide(); cur = -1; }
  });
}

const svgX = (svg, e) => { const r = svg.getBoundingClientRect(); return (e.clientX - r.left) * (svg.viewBox.baseVal.width / r.width); };

/* ---------- Líneas (con cursor que busca el día) ---------- */
function drawLine(wrap, spec) {
  const W = Math.max(280, wrap.clientWidth), H = 196, L = 46, R = 16, T = 18, B = 24;
  const pw = W - L - R, ph = H - T - B, n = spec.labels.length;
  const vals = spec.series.flatMap(s => s.values.filter(v => v != null));
  const sc = niceScale(Math.min(...vals), Math.max(...vals));
  const x = i => L + (n === 1 ? pw / 2 : (i * pw) / (n - 1));
  const y = v => T + ph - ((v - sc.lo) / (sc.hi - sc.lo)) * ph;
  const xIdx = [...new Set([0, Math.round((n - 1) / 2), n - 1])];

  let g = sc.ticks.map(t => `<line class="g${t === 0 ? ' base' : ''}" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/>
    <text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${axisFmt(t)}</text>`).join('');
  g += xIdx.map((i, k) => `<text x="${x(i)}" y="${H - 6}" text-anchor="${k === 0 && xIdx.length > 1 ? 'start' : k === xIdx.length - 1 && xIdx.length > 1 ? 'end' : 'middle'}">${esc(spec.xFmt(spec.labels[i], i))}</text>`).join('');

  const order = spec.drawOrder || spec.series.map((_, i) => i);
  const ends = [];
  for (const si of order) {
    const s = spec.series[si];
    let d = '', open = false;
    s.values.forEach((v, i) => { if (v == null) { open = false; return; } d += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; open = true; });
    if (spec.area && spec.series.length === 1) {
      const idx = s.values.map((v, i) => (v == null ? -1 : i)).filter(i => i >= 0);
      g += `<path class="f-${s.cls}" fill-opacity=".1" d="${d}L${x(idx[idx.length - 1])},${y(0)}L${x(idx[0])},${y(0)}Z"/>`;
    }
    g += `<path class="ln s-${s.cls}" d="${d}"/>`;
    let last = -1; s.values.forEach((v, i) => { if (v != null) last = i; });
    if (last >= 0) { g += `<circle class="dot f-${s.cls}" cx="${x(last)}" cy="${y(s.values[last])}" r="4"/>`; ends.push({ s, i: last, y: y(s.values[last]) }); }
  }
  // Etiqueta al final de cada línea, solo si no chocan entre sí
  const clash = ends.some((a, i) => ends.some((b, j) => i < j && Math.abs(a.y - b.y) < 16));
  if (!clash && spec.endLabels !== false) {
    g += ends.map(e => `<text class="lbl" x="${x(e.i) - 6}" y="${e.y - 9}" text-anchor="end">${esc(money(e.s.values[e.i]).replace(/\.\d\d$/, ''))}</text>`).join('');
  }
  g += `<line class="xh" x1="0" x2="0" y1="${T}" y2="${T + ph}" visibility="hidden"/>`;
  g += spec.series.map((s, k) => `<circle class="hd dot f-${s.cls}" data-k="${k}" r="4" visibility="hidden"/>`).join('');

  wrap.innerHTML = `${legendHTML(spec.series, 'line')}
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" tabindex="0" role="img" aria-label="${esc(spec.aria)}">${g}
      <rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/></svg>
    <div class="tip" hidden></div>${tableHTML(spec)}`;
  const svg = wrap.querySelector('svg'), tip = wrap.querySelector('.tip');
  const xh = svg.querySelector('.xh'), hd = [...svg.querySelectorAll('.hd')];
  bindScrub(svg, n, e => Math.round(((svgX(svg, e) - L) / pw) * (n - 1)), i => {
    xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('visibility', 'visible');
    hd.forEach((c, k) => {
      const v = spec.series[k].values[i];
      if (v == null) { c.setAttribute('visibility', 'hidden'); return; }
      c.setAttribute('cx', x(i)); c.setAttribute('cy', y(v)); c.setAttribute('visibility', 'visible');
    });
    fillTip(tip, spec.tipTitle(spec.labels[i], i), spec.series.filter(s => s.values[i] != null).map(s => ({ cls: s.cls, value: money(s.values[i]), name: s.name })).concat(spec.tipExtra ? spec.tipExtra(i) : []));
    placeTip(wrap, tip, (x(i) / W) * wrap.clientWidth);
  }, () => { tip.hidden = true; xh.setAttribute('visibility', 'hidden'); hd.forEach(c => c.setAttribute('visibility', 'hidden')); });
}

/* ---------- Columnas (agrupadas si hay más de una serie) ---------- */
function drawCols(wrap, spec) {
  const W = Math.max(280, wrap.clientWidth), H = 196, L = 46, R = 8, T = 20, B = 24;
  const pw = W - L - R, ph = H - T - B, n = spec.labels.length, k = spec.series.length;
  const sc = niceScale(0, Math.max(...spec.series.flatMap(s => s.values)));
  const y = v => T + ph - ((v - sc.lo) / (sc.hi - sc.lo)) * ph;
  const band = pw / n, gap = 2;
  const barW = Math.min(24, (band * 0.72 - gap * (k - 1)) / k), groupW = barW * k + gap * (k - 1);
  const bar = (x0, w, v) => {
    const y0 = y(v), h = y(0) - y0; if (h <= 0.5) return '';
    const r = Math.min(4, w / 2, h);
    return `M${x0},${y0 + h}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + w - r}Q${x0 + w},${y0} ${x0 + w},${y0 + r}V${y0 + h}Z`;
  };
  const every = n > 7 ? 2 : 1;
  let g = sc.ticks.map(t => `<line class="g${t === 0 ? ' base' : ''}" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/>
    <text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${axisFmt(t)}</text>`).join('');
  for (let i = 0; i < n; i++) {
    const gx = L + band * i + (band - groupW) / 2;
    g += `<g class="grp" data-i="${i}">${spec.series.map((s, j) => `<path class="f-${s.cls}" d="${bar(gx + j * (barW + gap), barW, s.values[i])}"/>`).join('')}`;
    if (k === 1 && spec.capLabels && spec.series[0].values[i] > 0) {
      g += `<text class="lbl" x="${gx + barW / 2}" y="${y(spec.series[0].values[i]) - 6}" text-anchor="middle">${esc(axisFmt(spec.series[0].values[i]))}</text>`;
    }
    g += '</g>';
    if (i % every === 0 || i === n - 1) g += `<text x="${L + band * i + band / 2}" y="${H - 6}" text-anchor="middle">${esc(spec.xFmt(spec.labels[i], i))}</text>`;
  }
  wrap.innerHTML = `${legendHTML(spec.series, 'bar')}
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" tabindex="0" role="img" aria-label="${esc(spec.aria)}">${g}
      <rect x="${L}" y="${T}" width="${pw}" height="${ph + B}" fill="transparent"/></svg>
    <div class="tip" hidden></div>${tableHTML(spec)}`;
  const svg = wrap.querySelector('svg'), tip = wrap.querySelector('.tip'), grps = [...svg.querySelectorAll('.grp')];
  bindScrub(svg, n, e => Math.floor((svgX(svg, e) - L) / band), i => {
    grps.forEach((el, j) => el.classList.toggle('dim', j !== i));
    fillTip(tip, spec.tipTitle(spec.labels[i], i), spec.series.map(s => ({ cls: s.cls, value: money(s.values[i]), name: s.name })).concat(spec.tipExtra ? spec.tipExtra(i) : []));
    placeTip(wrap, tip, ((L + band * i + band / 2) / W) * wrap.clientWidth);
  }, () => { tip.hidden = true; grps.forEach(el => el.classList.remove('dim')); });
}

/* ---------- Datos ---------- */
function dataStart() {
  const dates = S.tx.map(t => t.date);
  S.accounts.forEach(a => { if (a.setupAt) dates.push(isoDate(new Date(a.setupAt))); });
  dates.push(today());
  return dates.sort()[0];
}

// Lo que tienes y lo que debes al cierre de un día
function positionAt(d, all) {
  const b = balances(d, all);
  let tienes = 0, debes = 0;
  S.accounts.forEach(a => { const v = b[a.id] || 0; if (a.type === 'credito') debes += Math.max(0, -v); else tienes += v; });
  S.debts.forEach(x => { debes += debtRemaining(x, d); });
  return { tienes, debes };
}

function cumulativeSpend(mk, all) {
  const arr = Array(daysIn(mk)).fill(0);
  all.forEach(t => { if (t.type === 'gasto' && t.date.startsWith(mk)) arr[Number(t.date.slice(8)) - 1] += t.amount; });
  for (let i = 1; i < arr.length; i++) arr[i] += arr[i - 1];
  return arr;
}

function upcomingPayments() {
  const mk0 = monthKey(today());
  const months = Array.from({ length: 6 }, (_, k) => shiftMonth(mk0, k));
  const bins = Object.fromEntries(months.map(m => [m, {}]));
  let later = 0;
  const undated = [];
  const put = (iso, name, amt) => {
    const m = monthKey(iso) < mk0 ? mk0 : monthKey(iso); // lo vencido se cuenta en este mes
    if (bins[m]) bins[m][name] = (bins[m][name] || 0) + amt; else later += amt;
  };
  S.accounts.filter(isCardReady).forEach(c => cardInfo(c).statements.forEach(s => { if (s.left > 0) put(s.due, c.name, s.left); }));
  S.debts.forEach(d => { const r = debtRemaining(d); if (!r) return; if (d.due) put(d.due, d.name, r); else undated.push({ name: d.name, amt: r }); });
  return { months, bins, later, undated };
}

/* ---------- Vista ---------- */
let CHARTS = {};

function viewGraficos() {
  const all = allTx();
  const t0 = today(), mk = monthKey(t0), pk = shiftMonth(mk, -1), day = Number(t0.slice(8));
  const R = V.range || 6;
  CHARTS = {};

  // Fotos del momento
  const now = positionAt(t0, all), neto = now.tienes - now.debes;
  const cur = cumulativeSpend(mk, all).slice(0, day), prev = cumulativeSpend(pk, all);
  const spentNow = cur[day - 1] || 0, spentPrevSameDay = prev[Math.min(day, prev.length) - 1] || 0;

  // Historial (lo que filtra el rango)
  const rangeStart = shiftMonth(mk, -(R - 1)) + '-01';
  const start = dataStart() > rangeStart ? dataStart() : rangeStart;
  const days = [];
  for (let d = parseDate(start); isoDate(d) <= t0; d.setDate(d.getDate() + 1)) days.push(isoDate(d));
  const pos = days.map(d => positionAt(d, all));
  const netDelta = pos.length > 1 ? neto - (pos[0].tienes - pos[0].debes) : null;

  // Ritmo de gasto: este mes contra el pasado, día por día
  const nDays = Math.max(daysIn(mk), daysIn(pk));
  CHARTS.pace = {
    type: 'line', labels: Array.from({ length: nDays }, (_, i) => i + 1), xTitle: 'Día',
    xFmt: l => `día ${l}`, tipTitle: l => `Día ${l}`, drawOrder: [1, 0],
    series: [
      { name: 'Este mes', cls: 's1', values: Array.from({ length: nDays }, (_, i) => (i < cur.length ? cur[i] : null)) },
      { name: monthName(pk), cls: 's0', values: Array.from({ length: nDays }, (_, i) => (i < prev.length ? prev[i] : null)) },
    ],
    aria: `Gasto acumulado: este mes ${money(spentNow)} al día ${day}; ${monthName(pk)} ${money(spentPrevSameDay)} al mismo día.`,
  };

  const up = upcomingPayments();
  const upVals = up.months.map(m => Object.values(up.bins[m]).reduce((a, b) => a + b, 0));
  CHARTS.upcoming = {
    type: 'cols', labels: up.months, xTitle: 'Mes', capLabels: true,
    xFmt: m => monthShort(m), tipTitle: m => `Pagos de ${monthName(m).toLowerCase()}`,
    series: [{ name: 'Por pagar', cls: 's1', values: upVals }],
    tipExtra: i => Object.entries(up.bins[up.months[i]]).map(([name, v]) => ({ value: money(v), name })),
    aria: `Pagos que se vienen: ${up.months.map((m, i) => `${monthName(m)} ${money(upVals[i])}`).join(', ')}.`,
  };

  const flowMonths = Array.from({ length: R }, (_, k) => shiftMonth(mk, k - (R - 1)));
  const flows = flowMonths.map(m => summary(m));
  CHARTS.flows = {
    type: 'cols', labels: flowMonths, xTitle: 'Mes',
    xFmt: m => monthShort(m), tipTitle: m => monthLabel(m),
    series: [
      { name: 'Ingresos', cls: 's1', values: flows.map(f => f.inc) },
      { name: 'Gastos', cls: 's2', values: flows.map(f => f.exp) },
    ],
    tipExtra: i => [{ value: money(flows[i].inc - flows[i].exp), name: 'te quedó' }],
    aria: `Ingresos y gastos por mes: ${flowMonths.map((m, i) => `${monthName(m)} entró ${money(flows[i].inc)} y salió ${money(flows[i].exp)}`).join('; ')}.`,
  };

  if (days.length > 1) {
    CHARTS.worth = {
      type: 'line', labels: days, xTitle: 'Fecha',
      xFmt: d => fmtShort(d), tipTitle: d => dayLabel(d),
      series: [
        { name: 'Tienes', cls: 's1', values: pos.map(p => p.tienes) },
        { name: 'Debes', cls: 's2', values: pos.map(p => p.debes) },
      ],
      tipExtra: i => [{ value: money(pos[i].tienes - pos[i].debes), name: 'neto' }],
      aria: `Desde el ${fmtShort(days[0])}: tienes pasó de ${money(pos[0].tienes)} a ${money(now.tienes)} y debes de ${money(pos[0].debes)} a ${money(now.debes)}.`,
    };
  }

  const byCat = {};
  all.forEach(t => { if (t.type === 'gasto' && t.date >= rangeStart && t.date <= t0) byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount; });
  let cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  if (cats.length > 7) cats = cats.slice(0, 6).concat([['__otras', cats.slice(6).reduce((a, c) => a + c[1], 0)]]);
  const catTotal = cats.reduce((a, c) => a + c[1], 0), catMax = cats[0]?.[1] || 1;

  const deltaTxt = (v, betterIfUp) => {
    if (!v) return '<span class="muted">igual</span>';
    const good = betterIfUp ? v > 0 : v < 0;
    return `<span class="${good ? 'ingreso' : 'gasto'}">${v > 0 ? '▲' : '▼'} ${money(Math.abs(v))}</span>`;
  };
  const empty = msg => `<div class="empty small">${msg}</div>`;

  return `
  <h1>Gráficos</h1>
  <div class="grid2">
    <div class="card stat"><div class="label">Patrimonio neto</div>
      <div class="value ${neto < 0 ? 'gasto' : ''}">${money(neto)}</div>
      <div class="small muted" style="margin-top:4px">${netDelta === null ? 'Lo que tienes menos lo que debes' : `${deltaTxt(netDelta, true)} desde el ${fmtShort(days[0])}`}</div></div>
    <div class="card stat"><div class="label">Gastado este mes</div>
      <div class="value">${money(spentNow)}</div>
      <div class="small muted" style="margin-top:4px">${deltaTxt(spentNow - spentPrevSameDay, false)} vs ${monthName(pk).toLowerCase()} al día ${day}</div></div>
  </div>

  <h2>Ritmo de gasto</h2>
  <div class="card"><div class="muted small" style="margin-bottom:8px">Cuánto llevas gastado cada día del mes, contra el mes pasado.</div>
    <div class="chart" data-chart="pace"></div></div>

  <h2>Pagos que se vienen</h2>
  <div class="card"><div class="muted small" style="margin-bottom:8px">Tarjetas y deudas con fecha, por mes en que vencen.</div>
    <div class="chart" data-chart="upcoming"></div>
    ${up.undated.length ? `<p class="small muted" style="margin:10px 0 0">Sin fecha: ${money(up.undated.reduce((a, d) => a + d.amt, 0))} (${esc(up.undated.map(d => d.name).join(', '))})</p>` : ''}
    ${up.later ? `<p class="small muted" style="margin:6px 0 0">Después de ${monthName(up.months[5]).toLowerCase()}: ${money(up.later)}</p>` : ''}
  </div>

  <div class="seg" style="margin-top:24px">${[[1, 'Este mes'], [3, '3 meses'], [6, '6 meses'], [12, '1 año']].map(([k, l]) => `<button data-range="${k}" class="${R === k ? 'on' : ''}">${l}</button>`).join('')}</div>

  <h2 style="margin-top:12px">Ingresos y gastos</h2>
  <div class="card"><div class="chart" data-chart="flows"></div></div>

  <h2>Lo que tienes y lo que debes</h2>
  <div class="card">${CHARTS.worth ? '<div class="chart" data-chart="worth"></div>' : empty(`Se dibuja a medida que pasen los días. Hoy tienes ${money(now.tienes)} y debes ${money(now.debes)}.`)}</div>

  <h2>En qué se fue</h2>
  <div class="card">
    ${cats.length ? cats.map(([id, v]) => `<div class="catrow"><span>${id === '__otras' ? '⋯' : cat(id)?.icon || '•'}</span><span>${esc(id === '__otras' ? 'Otras categorías' : cat(id)?.name || 'Sin categoría')}</span><span class="num">${money(v)} <span class="muted small">${Math.round((v / catTotal) * 100)}%</span></span><div class="bar"><i style="width:${(v / catMax) * 100}%;background:var(--s1)"></i></div></div>`).join('') : empty('Sin gastos en este periodo')}
  </div>
  `;
}

function mountCharts() {
  $$('[data-chart]').forEach(el => {
    const spec = CHARTS[el.dataset.chart];
    if (!spec) return;
    const open = el.querySelector('details.tbl')?.open;
    (spec.type === 'line' ? drawLine : drawCols)(el, spec);
    if (open) el.querySelector('details.tbl').open = true;
  });
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-range]');
  if (b) { V.range = Number(b.dataset.range); render(); }
});
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (V.tab === 'graficos') mountCharts(); }, 150);
});
