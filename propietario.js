(function () {
  'use strict';
  var CFG = window.CONFIG || {}, FB = window.FB;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(t) { var d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function dayLabel(t) {
    var d = new Date(t), n = new Date(), a = new Date(d.getFullYear(), d.getMonth(), d.getDate()), b = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    var diff = Math.round((a - b) / 86400000);
    return diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : diff === -1 ? 'Ayer' : d.toLocaleDateString('es-EC', { day: 'numeric', month: 'short' });
  }
  var TIPOS = { visita: 'Visita', domicilio: 'Domicilio', servicio: 'Servicio técnico', otro: 'Otro' };
  var ESTADOS = { esperada: ['Esperada', 'warn'], llego: ['Ya ingresó', 'ok'], cancelada: ['Cancelada', ''], rechazada: ['No autorizada por el guardia', 'bad'] };

  var app = document.getElementById('app');
  app.innerHTML = '' +
'<div class="wrap">' +
'  <header class="bar">' +
'    <div class="brand"><span class="brand-e" id="hE"></span><h1 class="brand-u">Anunciar visita</h1></div>' +
'    <div class="clock"><span class="shift" id="who" hidden></span><button type="button" class="btn small" id="out" data-act="logout" hidden>Salir</button></div>' +
'  </header>' +
'  <section id="login" class="stack" hidden>' +
'    <form id="f-login" class="panel-body" style="border:1px solid var(--line);border-radius:14px;background:var(--surface)" autocomplete="off" novalidate>' +
'      <p class="muted">Entre con el usuario y el PIN que le dio la administración.</p>' +
'      <div class="field"><label for="l-user">Usuario</label><input id="l-user" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="username"></div>' +
'      <div class="field"><label for="l-pin">PIN</label><input id="l-pin" type="password" inputmode="numeric" autocomplete="current-password"></div>' +
'      <p class="err" id="l-err" role="alert" hidden></p>' +
'      <button type="submit" class="btn primary" id="l-go">Entrar</button>' +
'    </form>' +
'  </section>' +
'  <main id="panel" hidden>' +
'    <div class="stack">' +
'      <form id="f-visit" class="panel-body" style="border:1px solid var(--line);border-radius:14px;background:var(--surface)" autocomplete="off" novalidate>' +
'        <p class="muted" id="casa-line"></p>' +
'        <div class="field"><label for="v-nom">Nombre del visitante</label><input id="v-nom" type="text" maxlength="80" placeholder="Nombre y apellido" autocomplete="off"></div>' +
'        <div class="field"><label for="v-tipo">Tipo</label><select id="v-tipo"><option value="visita">Visita</option><option value="domicilio">Domicilio</option><option value="servicio">Servicio técnico</option><option value="otro">Otro</option></select></div>' +
'        <div class="field"><label for="v-placa">Placa del vehículo (si viene en auto o moto)</label><input id="v-placa" type="text" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="8" placeholder="ABC-1234"></div>' +
'        <div class="field"><label for="v-cuando">Llega</label><select id="v-cuando"><option value="0">Ahora</option><option value="30">En 30 minutos</option><option value="60">En 1 hora</option><option value="120">En 2 horas</option><option value="otra">A otra hora</option></select></div>' +
'        <div class="field" id="v-hora-box" hidden><label for="v-hora">Hora</label><input id="v-hora" type="time"></div>' +
'        <div class="field"><label for="v-nota">Nota para el guardia (opcional)</label><input id="v-nota" type="text" maxlength="200" placeholder="Ejemplo: viene con un familiar"></div>' +
'        <p class="err" id="v-err" role="alert" hidden></p>' +
'        <button type="submit" class="btn primary" id="v-go">Avisar al guardia</button>' +
'      </form>' +
'      <div class="sumrow"><h2>Mis avisos</h2><span class="muted" id="sum"></span></div>' +
'      <ul class="rows" id="list"></ul>' +
'    </div>' +
'  </main>' +
'  <p class="notice warn" id="nofb" hidden>Esta función aún no está configurada. Avise a la administración.</p>' +
'</div>' +
'<div class="toast" id="toast" role="status" hidden></div>';

  $('#hE').textContent = (CFG.urbanizacion || 'Urbanización') + ' · ' + (CFG.etapa || 'Etapa');
  var toastEl = $('#toast'), toastT, me = null, ctx = null, unsub = null, visits = [], busy = false;
  function toast(msg, kind) {
    toastEl.textContent = msg; toastEl.className = 'toast' + (kind ? ' ' + kind : ''); toastEl.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.hidden = true; }, 3500);
  }
  function show(loggedIn) {
    $('#login').hidden = loggedIn; $('#panel').hidden = !loggedIn; $('#out').hidden = !loggedIn;
    var w = $('#who'); w.hidden = !loggedIn; w.textContent = me ? (me.casa || me.nombre || '') : '';
  }

  function renderList() {
    var now = Date.now(), sorted = visits.slice().sort(function (a, b) { return b.esperadaPara - a.esperadaPara; });
    var open = sorted.filter(function (v) { return v.estado === 'esperada' && v.esperadaPara > now - 12 * 3600000; }).length;
    $('#sum').textContent = open ? open + (open === 1 ? ' esperada' : ' esperadas') : '';
    $('#list').innerHTML = sorted.length ? sorted.slice(0, 40).map(function (v) {
      var vencida = v.estado === 'esperada' && v.esperadaPara <= now - 12 * 3600000;
      var st = vencida ? ['Vencida', ''] : (ESTADOS[v.estado] || [v.estado, '']);
      var canCancel = v.estado === 'esperada' && !vencida;
      return '<li><div class="row" style="grid-template-columns:minmax(0,1fr) auto">' +
        '<span class="row-main"><b>' + esc(v.visitante) + '</b><span>' + esc(dayLabel(v.esperadaPara) + ' ' + hm(v.esperadaPara) + ' · ' + (TIPOS[v.tipo] || '') + (v.placa ? ' · ' + FB.fmtPlate(v.placa) : '')) + '</span>' +
        (v.nota ? '<span>' + esc(v.nota) + '</span>' : '') + '</span>' +
        '<span class="pills"><span class="pill ' + st[1] + '">' + esc(st[0]) + '</span>' +
        (canCancel ? '<button type="button" class="btn small" data-cancel="' + esc(v.id) + '">Cancelar</button>' : '') + '</span></div></li>';
    }).join('') : '<li class="empty">Todavía no ha anunciado visitas.</li>';
  }

  function listen() {
    if (unsub) unsub();
    unsub = ctx.db.collection('visitas').where('propietarioUid', '==', me.uid).onSnapshot(function (snap) {
      visits = snap.docs.map(function (d) { var o = d.data(); o.id = d.id; return o; });
      renderList();
    }, function (e) { toast(FB.explain(e), 'bad'); });
  }

  function start() {
    if (!FB.ready) { $('#nofb').hidden = false; return; }
    show(false); $('#login').hidden = false;
    FB.watch(['propietario'], function (p, c) {
      ctx = c; me = p;
      if (p) { $('#casa-line').textContent = 'Casa: ' + (p.casa || '—') + (p.nombre ? ' · ' + p.nombre : ''); show(true); listen(); }
      else { if (unsub) { unsub(); unsub = null; } visits = []; show(false); }
    }).catch(function (e) { var er = $('#l-err'); er.textContent = FB.explain(e); er.hidden = false; $('#login').hidden = false; });
  }

  $('#f-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var er = $('#l-err'), btn = $('#l-go'); er.hidden = true;
    var u = $('#l-user').value.trim(), p = $('#l-pin').value.trim();
    if (!u || !p) { er.textContent = 'Escriba el usuario y el PIN.'; er.hidden = false; return; }
    btn.disabled = true; btn.textContent = 'Entrando…';
    FB.signIn(u, p, ['propietario']).then(function () { $('#l-pin').value = ''; }, function (x) { er.textContent = FB.explain(x); er.hidden = false; })
      .then(function () { btn.disabled = false; btn.textContent = 'Entrar'; });
  });
  $('#v-placa').addEventListener('input', function (e) { e.target.value = FB.fmtPlate(e.target.value); });
  $('#v-cuando').addEventListener('change', function (e) { $('#v-hora-box').hidden = e.target.value !== 'otra'; });

  $('#f-visit').addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy || !me) return;
    var er = $('#v-err'); er.hidden = true;
    var fail = function (m) { er.textContent = m; er.hidden = false; };
    var nom = $('#v-nom').value.trim();
    if (!nom) return fail('Escriba el nombre del visitante.');
    var placa = FB.norm($('#v-placa').value);
    if (placa && !/^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{5,8}$/.test(placa)) return fail('Revise la placa. Ejemplo: GAB-1234. Déjela vacía si viene a pie.');
    var cuando = $('#v-cuando').value, t = Date.now();
    if (cuando === 'otra') {
      var h = $('#v-hora').value;
      if (!/^\d{2}:\d{2}$/.test(h)) return fail('Elija la hora de llegada.');
      var d = new Date(); d.setHours(+h.slice(0, 2), +h.slice(3), 0, 0);
      if (d.getTime() < t - 5 * 60000) d.setDate(d.getDate() + 1);
      t = d.getTime();
    } else t += (+cuando) * 60000;
    busy = true; $('#v-go').disabled = true;
    ctx.db.collection('visitas').add({
      casa: me.casa || '', propietarioUid: me.uid, propietarioNombre: me.nombre || '',
      visitante: nom, placa: placa, tipo: $('#v-tipo').value, nota: $('#v-nota').value.trim(),
      esperadaPara: t, estado: 'esperada', creada: ctx.firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      ['#v-nom', '#v-placa', '#v-nota', '#v-hora'].forEach(function (s) { $(s).value = ''; });
      $('#v-cuando').value = '0'; $('#v-hora-box').hidden = true; $('#v-tipo').value = 'visita';
      toast('Aviso enviado al guardia');
    }, function (x) { fail(FB.explain(x)); }).then(function () { busy = false; $('#v-go').disabled = false; });
  });

  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-cancel],[data-act]');
    if (!t) return;
    if (t.dataset.cancel) {
      t.disabled = true;
      ctx.db.collection('visitas').doc(t.dataset.cancel).update({ estado: 'cancelada', actualizada: Date.now() }).then(function () { toast('Visita cancelada'); }, function (x) { t.disabled = false; toast(FB.explain(x), 'bad'); });
    } else if (t.dataset.act === 'logout') FB.signOut();
  });

  start();
})();
