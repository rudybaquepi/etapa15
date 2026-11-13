(function () {
  'use strict';
  var CFG = window.CONFIG || {};
  var CSV_URL = 'placas.csv';
  var CACHE_KEY = 'placas-cache-v1';
  var LOGKEY = 'control-placas-consultas';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // ---------- Lógica de placas ----------
  var PLATE_OK = /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{5,8}$/;
  function norm(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function fmt(s) {
    var n = norm(s).slice(0, 7);
    var m = /^[A-Z]{3}/.test(n) ? 3 : (/^[A-Z]{2}\d/.test(n) ? 2 : 0);
    return (m && n.length > m) ? n.slice(0, m) + '-' + n.slice(m) : n;
  }
  function lev1(a, b) {
    if (a === b) return true;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    var i = 0;
    while (i < la && i < lb && a[i] === b[i]) i++;
    if (la === lb) return a.slice(i + 1) === b.slice(i + 1);
    if (la > lb) return a.slice(i + 1) === b.slice(i);
    return a.slice(i) === b.slice(i + 1);
  }
  function splitLine(line, d) {
    var out = [], cur = '', inq = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (inq) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inq = false; }
        else cur += c;
      } else if (c === '"') inq = true;
      else if (c === d) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(function (s) { return s.trim(); });
  }
  function parseCSV(text) {
    var lines = String(text).replace(/^﻿/, '').replace(/\r/g, '').split('\n').filter(function (l) { return l.trim(); });
    var res = { good: [], bad: 0 };
    if (!lines.length) return res;
    var first = lines[0];
    var d = first.indexOf('\t') >= 0 ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
    lines.forEach(function (ln, i) {
      var c = splitLine(ln, d);
      if (i === 0 && /^PLACAS?$/.test(norm(c[0]))) return;
      var n = norm(c[0]);
      if (!PLATE_OK.test(n)) { res.bad++; return; }
      var est = (c[5] || '').toLowerCase();
      res.good.push({ placa: fmt(n), propietario: c[1] || '', casa: c[2] || '', vehiculo: c[3] || '', nota: c[4] || '', activo: !/^(no|0|inactivo|baja)$/.test(est) });
    });
    return res;
  }
  function toCSV(list) {
    var qt = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var lines = ['placa,propietario,casa,vehiculo,nota,estado'].concat(list.map(function (r) {
      return [r.placa, r.propietario, r.casa, r.vehiculo, r.nota, r.activo === false ? 'inactivo' : 'activo'].map(qt).join(',');
    }));
    return lines.join('\n') + '\n';
  }
  function isExample(r) { return /^EJEMPLO\b/i.test(r.propietario || ''); }

  // ---------- Estado ----------
  var rows = [], byN = {}, source = 'cargando', loadedAt = null;
  function setRows(list, src, when) {
    rows = list;
    byN = {};
    rows.forEach(function (r) { r._n = norm(r.placa); byN[r._n] = r; });
    source = src;
    loadedAt = when || null;
  }
  setRows([], 'cargando');

  function fmtDate(t) {
    if (!t) return '';
    try { return new Date(t).toLocaleString('es-EC', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }); } catch (e) { return ''; }
  }

  // ---------- Estructura ----------
  var app = document.getElementById('app');
  app.innerHTML = '' +
'<div class="wrap">' +
'  <header class="bar">' +
'    <div class="brand"><span class="brand-e" id="hE"></span><h1 class="brand-u" id="hU"></h1></div>' +
'    <div class="clock"><span class="time" id="hT">--:--</span><span class="shift" id="hS"></span></div>' +
'  </header>' +
'  <nav class="tabs" role="tablist" aria-label="Secciones">' +
'    <button type="button" class="tab" role="tab" id="tab-consultar" data-tab="consultar" aria-controls="p-consultar">Consultar</button>' +
'    <button type="button" class="tab" role="tab" id="tab-visitas" data-tab="visitas" aria-controls="p-visitas">Visitas<span class="count vbadge" id="vcnt" hidden>0</span></button>' +
'    <button type="button" class="tab" role="tab" id="tab-registro" data-tab="registro" aria-controls="p-registro">Registro<span class="count" id="cnt">0</span></button>' +
'  </nav>' +
'  <main>' +
'    <section id="p-consultar" role="tabpanel" aria-labelledby="tab-consultar">' +
'      <div class="stack">' +
'        <form id="qform" autocomplete="off" novalidate>' +
'          <label class="plate" for="q">' +
'            <span class="plate-top">Placa del vehículo</span>' +
'            <input id="q" type="text" inputmode="text" autocapitalize="characters" autocorrect="off" autocomplete="off" spellcheck="false" maxlength="8" placeholder="ABC-1234" enterkeyhint="search">' +
'          </label>' +
'          <div class="actions" style="margin-top:12px">' +
'            <button type="submit" class="btn primary">Consultar</button>' +
'            <button type="button" class="btn" data-act="clear">Borrar</button>' +
'          </div>' +
'        </form>' +
'        <p class="muted" id="hint">Escriba la placa. Los autos se consultan solos al completar 7 caracteres; las motos con el botón Consultar.</p>' +
'        <div id="sug"></div>' +
'        <div id="res" aria-live="polite"></div>' +
'        <details class="panel" id="logbox">' +
'          <summary id="logsum">Consultas recientes en este teléfono</summary>' +
'          <div class="panel-body">' +
'            <ul class="rows" id="loglist"></ul>' +
'            <div class="actions two">' +
'              <button type="button" class="btn small" data-act="copy-log">Copiar lista</button>' +
'              <button type="button" class="btn small" data-act="clear-log">Limpiar</button>' +
'            </div>' +
'          </div>' +
'        </details>' +
'        <p class="fresh" id="fresh"></p>' +
'      </div>' +
'    </section>' +
'    <section id="p-visitas" role="tabpanel" aria-labelledby="tab-visitas" hidden><div id="visitas-root"></div></section>' +
'    <section id="p-registro" role="tabpanel" aria-labelledby="tab-registro" hidden>' +
'      <div class="stack">' +
'        <div class="sumrow"><h2>Vehículos registrados</h2><span class="muted" id="sum"></span></div>' +
'        <div id="ex"></div>' +
'        <div class="field"><label for="filter">Buscar</label><input id="filter" type="search" placeholder="Placa, propietario o casa" autocomplete="off" autocapitalize="off" spellcheck="false"></div>' +
'        <ul class="rows" id="list"></ul>' +
'        <p class="muted" id="more" hidden></p>' +
'        <details class="panel">' +
'          <summary>Cómo actualizar la base</summary>' +
'          <div class="panel-body">' +
'            <ol class="steps muted">' +
'              <li>En GitHub abra el archivo <b>placas.csv</b> del repositorio y toque el lápiz para editarlo.</li>' +
'              <li>Agregue, corrija o borre filas. Una placa por fila: placa, propietario, casa, vehículo, nota y estado (activo o inactivo).</li>' +
'              <li>Guarde con <b>Commit changes</b>. En uno o dos minutos los teléfonos reciben la lista nueva.</li>' +
'            </ol>' +
'            <p class="muted">Si prefiere trabajar en Excel, use la herramienta de abajo: combina su lista con la actual y genera un placas.csv listo para subir.</p>' +
'          </div>' +
'        </details>' +
'        <details class="panel">' +
'          <summary>Combinar lista y generar CSV</summary>' +
'          <div class="panel-body">' +
'            <div class="field"><label for="imp-file">Archivo CSV</label><input id="imp-file" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain"></div>' +
'            <div class="field"><label for="imp-text">O pegue filas de Excel</label><textarea id="imp-text" rows="6" spellcheck="false" placeholder="GAB-1234;Nombre Apellido;Mz 3 Villa 12;Chevrolet Sail gris"></textarea></div>' +
'            <p class="muted" id="imp-pre" aria-live="polite"></p>' +
'            <div class="actions two">' +
'              <button type="button" class="btn primary" data-act="imp-dl" id="imp-dl" disabled>Descargar placas.csv</button>' +
'              <button type="button" class="btn" data-act="imp-copy" id="imp-copy" disabled>Copiar texto</button>' +
'            </div>' +
'            <p class="muted">Las placas nuevas se agregan, las que ya existen se actualizan y las demás se conservan. Las filas de ejemplo se descartan.</p>' +
'          </div>' +
'        </details>' +
'        <details class="panel">' +
'          <summary>Respaldo</summary>' +
'          <div class="panel-body">' +
'            <p class="muted">Copia de la lista que muestra este teléfono ahora.</p>' +
'            <div class="actions two">' +
'              <button type="button" class="btn" data-act="bk-dl">Descargar CSV</button>' +
'              <button type="button" class="btn" data-act="bk-copy">Copiar CSV</button>' +
'            </div>' +
'          </div>' +
'        </details>' +
'      </div>' +
'    </section>' +
'  </main>' +
'</div>' +
'<div class="toast" id="toast" role="status" hidden></div>';

  var q = $('#q'), resEl = $('#res'), sugEl = $('#sug'), hintEl = $('#hint'), freshEl = $('#fresh');
  var listEl = $('#list'), filterEl = $('#filter'), exEl = $('#ex'), toastEl = $('#toast');
  var HINT = hintEl.textContent;

  var ICON = {
    ok: '<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="23" fill="none" stroke="currentColor" stroke-width="4"/><path d="M14 27l8 8 16-17" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bad: '<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="23" fill="none" stroke="currentColor" stroke-width="4"/><path d="M17 17l18 18M35 17L17 35" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>',
    warn: '<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="23" fill="none" stroke="currentColor" stroke-width="4"/><path d="M26 14v15" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><circle cx="26" cy="37" r="3" fill="currentColor"/></svg>'
  };
  var VERDICT = {
    ok: ['Sí es de la etapa', 'Vehículo registrado y activo.'],
    bad: ['No es de la etapa', 'Placa no registrada. Aplicar el control de ingreso.'],
    warn: ['Registro inactivo', 'Está en la base pero figura inactivo. Confirmar con la administración antes de dejarlo pasar.']
  };
  var KT = { ok: 'Sí', bad: 'No', warn: 'Inactivo' };
  var KT_LONG = { ok: 'Sí es de la etapa', bad: 'No es de la etapa', warn: 'Registro inactivo' };

  // ---------- Consulta ----------
  function suggest(n) {
    if (n.length < 2) return [];
    var a = [], b = [];
    rows.forEach(function (r) {
      var i = r._n.indexOf(n);
      if (i === 0) a.push(r); else if (i > 0 && n.length >= 3) b.push(r);
    });
    return a.concat(b).slice(0, 6);
  }
  function near(n) {
    if (n.length < 5) return [];
    return rows.filter(function (r) { return r._n !== n && lev1(r._n, n); }).slice(0, 5);
  }
  function rowBtn(r) {
    return '<li><button type="button" class="row" data-plate="' + esc(r._n) + '"><span class="chip">' + esc(fmt(r._n)) + '</span>' +
      '<span class="row-main"><b>' + esc(r.casa || 'Sin casa') + '</b><span>' + esc(r.propietario || '') + '</span></span>' +
      '<span class="pills">' + (r.activo === false ? '<span class="pill warn">Inactivo</span>' : '') + '</span></button></li>';
  }
  function detailsHTML(r) {
    var items = [['Propietario', r.propietario], ['Casa', r.casa], ['Vehículo', r.vehiculo], ['Nota', r.nota]].filter(function (x) { return x[1]; });
    return items.length ? '<dl class="kv">' + items.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl>' : '';
  }
  function resultHTML(n, r, kind) {
    var v = VERDICT[kind];
    var body = '<span class="chip">' + esc(fmt(n)) + '</span>';
    if (r) {
      body += detailsHTML(r);
      if (isExample(r)) body += '<p class="tag-ex">Registro de ejemplo. No corresponde a un vehículo real.</p>';
    } else {
      var nr = near(n);
      if (nr.length) body += '<div><p class="near-t">Placas parecidas en la base. Compare letra por letra con la placa del vehículo.</p><ul class="rows">' + nr.map(rowBtn).join('') + '</ul></div>';
    }
    return '<article class="res ' + kind + '"><div class="band">' + ICON[kind] + '<div><div class="verdict">' + v[0] + '</div><div class="sub">' + v[1] + '</div></div></div><div class="body">' + body + '</div></article>';
  }
  function notReady() {
    if (source === 'cargando') { resEl.innerHTML = '<div class="notice warn"><p>Cargando la base de placas. Intente de nuevo en unos segundos.</p></div>'; return true; }
    if (source === 'error') { resEl.innerHTML = '<div class="notice warn"><p>No hay base de placas en este teléfono. Conéctese a internet una vez para descargarla.</p></div>'; return true; }
    return false;
  }
  function check(n) {
    if (notReady()) return;
    var r = byN[n];
    var kind = r ? (r.activo === false ? 'warn' : 'ok') : 'bad';
    var vb = (window.Visitas && window.Visitas.banner) ? window.Visitas.banner(n) : '';
    resEl.innerHTML = vb + resultHTML(n, r, kind);
    sugEl.innerHTML = '';
    hintEl.hidden = true;
    addLog(n, kind);
    q.blur();
    try { resEl.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  }
  function renderSug(n) {
    var s = suggest(n);
    if (s.length) sugEl.innerHTML = '<p class="near-t">Coincidencias en la base</p><ul class="rows">' + s.map(rowBtn).join('') + '</ul>';
    else if (n.length >= 3 && rows.length) sugEl.innerHTML = '<p class="near-t">Ninguna placa de la base empieza o contiene lo escrito.</p>';
    else sugEl.innerHTML = '';
  }
  function onType() {
    var n = norm(q.value).slice(0, 7);
    q.value = fmt(n);
    resEl.innerHTML = '';
    hintEl.textContent = HINT;
    hintEl.hidden = n.length > 0;
    renderSug(n);
    if (/^[A-Z]{3}\d{4}$/.test(n)) check(n);
  }
  function clearQuery() {
    q.value = '';
    resEl.innerHTML = '';
    sugEl.innerHTML = '';
    hintEl.textContent = HINT;
    hintEl.hidden = false;
    q.focus();
  }

  // ---------- Bitácora local ----------
  var log = [];
  try { log = JSON.parse(localStorage.getItem(LOGKEY) || '[]'); if (!Array.isArray(log)) log = []; } catch (e) { log = []; }
  function saveLog() { try { localStorage.setItem(LOGKEY, JSON.stringify(log.slice(-40))); } catch (e) {} }
  function hm(t) { var d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function addLog(n, kind) {
    var p = fmt(n), now = Date.now(), last = log[log.length - 1];
    if (last && last.p === p && now - last.t < 20000) return;
    log.push({ t: now, p: p, k: kind });
    if (log.length > 40) log = log.slice(-40);
    saveLog();
    renderLog();
  }
  function renderLog() {
    $('#logsum').textContent = 'Consultas recientes en este teléfono (' + log.length + ')';
    var items = log.slice().reverse();
    $('#loglist').innerHTML = items.length ? items.map(function (e) {
      return '<li class="logrow"><span class="lt">' + hm(e.t) + '</span><span class="chip">' + esc(e.p) + '</span><span class="pill ' + esc(e.k) + '">' + esc(KT[e.k] || '') + '</span></li>';
    }).join('') : '<li class="empty">Todavía no hay consultas.</li>';
  }

  // ---------- Registro ----------
  var PAGE = 100;
  function listRow(r) {
    return '<li><div class="row"><span class="chip">' + esc(fmt(r._n)) + '</span>' +
      '<span class="row-main"><b>' + esc(r.propietario || 'Sin nombre') + '</b><span>' + esc([r.casa, r.vehiculo].filter(Boolean).join(' · ')) + '</span></span>' +
      '<span class="pills">' + (r.activo === false ? '<span class="pill warn">Inactivo</span>' : '') + '</span></div></li>';
  }
  function renderList() {
    var t = filterEl.value.trim().toLowerCase(), f = norm(t), list = rows;
    if (t) {
      list = rows.filter(function (r) {
        return (f && r._n.indexOf(f) >= 0) || (r.propietario || '').toLowerCase().indexOf(t) >= 0 || (r.casa || '').toLowerCase().indexOf(t) >= 0 || (r.vehiculo || '').toLowerCase().indexOf(t) >= 0;
      });
    }
    list = list.slice().sort(function (a, b) { return a._n < b._n ? -1 : 1; });
    var shown = list.slice(0, PAGE);
    listEl.innerHTML = shown.length ? shown.map(listRow).join('') : '<li class="empty">' + (rows.length ? 'Ningún vehículo coincide con la búsqueda.' : 'La base está vacía.') + '</li>';
    var more = $('#more');
    more.hidden = list.length <= PAGE;
    more.textContent = 'Se muestran ' + PAGE + ' de ' + list.length + '. Use el buscador para ver el resto.';
  }
  function renderCounts() {
    var act = rows.filter(function (r) { return r.activo !== false; }).length;
    $('#cnt').textContent = rows.length;
    $('#sum').textContent = rows.length + (rows.length === 1 ? ' vehículo' : ' vehículos') + ' · ' + act + (act === 1 ? ' activo' : ' activos');
  }
  function renderStatus() {
    var ex = rows.filter(isExample).length;
    exEl.innerHTML = ex ? '<div class="notice warn"><p>' + (ex === 1 ? 'Hay 1 registro de ejemplo' : 'Hay ' + ex + ' registros de ejemplo') + ' en placas.csv. Reemplácelos con los datos reales.</p></div>' : '';
    freshEl.className = 'fresh';
    if (source === 'cargando') freshEl.textContent = 'Cargando la base…';
    else if (source === 'error') { freshEl.className = 'fresh warn'; freshEl.textContent = 'No se pudo cargar la base de placas.'; }
    else if (!rows.length) { freshEl.className = 'fresh warn'; freshEl.textContent = 'La base está vacía. Revise el archivo placas.csv.'; }
    else if (ex) { freshEl.className = 'fresh warn'; freshEl.textContent = 'La base incluye registros de ejemplo.'; }
    else if (source === 'cache') { freshEl.className = 'fresh warn'; freshEl.textContent = 'Sin conexión. Se usa la copia guardada el ' + fmtDate(loadedAt) + '.'; }
    else freshEl.textContent = 'Base descargada el ' + fmtDate(loadedAt) + '.';
  }
  function renderHead() {
    $('#hU').textContent = CFG.urbanizacion || 'Urbanización';
    $('#hE').textContent = CFG.etapa || 'Etapa';
    document.title = 'Control de Placas' + (CFG.etapa ? ' · ' + CFG.etapa : '');
  }
  function renderAll() { renderHead(); renderCounts(); renderStatus(); renderList(); renderLog(); }

  // ---------- Pestañas ----------
  function showTab(t) {
    ['consultar', 'visitas', 'registro'].forEach(function (k) {
      $('#p-' + k).hidden = k !== t;
      var b = $('#tab-' + k);
      b.setAttribute('aria-selected', String(k === t));
      b.tabIndex = k === t ? 0 : -1;
    });
  }
  function route() { showTab(location.hash === '#registro' ? 'registro' : location.hash === '#visitas' ? 'visitas' : 'consultar'); }

  // ---------- Reloj ----------
  function tick() {
    var d = new Date(), h = d.getHours();
    var a = CFG.horaInicio == null ? 21 : CFG.horaInicio, b = CFG.horaFin == null ? 6 : CFG.horaFin;
    var night = a > b ? (h >= a || h < b) : (h >= a && h < b);
    $('#hT').textContent = pad(h) + ':' + pad(d.getMinutes());
    var s = $('#hS');
    s.textContent = night ? 'Control nocturno' : 'Horario diurno';
    s.classList.toggle('night', night);
  }

  // ---------- Avisos, copiar y descargar ----------
  var toastT;
  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = 'toast' + (kind ? ' ' + kind : '');
    toastEl.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.hidden = true; }, 3500);
  }
  function copyText(t, okMsg) {
    var fail = function () { toast('No se pudo copiar. Use Descargar.', 'bad'); };
    try { navigator.clipboard.writeText(t).then(function () { toast(okMsg || 'Copiado'); }, fail); } catch (e) { fail(); }
  }
  function download(name, text) {
    try {
      var url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    } catch (e) { toast('No se pudo descargar. Use Copiar.', 'bad'); }
  }

  // ---------- Combinar lista ----------
  var merged = null;
  function previewImport() {
    var p = parseCSV($('#imp-text').value);
    var seen = {}, nuevos = 0, act = 0, map = {}, out = [];
    rows.filter(function (r) { return !isExample(r); }).forEach(function (r) { map[r._n] = { placa: r.placa, propietario: r.propietario, casa: r.casa, vehiculo: r.vehiculo, nota: r.nota, activo: r.activo !== false }; });
    p.good.forEach(function (g) {
      var n = norm(g.placa);
      if (!seen[n]) { seen[n] = true; if (map[n]) act++; else nuevos++; }
      map[n] = g;
    });
    Object.keys(map).sort().forEach(function (k) { out.push(map[k]); });
    var total = nuevos + act;
    merged = total ? out : null;
    $('#imp-pre').textContent = total || p.bad
      ? total + (total === 1 ? ' placa válida' : ' placas válidas') + ' (' + nuevos + ' nuevas, ' + act + ' ya existentes). El archivo final tendrá ' + out.length + ' filas.' + (p.bad ? ' ' + p.bad + (p.bad === 1 ? ' fila omitida' : ' filas omitidas') + ' por placa no válida.' : '')
      : '';
    $('#imp-dl').disabled = !total;
    $('#imp-copy').disabled = !total;
  }

  // ---------- Eventos ----------
  q.addEventListener('input', onType);
  filterEl.addEventListener('input', renderList);
  $('#imp-text').addEventListener('input', previewImport);
  $('#imp-file').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () { $('#imp-text').value = String(rd.result || ''); previewImport(); };
    rd.onerror = function () { toast('No se pudo leer el archivo.', 'bad'); };
    rd.readAsText(f);
  });
  $('#qform').addEventListener('submit', function (e) {
    e.preventDefault();
    var n = norm(q.value).slice(0, 7);
    if (n.length < 3) { hintEl.hidden = false; hintEl.textContent = 'Escriba al menos 3 caracteres de la placa.'; return; }
    check(n);
  });
  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-tab],[data-plate],[data-act]');
    if (!t) return;
    if (t.dataset.tab) { try { location.hash = t.dataset.tab; } catch (x) {} showTab(t.dataset.tab); return; }
    if (t.dataset.plate) { var n = t.dataset.plate; q.value = fmt(n); check(n); return; }
    var a = t.dataset.act;
    if (a === 'clear') clearQuery();
    else if (a === 'copy-log') copyText(log.slice().reverse().map(function (x) { return hm(x.t) + ' ' + x.p + ' ' + (KT_LONG[x.k] || ''); }).join('\n') || 'Sin consultas', 'Lista copiada');
    else if (a === 'clear-log') { log = []; saveLog(); renderLog(); }
    else if (a === 'imp-dl' && merged) download('placas.csv', toCSV(merged));
    else if (a === 'imp-copy' && merged) copyText(toCSV(merged), 'CSV copiado');
    else if (a === 'bk-dl') download('placas-respaldo.csv', toCSV(rows));
    else if (a === 'bk-copy') copyText(toCSV(rows), 'CSV copiado');
  });
  window.addEventListener('hashchange', route);

  // ---------- Carga de la base ----------
  function load() {
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) {}
    fetch(CSV_URL + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.text();
    }).then(function (text) {
      var p = parseCSV(text);
      if (!p.good.length) throw new Error('vacío');
      var now = Date.now();
      setRows(p.good, 'red', now);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: now, csv: text })); } catch (e) {}
      renderAll();
    }).catch(function () {
      if (cached && cached.csv) {
        var p = parseCSV(cached.csv);
        if (p.good.length) { setRows(p.good, 'cache', cached.t); renderAll(); return; }
      }
      setRows([], 'error');
      renderAll();
    });
  }

  renderAll();
  route();
  tick();
  setInterval(tick, 20000);
  load();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
