// ========= App OHANOS =========
const FIREBASE_URL = "https://quiniela-ohanos-2026-default-rtdb.firebaseio.com";
let DATA = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('data.json?v=' + Date.now());
    DATA = await res.json();

    // Cargar resultados "vivos" desde Firebase
    try {
      const fbRes = await fetch(FIREBASE_URL + '/live.json?_=' + Date.now());
      if (fbRes.ok) {
        const fb = await fbRes.json();
        if (fb) {
          if (fb.resultados) {
            Object.entries(fb.resultados).forEach(([num, ganador]) => {
              const p = DATA.partidos.find(x => x.num === Number(num));
              if (p) {
                p.ganador_real = ganador || null;
                p.jugado = !!ganador;
              }
            });
          }
          DATA.meta.campeon_real  = fb.campeon_real  || null;
          DATA.meta.goleador_real = fb.goleador_real || null;
          if (fb.bota_de_oro !== undefined) DATA.meta.bota_de_oro = fb.bota_de_oro;
        }
      }
    } catch (fbErr) {
      console.warn('No se pudo leer Firebase, usando solo JSON:', fbErr);
    }

    recalcularTodo(DATA);

    initTabs();
    renderHeaderPills();
    renderClasificacion();
    renderPartidos();
    renderPorPersona();
    renderCampeon();
    renderBotaActual();
    renderGoleador();
    initCapturar();
  } catch (e) {
    console.error('Error cargando data.json:', e);
    document.querySelector('main').innerHTML =
      '<div style="text-align:center;padding:40px;color:#C44E15;">' +
      '<h2>⚠️ No se pudo cargar los datos</h2></div>';
  }
});

// ========= Cálculo de puntos =========
function calcPtsPartido(pred, real) {
  if (!real || !pred) return null;
  return String(pred).trim().toLowerCase() === String(real).trim().toLowerCase() ? 2 : 0;
}
function calcPtsBonus(pred, real, valor) {
  if (!real || !String(real).trim()) return null;
  if (!pred || !String(pred).trim()) return 0;
  return String(pred).trim().toLowerCase() === String(real).trim().toLowerCase() ? valor : 0;
}

function recalcularTodo(data) {
  data.meta.partidos_jugados = data.partidos.filter(p => p.jugado).length;

  const stats = {};
  data.participantes.forEach(p => {
    stats[p.slot] = { nombre: p.nombre, pts_partidos: 0, pts_bonus: 0,
                      aciertos: 0, fallos: 0 };
  });

  data.predicciones.forEach(grupo => {
    const partido = data.partidos.find(x => x.num === grupo.partido_num);
    if (!partido) return;
    grupo.predicciones.forEach(pr => {
      const pts = calcPtsPartido(pr.pick, partido.ganador_real);
      pr.pts = pts;
      if (pts === 2) { stats[pr.slot].aciertos++; stats[pr.slot].pts_partidos += 2; }
      else if (pts === 0) { stats[pr.slot].fallos++; }
    });
  });

  data.bonus.forEach(b => {
    b.pts_campeon  = calcPtsBonus(b.campeon,  data.meta.campeon_real,  10);
    b.pts_goleador = calcPtsBonus(b.goleador, data.meta.goleador_real, 5);
    if (b.pts_campeon)  stats[b.slot].pts_bonus += b.pts_campeon;
    if (b.pts_goleador) stats[b.slot].pts_bonus += b.pts_goleador;
  });

  data.clasificacion = Object.entries(stats).map(([slot, s]) => ({
    slot: Number(slot),
    nombre: s.nombre,
    pts_total: s.pts_partidos + s.pts_bonus,
    pts_partidos: s.pts_partidos,
    pts_bonus: s.pts_bonus,
    aciertos: s.aciertos,
    fallos: s.fallos,
  }));
  data.clasificacion.sort((a, b) =>
    (b.pts_total - a.pts_total) ||
    (b.aciertos - a.aciertos) ||
    (a.slot - b.slot)
  );
  data.clasificacion.forEach((c, i) => c.pos = i + 1);
}

// ========= Tabs =========
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      window.scrollTo(0, 0);
    });
  });
}

// ========= Header pills =========
function renderHeaderPills() {
  document.getElementById('pill-jugados').textContent =
    `${DATA.meta.partidos_jugados}/${DATA.meta.total_partidos} jugados`;
  document.getElementById('pill-participantes').textContent =
    `${DATA.meta.total_participantes} participantes`;
}

// ========= Util =========
function getHoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Banderas para Campeón
const FLAGS = {
  'España':'🇪🇸','Espana':'🇪🇸','Francia':'🇫🇷','Brasil':'🇧🇷','Noruega':'🇳🇴',
  'Inglaterra':'ENG','Escocia':'SCO','Gales':'WAL','Reino Unido':'🇬🇧','Argentina':'🇦🇷','México':'🇲🇽','Mexico':'🇲🇽',
  'Portugal':'🇵🇹','Alemania':'🇩🇪','Países Bajos':'🇳🇱','Holanda':'🇳🇱','Italia':'🇮🇹',
  'Uruguay':'🇺🇾','Colombia':'🇨🇴','Bélgica':'🇧🇪','Croacia':'🇭🇷','Suiza':'🇨🇭',
  'Japón':'🇯🇵','Senegal':'🇸🇳','Marruecos':'🇲🇦',
};
const GOLEADOR_PAIS = {
  'Kylian Mbappé':'Francia','Erling Haaland':'Noruega','Vinícius Júnior':'Brasil',
  'Endrick':'Brasil','Lamine Yamal':'España','Harry Kane':'Inglaterra',
  'Ousmane Dembélé':'Francia','Julián Álvarez':'Argentina','Oyarzabal':'España',
  'Lautaro Martínez':'Argentina','Messi':'Argentina','Lionel Messi':'Argentina',
};
const TEAM_COLORS = {
  'España':'#C62828','Francia':'#1565C0','Brasil':'#2E7D32','Argentina':'#5BAEE0',
  'Alemania':'#212121','Inglaterra':'#E53935','Portugal':'#8E0F0F','Países Bajos':'#F26522',
  'México':'#0F9D58','Italia':'#0D47A1','Uruguay':'#4FC3F7','Colombia':'#FFC107',
};
const FALLBACK_COLORS = ['#F57C00','#6A1B9A','#00838F','#AD1457','#558B2F'];
function colorEquipo(equipo, fallbackIdx = 0) {
  return TEAM_COLORS[equipo] || FALLBACK_COLORS[fallbackIdx % FALLBACK_COLORS.length];
}
function flag(equipo) { return FLAGS[equipo] || '🏳️'; }

// ========= Clasificación =========
function renderClasificacion() {
  const podiumEl = document.getElementById('clasif-podium');
  const tbody = document.getElementById('clasif-tbody');
  document.getElementById('updated-text').textContent =
    `${DATA.meta.partidos_jugados} de ${DATA.meta.total_partidos} partidos jugados`;

  const top3 = DATA.clasificacion.slice(0, 3);
  const medals = ['🥇','🥈','🥉'];
  const colors = ['gold','silver','bronze'];
  podiumEl.innerHTML = top3.map((c, i) => `
    <div class="podium-card ${colors[i]}">
      <div class="podium-medal">${medals[i]}</div>
      <div class="podium-name">${escapeHtml(c.nombre)}</div>
      <div class="podium-pts">${c.pts_total}</div>
      <div class="podium-sub">${c.aciertos} aciertos</div>
    </div>
  `).join('');

  tbody.innerHTML = DATA.clasificacion.map(c => {
    const cls = c.pos <= 3 ? `pos-${c.pos}` : '';
    return `
      <tr class="${cls}">
        <td>${c.pos}</td>
        <td>${escapeHtml(c.nombre)}</td>
        <td class="total">${c.pts_total}</td>
        <td class="hide-mobile center">${c.pts_partidos}</td>
        <td class="hide-mobile center">${c.pts_bonus}</td>
        <td class="hide-mobile center">${c.aciertos}</td>
        <td class="hide-mobile center">${c.fallos}</td>
      </tr>
    `;
  }).join('');
}

// ========= Partidos =========
function renderPartidos(filtroDia = '') {
  const cont = document.getElementById('partidos-list');
  const filtroEl = document.getElementById('filtro-dia');

  if (filtroEl.options.length <= 1) {
    [...new Set(DATA.partidos.map(p => p.fecha))].forEach(d => {
      const o = document.createElement('option');
      o.value = d; o.textContent = d;
      filtroEl.appendChild(o);
    });
    filtroEl.addEventListener('change', e => renderPartidos(e.target.value));
  }

  const hoy = getHoyIso();
  const partidos = DATA.partidos.filter(p => !filtroDia || p.fecha === filtroDia);
  const partidosHoy = filtroDia ? [] : partidos.filter(p => p.fecha_iso === hoy);
  const partidosResto = filtroDia ? partidos : partidos.filter(p => p.fecha_iso !== hoy);

  const byDay = {};
  partidosResto.forEach(p => {
    const k = p.fecha || 'Sin fecha';
    if (!byDay[k]) byDay[k] = { iso: p.fecha_iso || '', label: k, list: [] };
    byDay[k].list.push(p);
  });
  const grupos = Object.values(byDay).sort((a, b) => (a.iso || '').localeCompare(b.iso || ''));

  let html = '';
  if (partidosHoy.length > 0) {
    html += `<div class="partidos-day day-today">
      <h3>📍 HOY · ${partidosHoy[0].fecha}</h3>
      ${partidosHoy.map(p => renderPartidoCard(p)).join('')}
    </div>`;
  }
  html += grupos.map(g => `
    <div class="partidos-day">
      <h3>${g.label}</h3>
      ${g.list.map(p => renderPartidoCard(p)).join('')}
    </div>
  `).join('');
  cont.innerHTML = html;
  cont.querySelectorAll('.partido-card').forEach(card => {
    card.addEventListener('click', () => card.classList.toggle('open'));
  });
}

function renderPartidoCard(p) {
  const result = p.jugado
    ? `<div class="partido-score">${escapeHtml(p.ganador_real)}</div>`
    : `<div class="partido-score pending">Por jugar</div>`;
  const preds = DATA.predicciones.find(x => x.partido_num === p.num)?.predicciones || [];
  return `
    <div class="partido-card">
      <div class="partido-head">
        <span class="partido-info">${p.grupo} · ${p.hora} · ${escapeHtml(p.estadio || '')}</span>
        <span class="partido-info">P${p.num}</span>
      </div>
      <div class="partido-teams">
        <div class="partido-team local">${escapeHtml(p.local)}</div>
        ${result}
        <div class="partido-team visit">${escapeHtml(p.visitante)}</div>
      </div>
      <div class="partido-detail">
        <strong style="color:var(--blue)">Predicciones (${preds.length}):</strong>
        <div class="pred-grid">
          ${preds.map(pr => renderPredItem(pr, p.jugado)).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderPredItem(pr, jugado) {
  let cls = '';
  if (jugado) cls = pr.pts === 2 ? 'exact' : 'fail';
  const pick = pr.pick || '—';
  const ptsBadge = jugado ? `<span class="pred-pts">${pr.pts ?? 0}</span>` : '';
  return `
    <div class="pred-item ${cls}">
      <span class="pred-name">${escapeHtml(pr.nombre)}</span>
      <span class="pred-score">${escapeHtml(pick)}</span>
      ${ptsBadge}
    </div>
  `;
}

// ========= Por persona =========
function renderPorPersona() {
  const sel = document.getElementById('select-persona');
  DATA.participantes.forEach(p => {
    const o = document.createElement('option');
    o.value = p.slot; o.textContent = p.nombre;
    sel.appendChild(o);
  });
  sel.addEventListener('change', e => renderPersonaDetalle(Number(e.target.value)));
  renderPersonaDetalle(DATA.participantes[0].slot);
}

function renderPersonaDetalle(slot) {
  const c = DATA.clasificacion.find(x => x.slot === slot);
  const b = DATA.bonus.find(x => x.slot === slot);
  const cont = document.getElementById('persona-detalle');

  const headerHtml = `
    <div class="persona-header">
      <div class="persona-name">${escapeHtml(c.nombre)}</div>
      <div class="persona-stats">
        <div class="persona-stat"><div class="num">#${c.pos}</div><div class="lbl">Posición</div></div>
        <div class="persona-stat"><div class="num">${c.pts_total}</div><div class="lbl">Total pts</div></div>
        <div class="persona-stat"><div class="num">${c.aciertos}</div><div class="lbl">Aciertos</div></div>
        <div class="persona-stat"><div class="num">${c.fallos}</div><div class="lbl">Fallos</div></div>
      </div>
      <div class="persona-bonus">
        <div>🏆 Campeón<br><strong>${escapeHtml(b?.campeon || '—')}</strong><small>${b?.pts_campeon !== null ? '(' + (b?.pts_campeon || 0) + ' pts)' : 'pendiente'}</small></div>
        <div>⚽ Goleador<br><strong>${escapeHtml(b?.goleador || '—')}</strong><small>${b?.pts_goleador !== null ? '(' + (b?.pts_goleador || 0) + ' pts)' : 'pendiente'}</small></div>
      </div>
    </div>
  `;

  const byDay = {};
  DATA.partidos.forEach(p => {
    const pred = DATA.predicciones.find(x => x.partido_num === p.num)?.predicciones.find(x => x.slot === slot);
    if (!byDay[p.fecha]) byDay[p.fecha] = [];
    byDay[p.fecha].push({ partido: p, pred });
  });

  const daysHtml = Object.entries(byDay).map(([dia, list]) => `
    <div class="partidos-day">
      <h3>${dia}</h3>
      ${list.map(({partido, pred}) => renderPersonaPartido(partido, pred)).join('')}
    </div>
  `).join('');

  cont.innerHTML = headerHtml + daysHtml;
}

function renderPersonaPartido(partido, pred) {
  const real = partido.jugado ? partido.ganador_real : 'Por jugar';
  const tu = pred?.pick || '—';
  let ptsBadge = '';
  if (partido.jugado && pred) {
    ptsBadge = pred.pts === 2 ? '<span class="pred-pts">2</span>' : '<span class="pred-pts">0</span>';
  }
  return `
    <div class="partido-card">
      <div class="partido-head">
        <span class="partido-info">${partido.grupo} · ${partido.hora} · P${partido.num}</span>
        ${ptsBadge}
      </div>
      <div class="partido-teams">
        <div class="partido-team local">${escapeHtml(partido.local)}</div>
        <div class="partido-score ${partido.jugado ? '' : 'pending'}">${escapeHtml(tu)}</div>
        <div class="partido-team visit">${escapeHtml(partido.visitante)}</div>
      </div>
      <div style="text-align:center;margin-top:8px;font-size:0.85rem;color:var(--muted);">
        Real: <strong>${escapeHtml(real)}</strong>
      </div>
    </div>
  `;
}

// ========= Campeón =========
function renderCampeon() {
  const groups = {};
  DATA.bonus.forEach(b => {
    const v = (b.campeon || '— sin selección —').trim();
    if (!groups[v]) groups[v] = [];
    groups[v].push(b.nombre);
  });
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  const total = DATA.bonus.length;

  let accum = 0, fbI = 0;
  const colorOf = (eq) => TEAM_COLORS[eq] || FALLBACK_COLORS[fbI++ % FALLBACK_COLORS.length];
  const stops = sorted.map(([equipo, personas]) => {
    const pct = personas.length / total * 100;
    const start = accum;
    accum += pct;
    return `${colorOf(equipo)} ${start}% ${accum}%`;
  }).join(', ');

  const counts = sorted.map(([_, p]) => p.length);
  const maxCount = counts[0];
  const empateMax = counts.filter(c => c === maxCount).length > 1;

  document.getElementById('campeon-pie').innerHTML = `
    <div class="pie-chart" style="background: conic-gradient(${stops});"></div>
    <div class="pie-list">
      ${sorted.map(([equipo, personas]) => {
        const pct = (personas.length / total * 100).toFixed(1);
        const isMax = personas.length === maxCount && empateMax;
        const col = colorEquipo(equipo);
        return `<div class="pie-row">
          <span class="dot" style="background:${col}"></span>
          <span class="flag-big">${flag(equipo)}</span>
          <div class="info">
            <div class="equipo">${escapeHtml(equipo)}</div>
            <div class="votos">${personas.length} voto${personas.length === 1 ? '' : 's'}${isMax ? ' · empate técnico' : ''}</div>
          </div>
          <div class="pct" style="color:${col}">${pct}%</div>
        </div>`;
      }).join('')}
    </div>
  `;

  document.getElementById('campeon-detalle').innerHTML = `
    <div class="campeon-detalle-title">Quiénes votaron por cada equipo</div>
    ${sorted.map(([equipo, personas]) => `
      <div class="campeon-detalle-row" style="border-left-color: ${colorEquipo(equipo)};">
        <span class="flag-md">${flag(equipo)}</span>
        <span class="equipo-nombre">${escapeHtml(equipo)}</span>
        <span class="personas">${personas.map(escapeHtml).join(', ')}</span>
      </div>
    `).join('')}
  `;
}

// ========= Bota de Oro · líder actual real =========
function renderBotaActual() {
  const cont = document.getElementById('bota-actual');
  if (!cont) return;
  const bota = DATA.meta.bota_de_oro;
  if (!bota || !bota.lideres || bota.lideres.length === 0 || !bota.goles) {
    cont.innerHTML = '';
    return;
  }
  const n = bota.lideres.length;
  const statsTxt = n > 1 ? `${n} jugadores empatados` : '1 jugador en la cima';
  cont.innerHTML = `
    <div class="bota-actual-head">
      <span class="bota-actual-title">🥇 Bota de Oro · Líder real del Mundial</span>
      <span class="bota-actual-stats">${statsTxt}</span>
    </div>
    <div class="bota-actual-goles">
      ${bota.goles} <small>gol${bota.goles === 1 ? '' : 'es'}</small>
    </div>
    ${bota.lideres.map(l => `
      <div class="bota-lider-row">
        <span class="bota-lider-flag">${flag(l.pais)}</span>
        <span class="bota-lider-name">${escapeHtml(l.nombre)}</span>
        <span class="bota-lider-pais">${escapeHtml(l.pais)}</span>
      </div>
    `).join('')}
    ${bota.actualizado ? `<div class="bota-actual-footer">Actualizado: ${escapeHtml(bota.actualizado)}</div>` : ''}
  `;
}

// ========= Goleador =========
function renderGoleador() {
  const groups = {};
  DATA.bonus.forEach(b => {
    const v = (b.goleador || '— sin selección —').trim();
    if (!groups[v]) groups[v] = [];
    groups[v].push(b.nombre);
  });
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);

  const top3 = sorted.slice(0, 3);
  const visualOrder = [];
  if (top3[1]) visualOrder.push({ rank: 2, data: top3[1] });
  if (top3[0]) visualOrder.push({ rank: 1, data: top3[0] });
  if (top3[2]) visualOrder.push({ rank: 3, data: top3[2] });

  document.getElementById('goleador-podium').innerHTML = visualOrder.map(({ rank, data }) => {
    const [jugador, personas] = data;
    const pais = GOLEADOR_PAIS[jugador] || '';
    const flagEmoji = pais ? flag(pais) : '⚽';
    return `
      <div class="podio-spot rank-${rank}">
        <div class="podio-rank">${rank}</div>
        <div class="podio-flag">${flagEmoji}</div>
        <div class="podio-name">${escapeHtml(jugador)}</div>
        <div class="podio-votes">${personas.length} voto${personas.length === 1 ? '' : 's'}</div>
        <div class="podio-personas">${personas.map(escapeHtml).join(', ')}</div>
      </div>
    `;
  }).join('');

  const resto = sorted.slice(3);
  document.getElementById('goleador-resto').innerHTML = resto.map(([jugador, personas], i) => {
    const rank = i + 4;
    const pais = GOLEADOR_PAIS[jugador] || '';
    const flagEmoji = pais ? flag(pais) : '⚽';
    return `
      <div class="resto-card">
        <div class="resto-pos">${rank}°</div>
        <div class="resto-flag">${flagEmoji}</div>
        <div class="resto-name">${escapeHtml(jugador)}</div>
        <div class="resto-votes">${personas.length} voto${personas.length === 1 ? '' : 's'}</div>
        <div class="resto-persona">${personas.map(escapeHtml).join(', ')}</div>
      </div>
    `;
  }).join('');
}

// ========= Capturar =========
const ADMIN_PASS = "ohanos2026";
let CAPT = null;

function initCapturar() {
  const btn = document.getElementById('login-btn');
  const pass = document.getElementById('login-pass');
  const err = document.getElementById('login-error');
  if (!btn) return;
  const tryLogin = () => {
    if (pass.value === ADMIN_PASS) {
      document.getElementById('capturar-login').style.display = 'none';
      document.getElementById('capturar-panel').style.display = 'block';
      err.textContent = '';
      renderCapturarPanel();
    } else {
      err.textContent = '❌ Clave incorrecta';
      pass.value = '';
      pass.focus();
    }
  };
  btn.addEventListener('click', tryLogin);
  pass.addEventListener('keypress', e => { if (e.key === 'Enter') tryLogin(); });
  document.getElementById('btn-logout').addEventListener('click', () => {
    document.getElementById('capturar-login').style.display = 'block';
    document.getElementById('capturar-panel').style.display = 'none';
    pass.value = '';
  });
  document.getElementById('capt-filtro').addEventListener('change', renderCapturarPartidos);
  document.getElementById('btn-download').addEventListener('click', descargarJSON);
  document.getElementById('btn-save').addEventListener('click', guardarEnFirebase);
}

function renderCapturarPanel() {
  CAPT = JSON.parse(JSON.stringify(DATA));
  document.getElementById('capt-campeon').value = CAPT.meta.campeon_real || '';
  document.getElementById('capt-goleador').value = CAPT.meta.goleador_real || '';
  document.getElementById('capt-campeon').addEventListener('input', e => {
    CAPT.meta.campeon_real = e.target.value;
  });
  document.getElementById('capt-goleador').addEventListener('input', e => {
    CAPT.meta.goleador_real = e.target.value;
  });

  // Bota de Oro
  const bota = CAPT.meta.bota_de_oro || {};
  document.getElementById('capt-bota-goles').value = bota.goles || '';
  document.getElementById('capt-bota-fecha').value = bota.actualizado || '';
  const lideresTxt = (bota.lideres || []).map(l => `${l.nombre} - ${l.pais}`).join('\n');
  document.getElementById('capt-bota-lideres').value = lideresTxt;

  renderCapturarPartidos();
}

function renderCapturarPartidos() {
  const filtro = document.getElementById('capt-filtro').value;
  const hoy = getHoyIso();
  let lista = CAPT.partidos;
  if (filtro === 'hoy') lista = lista.filter(p => p.fecha_iso === hoy);
  else if (filtro === 'pendientes') lista = lista.filter(p => !p.ganador_real);

  const cont = document.getElementById('capt-partidos-list');
  if (lista.length === 0) {
    cont.innerHTML = `<p style="color:var(--muted);text-align:center;padding:20px;">No hay partidos para mostrar con este filtro.</p>`;
    return;
  }
  cont.innerHTML = lista.map(p => {
    const hasResult = !!p.ganador_real;
    const opts = [
      { val: p.local, label: '🏠 ' + p.local },
      { val: 'Empate', label: '🤝 Empate' },
      { val: p.visitante, label: '✈️ ' + p.visitante },
    ];
    return `
      <div class="capt-partido ohanos ${hasResult ? 'has-result' : ''}" data-num="${p.num}">
        <div class="capt-partido-info">
          <div class="capt-partido-teams">${escapeHtml(p.local)} vs ${escapeHtml(p.visitante)}</div>
          <div class="capt-partido-meta">P${p.num} · ${p.fecha} · ${p.hora}</div>
        </div>
        <div class="capt-pick-row">
          ${opts.map(o => `
            <label class="capt-pick-opt ${p.ganador_real === o.val ? 'active' : ''}">
              <input type="radio" name="g-${p.num}" value="${escapeHtml(o.val)}" ${p.ganador_real === o.val ? 'checked' : ''}>
              <span>${escapeHtml(o.label)}</span>
            </label>
          `).join('')}
          <button class="capt-pick-clear" data-num="${p.num}" title="Borrar selección">✕</button>
        </div>
      </div>
    `;
  }).join('');

  cont.querySelectorAll('input[type=radio]').forEach(inp => {
    inp.addEventListener('change', e => {
      const card = e.target.closest('.capt-partido');
      const num = Number(card.dataset.num);
      const partido = CAPT.partidos.find(x => x.num === num);
      if (partido) {
        partido.ganador_real = e.target.value;
        partido.jugado = true;
        card.classList.add('has-result');
        // Resaltar el label activo
        card.querySelectorAll('.capt-pick-opt').forEach(l => l.classList.remove('active'));
        e.target.closest('.capt-pick-opt').classList.add('active');
      }
    });
  });

  cont.querySelectorAll('.capt-pick-clear').forEach(btn => {
    btn.addEventListener('click', e => {
      const num = Number(e.target.dataset.num);
      const partido = CAPT.partidos.find(x => x.num === num);
      if (partido) {
        partido.ganador_real = null;
        partido.jugado = false;
        const card = e.target.closest('.capt-partido');
        card.classList.remove('has-result');
        card.querySelectorAll('.capt-pick-opt').forEach(l => l.classList.remove('active'));
        card.querySelectorAll('input[type=radio]').forEach(r => r.checked = false);
      }
    });
  });
}

async function guardarEnFirebase() {
  if (!CAPT) return;
  const msg = document.getElementById('save-msg');
  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  msg.textContent = '⏳ Guardando en la nube...';
  msg.className = 'save-msg pending';

  CAPT.meta.campeon_real  = (CAPT.meta.campeon_real  || '').trim() || null;
  CAPT.meta.goleador_real = (CAPT.meta.goleador_real || '').trim() || null;

  // Procesar Bota de Oro desde inputs
  const goles = parseInt(document.getElementById('capt-bota-goles').value);
  const fecha = document.getElementById('capt-bota-fecha').value || null;
  const lideresTxt = document.getElementById('capt-bota-lideres').value || '';
  const lideres = lideresTxt.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const m = line.split(/\s*[-–—]\s*/);
      return { nombre: (m[0] || '').trim(), pais: (m[1] || '').trim() };
    })
    .filter(l => l.nombre);
  CAPT.meta.bota_de_oro = (goles && lideres.length > 0) ? {
    goles, lideres, actualizado: fecha
  } : null;

  const payload = {
    resultados:    {},
    campeon_real:  CAPT.meta.campeon_real,
    goleador_real: CAPT.meta.goleador_real,
    bota_de_oro:   CAPT.meta.bota_de_oro,
  };
  CAPT.partidos.forEach(p => {
    if (p.ganador_real) payload.resultados[String(p.num)] = p.ganador_real;
  });

  try {
    const res = await fetch(FIREBASE_URL + '/live.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    msg.textContent = '✅ Guardado. Refrescando la web...';
    msg.className = 'save-msg ok';
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    msg.textContent = '❌ Error al guardar: ' + e.message;
    msg.className = 'save-msg err';
    btn.disabled = false;
  }
}

function descargarJSON() {
  recalcularTodo(CAPT);
  const blob = new Blob([JSON.stringify(CAPT, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'data.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
