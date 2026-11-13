(function () {
  'use strict';
  var CFG = window.CONFIG || {};
  var FILE = 'placas.csv';
  var SKEY = 'placas-admin-sesion';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }

  // ---------- Placas y CSV ----------
  var PLATE_OK = /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{5,8}$/;
  function norm(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function fmt(s) {
    var n = norm(s).slice(0, 7);
    var m = /^[A-Z]{3}/.test(n) ? 3 : (/^[A-Z]{2}\d/.test(n) ? 2 : 0);
    return (m && n.length > m) ? n.slice(0, m) + '-' + n.slice(m) : n;
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
    var sorted = list.slice().sort(function (a, b) { return norm(a.placa) < norm(b.placa) ? -1 : 1; });
    return ['placa,propietario,casa,vehiculo,nota,estado'].concat(sorted.map(function (r) {
      return [r.placa, r.propietario, r.casa, r.vehiculo, r.nota, r.activo === false ? 'inactivo' : 'activo'].map(qt).join(',');
    })).join('\n') + '\n';
  }
  function isExample(r) { return /^EJEMPLO\b/i.test(r.propietario || ''); }
  function b64dec(b) {
    var bin = atob(String(b).replace(/\s/g, ''));
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(arr);
  }
  function b64enc(s) {
    var arr = new TextEncoder().encode(s), bin = '';
    for (var i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin);
  }

  // ---------- Sesión y API de GitHub ----------
  var session = null, who = '';
  var rows = [], sha = null, baseCSV = '', editingN = '', busy = false;

  function readSession() {
    var s = null;
    try { s = JSON.parse(sessionStorage.getItem(SKEY) || localStorage.getItem(SKEY) || 'null'); } catch (e) {}
    return s && s.repo && s.token ? s : null;
  }
  function storeSession(s, remember) {
    try { sessionStorage.removeItem(SKEY); localStorage.removeItem(SKEY); } catch (e) {}
    try { (remember ? localStorage : sessionStorage).setItem(SKEY, JSON.stringify(s)); } catch (e) {}
  }
  function clearSession() { try { sessionStorage.removeItem(SKEY); localStorage.removeItem(SKEY); } catch (e) {} }
  function guessRepo() {
    var h = location.hostname, p = location.pathname.split('/')[1] || '';
    return /\.github\.io$/.test(h) && p && !/\.html?$/.test(p) ? h.split('.')[0] + '/' + p : '';
  }
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + session.token, 'X-GitHub-Api-Version': '2022-11-28' };
    var init = { method: opts.method || 'GET', headers: headers, cache: 'no-store' };
    if (opts.body) { init.body = JSON.stringify(opts.body); headers['Content-Type'] = 'application/json'; }
    return fetch('https://api.github.com' + path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.message || 'Error'); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function explain(err) {
    var s = err && err.status;
    if (s === 401) return 'El token no es válido o ya venció. Cree uno nuevo.';
    if (s === 403) return 'El token no tiene permiso, o GitHub limitó las solicitudes. Revise que tenga Contents: Read and write.';
    if (s === 404) return 'No se encontró el repositorio o el archivo. Revise el nombre (usuario/repositorio) y que el token tenga acceso a él.';
    if (s === 409 || s === 422) return 'Alguien cambió placas.csv mientras trabajaba. Recargue la lista y repita el cambio.';
    if (err && err.message === 'Failed to fetch') return 'No hay conexión con GitHub. Revise su internet.';
    return 'GitHub respondió con un error. Intente de nuevo.';
  }

  // ---------- Estructura ----------
  var app = document.getElementById('app');
  app.innerHTML = '' +
'<div class="wrap">' +
'  <header class="bar">' +
'    <div class="brand"><span class="brand-e" id="hE"></span><h1 class="brand-u">Administración</h1></div>' +
'    <div class="clock"><span class="shift" id="who" hidden></span><button type="button" class="btn small" id="out" data-act="logout" hidden>Salir</button></div>' +
'  </header>' +
'  <section id="login" class="stack">' +
'    <form id="f-login" class="panel-body" style="border:1px solid var(--line);border-radius:14px;background:var(--surface)" autocomplete="off" novalidate>' +
'      <p class="muted">Entre con el token de GitHub de la cuenta dueña del repositorio.</p>' +
'      <div class="field"><label for="l-repo">Repositorio</label><input id="l-repo" type="text" placeholder="usuario/control-placas" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
'      <div class="field"><label for="l-tok">Token de acceso</label><input id="l-tok" type="password" placeholder="github_pat_…" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off"></div>' +
'      <label class="check"><input id="l-rem" type="checkbox"><span>Recordar en este teléfono</span></label>' +
'      <p class="err" id="l-err" role="alert" hidden></p>' +
'      <button type="submit" class="btn primary" id="l-go">Entrar</button>' +
'    </form>' +
'    <details class="panel">' +
'      <summary>Cómo crear el token</summary>' +
'      <div class="panel-body">' +
'        <ol class="steps muted">' +
'          <li>En GitHub toque su foto, luego <b>Settings</b>, y al final <b>Developer settings</b>.</li>' +
'          <li>Entre a <b>Personal access tokens</b> y a <b>Fine-grained tokens</b>. Toque <b>Generate new token</b>.</li>' +
'          <li>Nombre: <b>control-placas</b>. Expiración: la más larga que permita (por ejemplo 1 año).</li>' +
'          <li>En <b>Repository access</b> elija <b>Only select repositories</b> y marque solo su repositorio de placas.</li>' +
'          <li>En <b>Permissions → Repository permissions</b> ponga <b>Contents: Read and write</b>.</li>' +
'          <li>Toque <b>Generate token</b>, copie el texto que empieza con <b>github_pat_</b> y péguelo arriba. GitHub no lo vuelve a mostrar.</li>' +
'        </ol>' +
'        <p class="muted">El token solo sirve para este repositorio. Quien lo tenga puede cambiar la lista, así que no lo comparta. Si se pierde, bórrelo en la misma pantalla de GitHub.</p>' +
'      </div>' +
'    </details>' +
'  </section>' +
'  <main id="panel" hidden>' +
'    <div class="stack">' +
'      <div class="sumrow"><h2>Vehículos</h2><span class="muted" id="sum"></span></div>' +
'      <div id="draft"></div>' +
'      <div id="ex"></div>' +
'      <details class="panel" id="d-add">' +
'        <summary id="addTitle">Agregar vehículo</summary>' +
'        <form id="f-add" class="panel-body" autocomplete="off" novalidate>' +
'          <div class="field"><label for="f-placa">Placa</label><input id="f-placa" type="text" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="8" placeholder="GAB-1234"></div>' +
'          <div class="field"><label for="f-prop">Propietario</label><input id="f-prop" type="text" placeholder="Nombre y apellido"></div>' +
'          <div class="field"><label for="f-casa">Casa o lote</label><input id="f-casa" type="text" placeholder="Mz 3 · Villa 12"></div>' +
'          <div class="field"><label for="f-veh">Vehículo</label><input id="f-veh" type="text" placeholder="Marca y color"></div>' +
'          <div class="field"><label for="f-nota">Nota</label><input id="f-nota" type="text" placeholder="Opcional"></div>' +
'          <label class="check"><input id="f-activo" type="checkbox" checked><span>Activo: se permite el ingreso</span></label>' +
'          <p class="err" id="f-err" role="alert" hidden></p>' +
'          <div class="actions"><button type="submit" class="btn primary">Guardar en la lista</button><button type="button" class="btn" data-act="f-cancel">Cancelar</button></div>' +
'          <button type="button" class="btn danger" data-act="f-del" id="f-del" hidden>Quitar este vehículo</button>' +
'        </form>' +
'      </details>' +
'      <div class="field"><label for="filter">Buscar</label><input id="filter" type="search" placeholder="Placa, propietario o casa" autocomplete="off" autocapitalize="off" spellcheck="false"></div>' +
'      <ul class="rows" id="list"></ul>' +
'      <p class="muted" id="more" hidden></p>' +
'      <details class="panel">' +
'        <summary>Importar lista</summary>' +
'        <div class="panel-body">' +
'          <p class="muted">Pegue filas de Excel o cargue un CSV con las columnas placa, propietario, casa, vehículo, nota y estado. Las placas nuevas se agregan y las existentes se actualizan.</p>' +
'          <div class="field"><label for="imp-file">Archivo CSV</label><input id="imp-file" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain"></div>' +
'          <div class="field"><label for="imp-text">O pegue aquí</label><textarea id="imp-text" rows="5" spellcheck="false" placeholder="GAB-1234;Nombre Apellido;Mz 3 Villa 12;Chevrolet Sail gris"></textarea></div>' +
'          <p class="muted" id="imp-pre" aria-live="polite"></p>' +
'          <button type="button" class="btn primary" data-act="imp-go" id="imp-go" disabled>Agregar a la lista</button>' +
'        </div>' +
'      </details>' +
'      <button type="button" class="btn" data-act="reload">Recargar desde GitHub</button>' +
'    </div>' +
'  </main>' +
'</div>' +
'<div class="toast" id="toast" role="status" hidden></div>';

  var toastEl = $('#toast'), listEl = $('#list'), filterEl = $('#filter');
  $('#hE').textContent = (CFG.urbanizacion || 'Urbanización') + ' · ' + (CFG.etapa || 'Etapa');

  var toastT;
  function toast(msg, kind, keep) {
    toastEl.textContent = msg;
    toastEl.className = 'toast' + (kind ? ' ' + kind : '');
    toastEl.hidden = false;
    clearTimeout(toastT);
    if (!keep) toastT = setTimeout(function () { toastEl.hidden = true; }, 3500);
  }

  // ---------- Lista ----------
  function dirty() { return toCSV(rows) !== baseCSV; }
  function renderTop() {
    var act = rows.filter(function (r) { return r.activo !== false; }).length;
    $('#sum').textContent = rows.length + (rows.length === 1 ? ' vehículo' : ' vehículos') + ' · ' + act + (act === 1 ? ' activo' : ' activos');
    var ex = rows.filter(isExample).length;
    $('#ex').innerHTML = ex ? '<div class="notice warn"><p>' + (ex === 1 ? 'Hay 1 registro de ejemplo' : 'Hay ' + ex + ' registros de ejemplo') + '.</p><button type="button" class="btn small" data-act="clear-ex">Quitar ejemplos</button></div>' : '';
    $('#draft').innerHTML = dirty()
      ? '<div class="notice warn"><p>Hay cambios sin publicar. Los guardias no los verán hasta que los publique.</p><div class="actions two" style="width:100%"><button type="button" class="btn primary" data-act="publish"' + (busy ? ' disabled' : '') + '>Publicar cambios</button><button type="button" class="btn" data-act="discard"' + (busy ? ' disabled' : '') + '>Descartar</button></div></div>'
      : '<p class="fresh">La lista está al día con GitHub.</p>';
  }
  function renderList() {
    var t = filterEl.value.trim().toLowerCase(), f = norm(t), list = rows;
    if (t) {
      list = rows.filter(function (r) {
        return (f && norm(r.placa).indexOf(f) >= 0) || (r.propietario || '').toLowerCase().indexOf(t) >= 0 || (r.casa || '').toLowerCase().indexOf(t) >= 0 || (r.vehiculo || '').toLowerCase().indexOf(t) >= 0;
      });
    }
    list = list.slice().sort(function (a, b) { return norm(a.placa) < norm(b.placa) ? -1 : 1; });
    var shown = list.slice(0, 100);
    listEl.innerHTML = shown.length ? shown.map(function (r) {
      return '<li><button type="button" class="row" data-edit="' + esc(norm(r.placa)) + '"><span class="chip">' + esc(fmt(r.placa)) + '</span>' +
        '<span class="row-main"><b>' + esc(r.propietario || 'Sin nombre') + '</b><span>' + esc([r.casa, r.vehiculo].filter(Boolean).join(' · ')) + '</span></span>' +
        '<span class="pills">' + (r.activo === false ? '<span class="pill warn">Inactivo</span>' : '') + '</span></button></li>';
    }).join('') : '<li class="empty">' + (rows.length ? 'Ningún vehículo coincide con la búsqueda.' : 'La lista está vacía. Agregue el primer vehículo.') + '</li>';
    var more = $('#more');
    more.hidden = list.length <= 100;
    more.textContent = 'Se muestran 100 de ' + list.length + '. Use el buscador para ver el resto.';
  }
  function renderAll() { renderTop(); renderList(); }

  // ---------- Entrar y cargar ----------
  function show(loggedIn) {
    $('#login').hidden = loggedIn;
    $('#panel').hidden = !loggedIn;
    $('#out').hidden = !loggedIn;
    var w = $('#who'); w.hidden = !loggedIn; w.textContent = who || (session ? session.repo : '');
  }
  function loadFile() {
    toast('Cargando…', '', true);
    return api('/repos/' + session.repo + '/contents/' + FILE).then(function (j) {
      var text = j.encoding === 'base64' ? b64dec(j.content) : '';
      rows = parseCSV(text).good;
      sha = j.sha;
      baseCSV = toCSV(rows);
      toastEl.hidden = true;
      renderAll();
    }, function (err) {
      if (err.status === 404) { rows = []; sha = null; baseCSV = toCSV(rows); toastEl.hidden = true; renderAll(); return; }
      throw err;
    });
  }
  function enter() {
    return api('/repos/' + session.repo).then(function (r) {
      if (r.permissions && r.permissions.push === false) throw Object.assign(new Error('sin permiso'), { status: 403 });
      return api('/user').then(function (u) { who = u.login || ''; }, function () { who = ''; });
    }).then(function () { show(true); return loadFile(); });
  }
  function logout() {
    clearSession(); session = null; who = ''; rows = []; sha = null; baseCSV = '';
    $('#l-tok').value = '';
    show(false);
  }

  // ---------- Formulario ----------
  function resetForm() {
    editingN = '';
    ['#f-placa', '#f-prop', '#f-casa', '#f-veh', '#f-nota'].forEach(function (s) { $(s).value = ''; });
    $('#f-activo').checked = true;
    $('#f-err').hidden = true;
    $('#f-del').hidden = true;
    $('#f-del').dataset.sure = '';
    $('#f-del').textContent = 'Quitar este vehículo';
    $('#addTitle').textContent = 'Agregar vehículo';
  }
  function find(n) { for (var i = 0; i < rows.length; i++) if (norm(rows[i].placa) === n) return i; return -1; }
  function startEdit(n) {
    var i = find(n); if (i < 0) return;
    var r = rows[i];
    resetForm();
    editingN = n;
    $('#f-placa').value = fmt(r.placa);
    $('#f-prop').value = r.propietario || '';
    $('#f-casa').value = r.casa || '';
    $('#f-veh').value = r.vehiculo || '';
    $('#f-nota').value = r.nota || '';
    $('#f-activo').checked = r.activo !== false;
    $('#f-del').hidden = false;
    $('#addTitle').textContent = 'Editar vehículo';
    var d = $('#d-add'); d.open = true;
    try { d.scrollIntoView({ block: 'start' }); } catch (e) {}
    $('#f-prop').focus();
  }
  function submitAdd() {
    var n = norm($('#f-placa').value), err = $('#f-err');
    err.hidden = true;
    var fail = function (m) { err.textContent = m; err.hidden = false; };
    if (!PLATE_OK.test(n)) return fail('Revise la placa. Ejemplo: GAB-1234.');
    var prop = $('#f-prop').value.trim();
    if (!prop) return fail('Escriba el nombre del propietario.');
    var j = find(n);
    if (j >= 0 && n !== editingN) return fail('Esa placa ya está en la lista. Búsquela y tóquela para editarla.');
    var rec = { placa: fmt(n), propietario: prop, casa: $('#f-casa').value.trim(), vehiculo: $('#f-veh').value.trim(), nota: $('#f-nota').value.trim(), activo: $('#f-activo').checked };
    var i = editingN ? find(editingN) : j;
    if (i >= 0) rows[i] = rec; else rows.push(rec);
    var was = !!editingN;
    resetForm();
    $('#f-placa').focus();
    renderAll();
    toast(was ? 'Cambio anotado. Falta publicar.' : 'Vehículo agregado. Falta publicar.');
  }
  var delT;
  function askDelete() {
    var b = $('#f-del');
    if (b.dataset.sure !== '1') {
      b.dataset.sure = '1';
      b.textContent = 'Toque de nuevo para quitar';
      clearTimeout(delT);
      delT = setTimeout(function () { b.dataset.sure = ''; b.textContent = 'Quitar este vehículo'; }, 4000);
      return;
    }
    var i = find(editingN);
    if (i >= 0) rows.splice(i, 1);
    resetForm();
    $('#d-add').open = false;
    renderAll();
    toast('Vehículo quitado. Falta publicar.');
  }

  // ---------- Importar ----------
  var imp = [];
  function previewImport() {
    var p = parseCSV($('#imp-text').value), seen = {}, nuevos = 0, act = 0;
    imp = p.good;
    imp.forEach(function (g) {
      var n = norm(g.placa);
      if (seen[n]) return;
      seen[n] = true;
      if (find(n) >= 0) act++; else nuevos++;
    });
    var total = nuevos + act;
    $('#imp-pre').textContent = total || p.bad
      ? total + (total === 1 ? ' placa válida' : ' placas válidas') + ' (' + nuevos + ' nuevas, ' + act + ' para actualizar).' + (p.bad ? ' ' + p.bad + (p.bad === 1 ? ' fila omitida' : ' filas omitidas') + ' por placa no válida.' : '')
      : '';
    $('#imp-go').disabled = !total;
  }
  function doImport() {
    imp.forEach(function (g) {
      var i = find(norm(g.placa));
      if (i >= 0) rows[i] = g; else rows.push(g);
    });
    $('#imp-text').value = ''; $('#imp-file').value = '';
    previewImport();
    renderAll();
    toast('Lista agregada. Falta publicar.');
  }

  // ---------- Publicar ----------
  function publish() {
    if (busy || !dirty()) return;
    busy = true; renderTop();
    toast('Publicando…', '', true);
    var csv = toCSV(rows);
    var body = { message: 'Actualizar placas (' + rows.length + ' vehículos)' + (who ? ' por ' + who : ''), content: b64enc(csv) };
    if (sha) body.sha = sha;
    api('/repos/' + session.repo + '/contents/' + FILE, { method: 'PUT', body: body }).then(function (j) {
      busy = false;
      sha = j.content && j.content.sha ? j.content.sha : sha;
      baseCSV = csv;
      renderAll();
      toast('Publicado. Los teléfonos lo reciben en 1 o 2 minutos.');
    }, function (err) {
      busy = false; renderTop();
      toast(explain(err), 'bad');
    });
  }

  // ---------- Eventos ----------
  $('#f-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var repo = $('#l-repo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    var tok = $('#l-tok').value.trim(), err = $('#l-err');
    err.hidden = true;
    var fail = function (m) { err.textContent = m; err.hidden = false; };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return fail('Escriba el repositorio como usuario/nombre, por ejemplo juan/control-placas.');
    if (tok.length < 20) return fail('Pegue el token completo.');
    session = { repo: repo, token: tok };
    var btn = $('#l-go'); btn.disabled = true; btn.textContent = 'Entrando…';
    enter().then(function () {
      storeSession(session, $('#l-rem').checked);
      $('#l-tok').value = '';
    }, function (er) {
      session = null; show(false);
      fail(explain(er));
    }).then(function () { btn.disabled = false; btn.textContent = 'Entrar'; });
  });
  $('#f-add').addEventListener('submit', function (e) { e.preventDefault(); submitAdd(); });
  $('#f-placa').addEventListener('input', function (e) { e.target.value = fmt(e.target.value); });
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
  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-edit],[data-act]');
    if (!t) return;
    if (t.dataset.edit) { startEdit(t.dataset.edit); return; }
    var a = t.dataset.act;
    if (a === 'logout') logout();
    else if (a === 'f-cancel') { resetForm(); $('#d-add').open = false; }
    else if (a === 'f-del') askDelete();
    else if (a === 'imp-go') doImport();
    else if (a === 'publish') publish();
    else if (a === 'discard') { rows = parseCSV(baseCSV).good; resetForm(); renderAll(); toast('Cambios descartados'); }
    else if (a === 'clear-ex') { rows = rows.filter(function (r) { return !isExample(r); }); renderAll(); toast('Ejemplos quitados. Falta publicar.'); }
    else if (a === 'reload') {
      if (dirty() && !confirmReload) { confirmReload = true; toast('Hay cambios sin publicar. Toque de nuevo para descartarlos y recargar.', 'bad'); setTimeout(function () { confirmReload = false; }, 4000); return; }
      confirmReload = false;
      loadFile().catch(function (er) { toast(explain(er), 'bad'); });
    }
  });
  var confirmReload = false;
  window.addEventListener('beforeunload', function (e) { if (session && dirty()) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- Arranque ----------
  $('#l-repo').value = guessRepo();
  show(false);
  var saved = readSession();
  if (saved) {
    session = saved;
    $('#l-repo').value = saved.repo;
    enter().catch(function (er) {
      session = null; show(false);
      $('#l-err').textContent = explain(er); $('#l-err').hidden = false;
    });
  }
})();
