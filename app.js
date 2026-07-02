// ========= App OHANOS =========
const FIREBASE_URL = "https://quiniela-ohanos-2026-default-rtdb.firebaseio.com";
// Firebase de DES: solo se LEE para mostrar marcadores reales del Mundial en la pestaña 'Mundial'.
// La quiniela OHANOS no se modifica con esto.
const DES_FIREBASE_URL = "https://quiniela-des-mpp-2026-default-rtdb.firebaseio.com";
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
              if (!ganador) return; // ignorar índices null (Firebase array)
              const p = DATA.partidos.find(x => x.num === Number(num));
              if (p) {
                p.ganador_real = ganador;
                p.jugado = true;
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

    // Leer marcadores reales del Firebase de DES (para tabla de grupos y bracket).
    // Esto NO afecta los puntos de OHANOS (que se calculan con ganador_real).
    try {
      const desRes = await fetch(DES_FIREBASE_URL + '/live.json?_=' + Date.now());
      if (desRes.ok) {
        const desFb = await desRes.json();
        if (desFb && desFb.resultados) {
          const entries = Array.isArray(desFb.resultados)
            ? desFb.resultados.map((r, i) => [String(i), r])
            : Object.entries(desFb.resultados);
          entries.forEach(([num, r]) => {
            if (!r) return;
            const p = DATA.partidos.find(x => x.num === Number(num));
            if (p) {
              p.gol_local = (r.l != null) ? Number(r.l) : null;
              p.gol_visit = (r.v != null) ? Number(r.v) : null;
            }
          });
        }
      }
    } catch (e) {
      console.warn('No se pudo leer Firebase DES para tabla del Mundial:', e);
    }

    recalcularTodo(DATA);

    initTabs();
    initSubTabsMundial();
    renderHeaderPills();
    renderClasificacion();
    initFaseTabs();
    renderPartidos();
    renderPorPersona();
    renderCampeon();
    renderBotaActual();
    renderGoleador();
    renderMundial();
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
  const sub = document.querySelector('.subtitle');
  if (sub && DATA.meta.fase) {
    const pref = (sub.textContent.split('·')[0] || '').trim();
    sub.textContent = (pref ? pref + ' · ' : '') + DATA.meta.fase;
  }
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
// Códigos FIFA de 3 letras (como aparecen en transmisiones)
const FLAGS = {
  'México':'MEX','Mexico':'MEX',
  'Sudáfrica':'RSA','Sudafrica':'RSA',
  'República de Corea':'KOR','Corea del Sur':'KOR',
  'República Checa':'CZE','Chequia':'CZE',
  'Canadá':'CAN','Canada':'CAN',
  'Bosnia y Herzegovina':'BIH','Bosnia':'BIH',
  'Catar':'QAT','Qatar':'QAT',
  'Suiza':'SUI',
  'Brasil':'BRA',
  'Marruecos':'MAR',
  'Haití':'HAI','Haiti':'HAI',
  'Estados Unidos':'USA','USA':'USA','EE.UU.':'USA',
  'Paraguay':'PAR',
  'Australia':'AUS',
  'Turquía':'TUR','Turkiye':'TUR','Turkia':'TUR',
  'Alemania':'GER',
  'Curazao':'CUW',
  'Costa de Marfil':'CIV',
  'Ecuador':'ECU',
  'Países Bajos':'NED','Paises Bajos':'NED','Holanda':'NED',
  'Japón':'JPN','Japon':'JPN',
  'Suecia':'SWE',
  'Túnez':'TUN','Tunez':'TUN',
  'Bélgica':'BEL','Belgica':'BEL',
  'Egipto':'EGY',
  'Irán':'IRN','Iran':'IRN',
  'Nueva Zelanda':'NZL',
  'España':'ESP','Espana':'ESP',
  'Cabo Verde':'CPV',
  'Arabia Saudita':'KSA',
  'Uruguay':'URU',
  'Francia':'FRA',
  'Senegal':'SEN',
  'Irak':'IRQ','Iraq':'IRQ',
  'Noruega':'NOR',
  'Austria':'AUT',
  'Jordania':'JOR',
  'Argentina':'ARG',
  'Argelia':'ALG',
  'Portugal':'POR',
  'Rep. Dem. del Congo':'COD','República Democrática del Congo':'COD',
  'Uzbekistán':'UZB','Uzbekistan':'UZB',
  'Colombia':'COL',
  'Inglaterra':'ENG','Escocia':'SCO','Gales':'WAL','Reino Unido':'GBR',
  'Croacia':'CRO',
  'Ghana':'GHA',
  'Panamá':'PAN','Panama':'PAN',
  'Italia':'ITA',
};
const GOLEADOR_PAIS = {
  'Kylian Mbappé':'Francia','Erling Haaland':'Noruega','Vinícius Júnior':'Brasil',
  'Endrick':'Brasil','Lamine Yamal':'España','Harry Kane':'Inglaterra',
  'Ousmane Dembélé':'Francia','Julián Álvarez':'Argentina','Oyarzabal':'España',
  'Lautaro Martínez':'Argentina','Messi':'Argentina','Lionel Messi':'Argentina',
};

// Extrae el país de un nombre tipo "Kylian Mbappé (Francia)" o lo busca en GOLEADOR_PAIS
function detectarPais(jugador) {
  if (!jugador) return '';
  const m = String(jugador).match(/\(([^)]+)\)\s*$/);
  if (m) return m[1].trim();
  return GOLEADOR_PAIS[String(jugador).trim()] || '';
}
// Quita el "(País)" del nombre para mostrar solo el nombre limpio
function limpiarNombre(jugador) {
  if (!jugador) return '';
  return String(jugador).replace(/\s*\([^)]+\)\s*$/, '').trim();
}
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

// ========= Partidos (con pestañas por fase) =========
let CURRENT_FASE = null;

function faseDefault() {
  const hoy = getHoyIso();
  const fasesHoy = DATA.partidos.filter(p => p.fecha_iso === hoy).map(p => p.fase);
  if (fasesHoy.length) return fasesHoy[fasesHoy.length - 1];
  const fases = DATA.meta.fases || [];
  for (let i = fases.length - 1; i >= 0; i--) {
    if (DATA.partidos.some(p => p.fase === fases[i].key)) return fases[i].key;
  }
  return fases[0]?.key || null;
}

function initFaseTabs() {
  const cont = document.getElementById('fase-tabs');
  const fases = DATA.meta.fases || [];
  if (!cont) return;
  if (fases.length <= 1) { cont.style.display = 'none'; CURRENT_FASE = fases[0]?.key || null; return; }
  CURRENT_FASE = faseDefault();
  cont.innerHTML = fases.map(f =>
    `<button class="sub-tab fase-tab${f.key === CURRENT_FASE ? ' active' : ''}" data-fase="${f.key}">${escapeHtml(f.label)}</button>`
  ).join('');
  cont.querySelectorAll('.fase-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      cont.querySelectorAll('.fase-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      CURRENT_FASE = btn.dataset.fase;
      const fe = document.getElementById('filtro-dia'); if (fe) fe.value = '';
      renderPartidos('');
    });
  });
}

function renderPartidos(filtroDia = '') {
  const cont = document.getElementById('partidos-list');
  const filtroEl = document.getElementById('filtro-dia');
  const fase = CURRENT_FASE;

  const partidosFase = DATA.partidos.filter(p => !fase || p.fase === fase);

  if (filtroEl) {
    const dias = [...new Set(partidosFase.map(p => p.fecha))];
    const actuales = Array.from(filtroEl.options).slice(1).map(o => o.value);
    if (actuales.join('|') !== dias.join('|')) {
      filtroEl.innerHTML = '<option value="">Todos</option>' +
        dias.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
      filtroEl.onchange = e => renderPartidos(e.target.value);
    }
  }

  const hoy = getHoyIso();
  const partidos = partidosFase.filter(p => !filtroDia || p.fecha === filtroDia);
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
  if (!html) html = '<p style="text-align:center;color:var(--muted);padding:24px;">No hay partidos en esta fase.</p>';
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

  let lastFaseP = null;
  const daysHtml = Object.entries(byDay).map(([dia, list]) => {
    const faseLbl = list[0]?.partido?.fase_label || '';
    let banner = '';
    if (faseLbl && faseLbl !== lastFaseP) {
      banner = `<h2 class="fase-banner">${escapeHtml(faseLbl)}</h2>`;
      lastFaseP = faseLbl;
    }
    return banner + `
    <div class="partidos-day">
      <h3>${dia}</h3>
      ${list.map(({partido, pred}) => renderPersonaPartido(partido, pred)).join('')}
    </div>`;
  }).join('');

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

// ========= Bota de Oro · tabla =========
function renderBotaActual() {
  const cont = document.getElementById('bota-actual');
  if (!cont) return;
  const bota = DATA.meta.bota_de_oro;
  if (!bota || !bota.lideres || bota.lideres.length === 0) {
    cont.innerHTML = '';
    return;
  }
  // Set de jugadores que tienen votos en la quiniela (goleadores apostados)
  const conVoto = new Set();
  (DATA.bonus || []).forEach(b => {
    if (b.goleador) conVoto.add(limpiarNombre(b.goleador).toLowerCase());
  });

  const lideres = bota.lideres.map(l => ({
    nombre:    l.nombre,
    pais:      l.pais,
    goles:     (l.goles != null ? l.goles : bota.goles) || 0,
    tieneVoto: conVoto.has(limpiarNombre(l.nombre).toLowerCase()),
  })).sort((a, b) => b.goles - a.goles || a.nombre.localeCompare(b.nombre));

  const n = lideres.length;
  cont.innerHTML = `
    <div class="bota-actual-head">
      <span class="bota-actual-title">🥇 Bota de Oro · Líder real del Mundial</span>
      <span class="bota-actual-stats">${n} jugador${n === 1 ? '' : 'es'}</span>
    </div>
    <div class="bota-table-wrap">
      <table class="bota-table">
        <colgroup>
          <col class="c-pais">
          <col class="c-jugador">
          <col class="c-goles">
        </colgroup>
        <thead>
          <tr>
            <th class="c">País</th>
            <th>Jugador</th>
            <th class="c">Goles</th>
          </tr>
        </thead>
        <tbody>
          ${lideres.map(l => `
            <tr>
              <td class="col-pais">${flag(l.pais)}</td>
              <td class="col-jugador">${escapeHtml(l.nombre)}${l.tieneVoto ? '<span class="bota-star" title="Tiene voto en la quiniela">★</span>' : ''}</td>
              <td class="col-goles">${l.goles}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
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
    const pais = detectarPais(jugador);
    const flagEmoji = pais ? flag(pais) : '⚽';
    return `
      <div class="podio-spot rank-${rank}">
        <div class="podio-rank">${rank}</div>
        <div class="podio-flag">${flagEmoji}</div>
        <div class="podio-name">${escapeHtml(limpiarNombre(jugador))}</div>
        <div class="podio-votes">${personas.length} voto${personas.length === 1 ? '' : 's'}</div>
        <div class="podio-personas">${personas.map(escapeHtml).join(', ')}</div>
      </div>
    `;
  }).join('');

  const resto = sorted.slice(3);
  document.getElementById('goleador-resto').innerHTML = resto.map(([jugador, personas], i) => {
    const rank = i + 4;
    const pais = detectarPais(jugador);
    const flagEmoji = pais ? flag(pais) : '⚽';
    return `
      <div class="resto-card">
        <div class="resto-pos">${rank}°</div>
        <div class="resto-flag">${flagEmoji}</div>
        <div class="resto-name">${escapeHtml(limpiarNombre(jugador))}</div>
        <div class="resto-votes">${personas.length} voto${personas.length === 1 ? '' : 's'}</div>
        <div class="resto-persona">${personas.map(escapeHtml).join(', ')}</div>
      </div>
    `;
  }).join('');
}

// ========= Mundial: Grupos y Bracket =========
const ELIMINATORIAS = [
  { fase: 'R32', num: 1, fecha: 'Dom 28 Jun', hora: '13:00', sede: 'Estadio Ciudad de México', clave_a: '1A', clave_b: '3°-1' },
  { fase: 'R32', num: 2, fecha: 'Dom 28 Jun', hora: '17:00', sede: 'Estadio Atlanta',           clave_a: '1B', clave_b: '3°-2' },
  { fase: 'R32', num: 3, fecha: 'Dom 28 Jun', hora: '20:00', sede: 'Estadio Toronto',           clave_a: '1C', clave_b: '3°-3' },
  { fase: 'R32', num: 4, fecha: 'Lun 29 Jun', hora: '13:00', sede: 'Estadio Houston',           clave_a: '1D', clave_b: '3°-4' },
  { fase: 'R32', num: 5, fecha: 'Lun 29 Jun', hora: '17:00', sede: 'Estadio Filadelfia',        clave_a: '1E', clave_b: '3°-5' },
  { fase: 'R32', num: 6, fecha: 'Lun 29 Jun', hora: '20:00', sede: 'Estadio Boston',            clave_a: '1F', clave_b: '3°-6' },
  { fase: 'R32', num: 7, fecha: 'Mar 30 Jun', hora: '13:00', sede: 'Estadio Nueva York/NJ',     clave_a: '1G', clave_b: '3°-7' },
  { fase: 'R32', num: 8, fecha: 'Mar 30 Jun', hora: '17:00', sede: 'Estadio Dallas',            clave_a: '1H', clave_b: '3°-8' },
  { fase: 'R32', num: 9, fecha: 'Mar 30 Jun', hora: '20:00', sede: 'BC Place Vancouver',        clave_a: '2A', clave_b: '2B' },
  { fase: 'R32', num: 10, fecha: 'Mié 1 Jul', hora: '13:00', sede: 'Estadio Seattle',           clave_a: '2C', clave_b: '2D' },
  { fase: 'R32', num: 11, fecha: 'Mié 1 Jul', hora: '17:00', sede: 'Estadio Los Ángeles',       clave_a: '2E', clave_b: '2F' },
  { fase: 'R32', num: 12, fecha: 'Mié 1 Jul', hora: '20:00', sede: 'Estadio San Francisco',     clave_a: '2G', clave_b: '2H' },
  { fase: 'R32', num: 13, fecha: 'Jue 2 Jul', hora: '13:00', sede: 'Estadio Kansas City',       clave_a: '2I', clave_b: '2J' },
  { fase: 'R32', num: 14, fecha: 'Jue 2 Jul', hora: '17:00', sede: 'Estadio Miami',             clave_a: '2K', clave_b: '2L' },
  { fase: 'R32', num: 15, fecha: 'Jue 2 Jul', hora: '20:00', sede: 'Estadio Monterrey',         clave_a: '1I', clave_b: '1J' },
  { fase: 'R32', num: 16, fecha: 'Jue 2 Jul', hora: '22:00', sede: 'Estadio Guadalajara',       clave_a: '1K', clave_b: '1L' },
  { fase: 'OCT', num: 17, fecha: 'Sáb 4 Jul', hora: '13:00', sede: 'Estadio Filadelfia',        clave_a: 'G-R32-1', clave_b: 'G-R32-2' },
  { fase: 'OCT', num: 18, fecha: 'Sáb 4 Jul', hora: '17:00', sede: 'Estadio Nueva York/NJ',     clave_a: 'G-R32-3', clave_b: 'G-R32-4' },
  { fase: 'OCT', num: 19, fecha: 'Dom 5 Jul', hora: '13:00', sede: 'Estadio Boston',            clave_a: 'G-R32-5', clave_b: 'G-R32-6' },
  { fase: 'OCT', num: 20, fecha: 'Dom 5 Jul', hora: '17:00', sede: 'Estadio Atlanta',           clave_a: 'G-R32-7', clave_b: 'G-R32-8' },
  { fase: 'OCT', num: 21, fecha: 'Lun 6 Jul', hora: '13:00', sede: 'Estadio Houston',           clave_a: 'G-R32-9', clave_b: 'G-R32-10' },
  { fase: 'OCT', num: 22, fecha: 'Lun 6 Jul', hora: '17:00', sede: 'Estadio Los Ángeles',       clave_a: 'G-R32-11', clave_b: 'G-R32-12' },
  { fase: 'OCT', num: 23, fecha: 'Mar 7 Jul', hora: '15:00', sede: 'Estadio Ciudad de México',  clave_a: 'G-R32-13', clave_b: 'G-R32-14' },
  { fase: 'OCT', num: 24, fecha: 'Mar 7 Jul', hora: '19:00', sede: 'BC Place Vancouver',        clave_a: 'G-R32-15', clave_b: 'G-R32-16' },
  { fase: 'CUA', num: 25, fecha: 'Jue 9 Jul', hora: '14:00',  sede: 'Estadio Boston',           clave_a: 'G-OCT-17', clave_b: 'G-OCT-18' },
  { fase: 'CUA', num: 26, fecha: 'Jue 9 Jul', hora: '18:00',  sede: 'Estadio Los Ángeles',      clave_a: 'G-OCT-19', clave_b: 'G-OCT-20' },
  { fase: 'CUA', num: 27, fecha: 'Vie 10 Jul', hora: '14:00', sede: 'Estadio Kansas City',      clave_a: 'G-OCT-21', clave_b: 'G-OCT-22' },
  { fase: 'CUA', num: 28, fecha: 'Sáb 11 Jul', hora: '14:00', sede: 'Estadio Miami',            clave_a: 'G-OCT-23', clave_b: 'G-OCT-24' },
  { fase: 'SEM', num: 29, fecha: 'Mar 14 Jul', hora: '18:00', sede: 'Estadio Dallas',           clave_a: 'G-CUA-25', clave_b: 'G-CUA-26' },
  { fase: 'SEM', num: 30, fecha: 'Mié 15 Jul', hora: '18:00', sede: 'Estadio Atlanta',          clave_a: 'G-CUA-27', clave_b: 'G-CUA-28' },
  { fase: '3ER', num: 31, fecha: 'Sáb 18 Jul', hora: '14:00', sede: 'Estadio Miami',            clave_a: 'P-SEM-29', clave_b: 'P-SEM-30' },
  { fase: 'FIN', num: 32, fecha: 'Dom 19 Jul', hora: '14:00', sede: 'Estadio Nueva York/NJ',    clave_a: 'G-SEM-29', clave_b: 'G-SEM-30' },
];

function initSubTabsMundial() {
  document.querySelectorAll('.mundial-sub').forEach(btn => {
    btn.addEventListener('click', () => {
      const sub = btn.dataset.msub;
      document.querySelectorAll('.mundial-sub').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.mundial-sub-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('mundial-' + sub).classList.add('active');
    });
  });
}

function renderMundial() {
  if (!document.getElementById('mundial-grupos')) return;
  const stats = DATA.meta || {};
  const el = document.getElementById('mundial-stats');
  if (el) el.textContent = `${stats.partidos_jugados || 0} / ${stats.total_partidos || 72} partidos · Fase de Grupos`;
  renderMundialGrupos();
  renderMundialBracket();
}

function calcularGrupos() {
  const equipos = {};
  DATA.partidos.forEach(p => {
    if (p.num > 72) return;
    [p.local, p.visitante].forEach(eq => {
      if (!equipos[eq]) equipos[eq] = { equipo: eq, grupo: p.grupo, pj: 0, g: 0, e: 0, perd: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
    });
  });
  DATA.partidos.forEach(p => {
    if (p.num > 72) return;
    if (p.gol_local == null || p.gol_visit == null) return;
    const local = equipos[p.local];
    const visit = equipos[p.visitante];
    local.pj++; visit.pj++;
    local.gf += p.gol_local; local.gc += p.gol_visit;
    visit.gf += p.gol_visit; visit.gc += p.gol_local;
    if (p.gol_local > p.gol_visit) { local.g++; local.pts += 3; visit.perd++; }
    else if (p.gol_local < p.gol_visit) { visit.g++; visit.pts += 3; local.perd++; }
    else { local.e++; visit.e++; local.pts++; visit.pts++; }
  });
  Object.values(equipos).forEach(e => e.dg = e.gf - e.gc);
  const grupos = {};
  Object.values(equipos).forEach(e => {
    const key = (e.grupo || '').replace('Grupo ', '');
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(e);
  });
  Object.values(grupos).forEach(arr =>
    arr.sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.equipo.localeCompare(b.equipo))
  );
  Object.values(grupos).forEach(tabla => {
    const grupoTerminado = tabla.every(eq => eq.pj === 3);
    tabla.forEach((eq, idx) => {
      if (grupoTerminado) {
        if (idx <= 1)       eq.estado = 'confirmado';
        else if (idx === 2) eq.estado = 'tercero';
        else                eq.estado = 'eliminado';
        eq.posicion_fija = true;
      } else {
        const ptsMax = eq.pts + 3 * (3 - eq.pj);
        const otros = tabla.filter(o => o.equipo !== eq.equipo);
        const puedenSuperarme = otros.filter(o => (o.pts + 3 * (3 - o.pj)) > eq.pts).length;
        const arribaInalcanzable = otros.filter(o => o.pts > ptsMax).length;
        if (puedenSuperarme <= 1)         eq.estado = 'confirmado';
        else if (arribaInalcanzable >= 2) eq.estado = 'eliminado';
        else                              eq.estado = 'en-curso';
        eq.posicion_fija = false;
      }
    });
  });
  return grupos;
}

function renderMundialGrupos() {
  const cont = document.getElementById('mundial-grupos');
  if (!cont) return;
  const grupos = calcularGrupos();
  const letras = Object.keys(grupos).sort();
  cont.innerHTML = `
    <div class="grupos-grid">
      ${letras.map(letra => {
        const tabla = grupos[letra];
        return `
          <div class="grupo-card">
            <h3>Grupo ${letra}</h3>
            <table class="grupo-table">
              <thead>
                <tr><th>#</th><th>Equipo</th><th>PJ</th><th>DG</th><th>Pts</th></tr>
              </thead>
              <tbody>
                ${tabla.map((e, i) => {
                  let cls;
                  if (e.estado === 'confirmado') cls = 'clasif confirmado';
                  else if (e.estado === 'eliminado') cls = 'eliminado';
                  else if (i < 2) cls = 'clasif';
                  else if (i === 2) cls = 'tercero';
                  else cls = 'eliminado';
                  const dgClass = e.dg > 0 ? 'dg-plus' : (e.dg < 0 ? 'dg-minus' : '');
                  const dgTxt = (e.dg > 0 ? '+' : '') + e.dg;
                  let badge = '';
                  if (e.estado === 'confirmado') badge = ' <span class="badge-pasa">✓ PASA</span>';
                  else if (cls === 'tercero') badge = ' <span class="badge-tercero">POSIBLE 3°</span>';
                  return `
                    <tr class="${cls}">
                      <td style="text-align:center">${i+1}</td>
                      <td><span class="col-flag">${flag(e.equipo)}</span>${escapeHtml(e.equipo)}${badge}</td>
                      <td>${e.pj}</td>
                      <td class="${dgClass}">${dgTxt}</td>
                      <td>${e.pts}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    </div>
    <div class="grupos-leyenda">
      <span><i style="background:#D4EDDA"></i>Clasifican directo (1° y 2°)</span>
      <span><i style="background:#FFF6D9"></i>3° puede clasificar como mejor tercero</span>
      <span><i style="background:#E5E7EB"></i>Eliminado</span>
    </div>
  `;
}

function renderMundialBracket() {
  const cont = document.getElementById('mundial-bracket');
  if (!cont) return;
  const grupos = calcularGrupos();
  const resolverClave = (clave) => {
    if (!clave) return null;
    const m = clave.match(/^([12])([A-L])$/);
    if (m) {
      const pos = Number(m[1]) - 1;
      const letra = m[2];
      const eq = grupos[letra]?.[pos];
      if (!eq) return null;
      return { nombre: eq.equipo, confirmado: eq.posicion_fija === true };
    }
    return null;
  };
  const labelClave = (clave) => {
    const m = clave.match(/^([12])([A-L])$/);
    if (m) return `${m[1]}° Grupo ${m[2]}`;
    const m3 = clave.match(/^3°-(\d+)$/);
    if (m3) return `Mejor 3° #${m3[1]}`;
    const mg = clave.match(/^G-(R32|OCT|CUA|SEM)-(\d+)$/);
    if (mg) {
      const faseName = {R32:'R32', OCT:'Octavos', CUA:'Cuartos', SEM:'Semis'}[mg[1]];
      return `Ganador ${faseName} #${mg[2]}`;
    }
    const mp = clave.match(/^P-SEM-(\d+)$/);
    if (mp) return `Perdedor Semi #${mp[1]}`;
    return clave;
  };
  const renderTeam = (eq, claveOriginal) => {
    if (!eq) return `<span class="bracket-flag"></span><span class="bracket-name"><span class="bracket-pending-team">${labelClave(claveOriginal)}</span></span>`;
    const cls = eq.confirmado ? 'bracket-name confirmed' : 'bracket-name provisional';
    const star = eq.confirmado ? ' <span class="bracket-conf">✓</span>' : '';
    return `<span class="bracket-flag">${flag(eq.nombre)}</span><span class="${cls}">${escapeHtml(eq.nombre)}${star}</span>`;
  };
  const renderMatch = (p, isFinal) => {
    const eqA = resolverClave(p.clave_a);
    const eqB = resolverClave(p.clave_b);
    return `
      <div class="bracket-match pending${isFinal ? ' final' : ''}">
        <div class="bracket-team">
          ${renderTeam(eqA, p.clave_a)}
          <span class="bracket-score">—</span>
        </div>
        <div class="bracket-team">
          ${renderTeam(eqB, p.clave_b)}
          <span class="bracket-score">—</span>
        </div>
        <div class="bracket-meta">📅 ${p.fecha} · ${p.hora} · ${escapeHtml(p.sede)}</div>
      </div>
    `;
  };

  // ===== R32 con datos REALES (quién pasa) =====
  const R32REAL = (DATA.partidos || []).filter(p => p.fase === 'r32').sort((a, b) => (a.num || 0) - (b.num || 0));
  const renderR32Real = (p) => {
    const jug = p.jugado, g = p.ganador_real;
    const winL = jug && g === p.local, winV = jug && g === p.visitante;
    const cls = (w) => 'bracket-name' + (w ? ' confirmed' : (jug ? '' : ' provisional'));
    const st  = (w) => w ? ' <span class="bracket-conf">✓</span>' : '';
    return `
      <div class="bracket-match${jug ? ' played' : ''}">
        <div class="bracket-team">
          <span class="bracket-flag">${flag(p.local)}</span>
          <span class="${cls(winL)}">${escapeHtml(p.local)}${st(winL)}</span>
          <span class="bracket-score">${winL ? '✓' : '—'}</span>
        </div>
        <div class="bracket-team">
          <span class="bracket-flag">${flag(p.visitante)}</span>
          <span class="${cls(winV)}">${escapeHtml(p.visitante)}${st(winV)}</span>
          <span class="bracket-score">${winV ? '✓' : '—'}</span>
        </div>
        <div class="bracket-meta">📅 ${p.fecha} · ${p.hora}</div>
      </div>
    `;
  };

  // ===== Octavos: quién pasa de R32 según el cuadro oficial 2026 =====
  const r32byNum = {}; R32REAL.forEach(p => { r32byNum[p.num] = p; });
  const ganadorR32 = (num) => {
    const p = r32byNum[num];
    if (!p || !p.jugado) return null;
    return p.ganador_real || null;
  };
  const OCT_PAIRS = [
    { fecha: 'Sáb 4 Jul', a: 75, b: 78 }, { fecha: 'Sáb 4 Jul', a: 73, b: 76 },
    { fecha: 'Dom 5 Jul', a: 84, b: 83 }, { fecha: 'Dom 5 Jul', a: 82, b: 81 },
    { fecha: 'Lun 6 Jul', a: 74, b: 77 }, { fecha: 'Lun 6 Jul', a: 79, b: 80 },
    { fecha: 'Mar 7 Jul', a: 87, b: 86 }, { fecha: 'Mar 7 Jul', a: 85, b: 88 },
  ].map(o => ({ ...o, _oct: true }));
  const r32lbl = (num) => { const p = r32byNum[num]; return p ? `Pasa ${p.local}/${p.visitante}` : 'Pasa R32'; };
  const renderOctReal = (o) => {
    const ga = ganadorR32(o.a), gb = ganadorR32(o.b);
    const slot = (g, num) => g
      ? `<span class="bracket-flag">${flag(g)}</span><span class="bracket-name confirmed">${escapeHtml(g)} <span class="bracket-conf">✓</span></span>`
      : `<span class="bracket-flag"></span><span class="bracket-name"><span class="bracket-pending-team">${r32lbl(num)}</span></span>`;
    return `
      <div class="bracket-match">
        <div class="bracket-team">${slot(ga, o.a)}<span class="bracket-score">—</span></div>
        <div class="bracket-team">${slot(gb, o.b)}<span class="bracket-score">—</span></div>
        <div class="bracket-meta">📅 ${o.fecha}</div>
      </div>
    `;
  };

  const fases = [
    { key: 'R32', label: 'R32',     info: '28-30 jun · 1-2 jul' },
    { key: 'OCT', label: 'Octavos', info: '4-7 jul' },
    { key: 'CUA', label: 'Cuartos', info: '9-11 jul' },
    { key: 'SEM', label: 'Semis',   info: '14-15 jul' },
    { key: 'FIN', label: '🏆 Final', info: '19 jul' },
  ];
  const verticalHTML = `
    <div class="bracket-vertical">
      <div class="bracket-board">
        ${fases.map(f => `
          <div class="bracket-col">
            <div class="bracket-col-title">${f.label}</div>
            <div class="bracket-stage-info">${f.info}</div>
            ${f.key === 'R32' && R32REAL.length ? R32REAL.map(renderR32Real).join('') : f.key === 'OCT' && R32REAL.length ? OCT_PAIRS.map(renderOctReal).join('') : ELIMINATORIAS.filter(p => p.fase === f.key).map(p => renderMatch(p, f.key === 'FIN')).join('')}
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const byFase = {
    R32: ELIMINATORIAS.filter(p => p.fase === 'R32'),
    OCT: ELIMINATORIAS.filter(p => p.fase === 'OCT'),
    CUA: ELIMINATORIAS.filter(p => p.fase === 'CUA'),
    SEM: ELIMINATORIAS.filter(p => p.fase === 'SEM'),
    FIN: ELIMINATORIAS.filter(p => p.fase === 'FIN'),
  };
  const colHTML = (label, info, matches, isFinal) => `
    <div class="bracket-col${isFinal ? ' bracket-col-final' : ''}">
      <div class="bracket-col-title">${label}</div>
      <div class="bracket-stage-info">${info}</div>
      ${matches.map(p => (p && p._oct) ? renderOctReal(p) : (p && p.fase === 'r32') ? renderR32Real(p) : renderMatch(p, isFinal)).join('')}
    </div>
  `;
  const fin = byFase.FIN[0];
  const symmetricHTML = `
    <div class="bracket-symmetric">
      <div class="bracket-half bracket-half-left">
        ${colHTML('R32', '28 jun · 3 jul', (R32REAL.length ? R32REAL : byFase.R32).slice(0,8))}
        ${colHTML('Octavos', '4-7 jul', (R32REAL.length ? OCT_PAIRS : byFase.OCT).slice(0,4))}
        ${colHTML('Cuartos', '9-11 jul', byFase.CUA.slice(0,2))}
        ${colHTML('Semis', '14-15 jul', byFase.SEM.slice(0,1))}
      </div>
      <div class="bracket-center">
        <div class="bracket-trophy">🏆</div>
        ${fin ? colHTML('Final', '19 jul', [fin], true) : ''}
      </div>
      <div class="bracket-half bracket-half-right">
        ${colHTML('Semis', '14-15 jul', byFase.SEM.slice(1,2))}
        ${colHTML('Cuartos', '9-11 jul', byFase.CUA.slice(2,4))}
        ${colHTML('Octavos', '4-7 jul', (R32REAL.length ? OCT_PAIRS : byFase.OCT).slice(4,8))}
        ${colHTML('R32', '28 jun · 3 jul', (R32REAL.length ? R32REAL : byFase.R32).slice(8,16))}
      </div>
    </div>
  `;

  cont.innerHTML = `
    ${verticalHTML}
    ${symmetricHTML}
    <div class="bracket-leyenda">
      <span><i style="background:#2E7D32"></i>Ya jugado</span>
      <span><i style="background:#F26522"></i>Próximo partido</span>
      <span><i style="background:#B5B5B5"></i>Pendiente (depende de fase anterior)</span>
    </div>
  `;
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
  document.getElementById('capt-bota-fecha').value = bota.actualizado || '';
  const lideresTxt = (bota.lideres || []).map(l => {
    const g = (l.goles != null ? l.goles : bota.goles) || '';
    return `${l.nombre} - ${l.pais} - ${g}`;
  }).join('\n');
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
    const esKO = p.fase && p.fase !== 'grupos';
    const opts = esKO ? [
      { val: p.local, label: '🏠 ' + p.local },
      { val: p.visitante, label: '✈️ ' + p.visitante },
    ] : [
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
  msg.textContent = '⏳ Sincronizando con la nube...';
  msg.className = 'save-msg pending';

  // PROTECCIÓN: re-leer Firebase antes de guardar, para preservar datos
  // que estén en la nube pero que el panel no tenga cargados.
  let remote = null;
  try {
    const fbRes = await fetch(FIREBASE_URL + '/live.json?_=' + Date.now());
    if (!fbRes.ok) throw new Error('HTTP ' + fbRes.status);
    remote = await fbRes.json();
  } catch (e) {
    msg.textContent = '❌ No se pudo conectar a la nube. Revisa tu internet y reintenta.';
    msg.className = 'save-msg err';
    btn.disabled = false;
    return;
  }

  // Mergear: si Firebase tiene resultados que CAPT no tiene, agregarlos
  if (remote && remote.resultados) {
    const entries = Array.isArray(remote.resultados)
      ? remote.resultados.map((r, i) => [String(i), r])
      : Object.entries(remote.resultados);
    entries.forEach(([num, ganador]) => {
      if (!ganador) return;
      const p = CAPT.partidos.find(x => x.num === Number(num));
      if (p && !p.ganador_real) {
        p.ganador_real = ganador;
        p.jugado = true;
      }
    });
  }

  CAPT.meta.campeon_real  = (CAPT.meta.campeon_real  || '').trim() || null;
  CAPT.meta.goleador_real = (CAPT.meta.goleador_real || '').trim() || null;

  // Procesar Bota de Oro desde inputs
  const fecha = document.getElementById('capt-bota-fecha').value || null;
  const lideresTxt = document.getElementById('capt-bota-lideres').value || '';
  const lideres = lideresTxt.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const m = line.split(/\s*[-–—]\s*/);
      return {
        nombre: (m[0] || '').trim(),
        pais:   (m[1] || '').trim(),
        goles:  parseInt(m[2]) || 0,
      };
    })
    .filter(l => l.nombre && l.goles > 0);
  CAPT.meta.bota_de_oro = lideres.length > 0 ? { lideres, actualizado: fecha } : null;

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
