(function () {
  'use strict';
  var CFG = window.CONFIG || {}, FB = window.FB;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  var ROLES = { propietario: 'Propietario', guardia: 'Guardia', admin: 'Administrador' };

  var app = document.getElementById('app');
  app.innerHTML = '' +
'<div class="wrap">' +
'  <header class="bar">' +
'    <div class="brand"><span class="brand-e" id="hE"></span><h1 class="brand-u">Accesos</h1></div>' +
'    <div class="clock"><span class="shift" id="who" hidden></span><button type="button" class="btn small" id="out" data-act="logout" hidden>Salir</button></div>' +
'  </header>' +
'  <section id="login" class="stack" hidden>' +
'    <form id="f-login" class="panel-body" style="border:1px solid var(--line);border-radius:14px;background:var(--surface)" autocomplete="off" novalidate>' +
'      <p class="muted">Entre con la cuenta de administrador de Visitas.</p>' +
'      <div class="field"><label for="l-user">Usuario</label><input id="l-user" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="username"></div>' +
'      <div class="field"><label for="l-pin">Contraseña</label><input id="l-pin" type="password" autocomplete="current-password"></div>' +
'      <p class="err" id="l-err" role="alert" hidden></p>' +
'      <button type="submit" class="btn primary" id="l-go">Entrar</button>' +
'    </form>' +
'  </section>' +
'  <main id="panel" hidden>' +
'    <div class="stack">' +
'      <details class="panel" id="d-new" open>' +
'        <summary>Crear acceso</summary>' +
'        <form id="f-new" class="panel-body" autocomplete="off" novalidate>' +
'          <div class="field"><label for="n-role">Tipo de cuenta</label><select id="n-role"><option value="propietario">Propietario</option><option value="guardia">Guardia</option></select></div>' +
'          <div class="field" id="n-casa-box"><label for="n-casa">Casa o lote</label><input id="n-casa" type="text" placeholder="Mz 3 · Villa 12"></div>' +
'          <div class="field"><label for="n-nombre">Nombre</label><input id="n-nombre" type="text" placeholder="Nombre y apellido"></div>' +
'          <p class="err" id="n-err" role="alert" hidden></p>' +
'          <button type="submit" class="btn primary" id="n-go">Crear acceso</button>' +
'        </form>' +
'      </details>' +
'      <div id="cred"></div>' +
'      <div class="sumrow"><h2>Cuentas</h2><span class="muted" id="sum"></span></div>' +
'      <div class="field"><label for="filter">Buscar</label><input id="filter" type="search" placeholder="Casa, nombre o usuario" autocomplete="off" spellcheck="false"></div>' +
'      <ul class="rows" id="list"></ul>' +
'    </div>' +
'  </main>' +
'  <p class="notice warn" id="nofb" hidden>Falta configurar Firebase. Revise el archivo firebase-config.js.</p>' +
'</div>' +
'<div class="toast" id="toast" role="status" hidden></div>';

  $('#hE').textContent = (CFG.urbanizacion || 'Urbanización') + ' · ' + (CFG.etapa || 'Etapa');
  var toastEl = $('#toast'), toastT, me = null, ctx = null, unsub = null, users = [], busy = false;
  function toast(msg, kind) {
    toastEl.textContent = msg; toastEl.className = 'toast' + (kind ? ' ' + kind : ''); toastEl.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.hidden = true; }, 3500);
  }
  function show(inn) {
    $('#login').hidden = inn; $('#panel').hidden = !inn; $('#out').hidden = !inn;
    var w = $('#who'); w.hidden = !inn; w.textContent = me ? (me.nombre || me.usuario || 'Admin') : '';
  }
  function siteUrl(page) { return location.href.replace(/[^/]*([?#].*)?$/, '') + page; }

  function renderList() {
    var t = $('#filter').value.trim().toLowerCase();
    var list = users.filter(function (u) { return !t || [u.casa, u.nombre, u.usuario].join(' ').toLowerCase().indexOf(t) >= 0; })
      .sort(function (a, b) { return (a.role + (a.casa || '') + (a.nombre || '')).localeCompare(b.role + (b.casa || '') + (b.nombre || ''), 'es'); });
    var act = users.filter(function (u) { return u.activo === true; }).length;
    $('#sum').textContent = users.length + (users.length === 1 ? ' cuenta' : ' cuentas') + ' · ' + act + (act === 1 ? ' activa' : ' activas');
    $('#list').innerHTML = list.length ? list.map(function (u) {
      var self = me && u.uid === me.uid;
      return '<li><div class="row" style="grid-template-columns:minmax(0,1fr) auto"><span class="row-main"><b>' + esc(u.casa || u.nombre || u.usuario) + '</b>' +
        '<span>' + esc([ROLES[u.role] || u.role, u.nombre && u.casa ? u.nombre : '', u.usuario].filter(Boolean).join(' · ')) + '</span></span>' +
        '<span class="pills">' + (u.activo === true ? '<span class="pill ok">Activa</span>' : '<span class="pill warn">Desactivada</span>') +
        (self || u.role === 'admin' ? '' : '<button type="button" class="btn small" data-toggle="' + esc(u.uid) + '">' + (u.activo === true ? 'Desactivar' : 'Activar') + '</button>' +
          '<button type="button" class="btn small" data-renew="' + esc(u.uid) + '">Nuevo PIN</button>') + '</span></div></li>';
    }).join('') : '<li class="empty">Todavía no hay cuentas.</li>';
  }

  function credCard(title, usuario, pin, role) {
    var page = role === 'guardia' ? 'index.html#visitas' : 'propietario.html';
    var msg = 'Acceso a Visitas · ' + (CFG.urbanizacion || '') + ' ' + (CFG.etapa || '') + '\nPágina: ' + siteUrl(page) + '\nUsuario: ' + usuario + '\nPIN: ' + pin;
    $('#cred').innerHTML = '<div class="notice warn"><p><b>' + esc(title) + '</b></p>' +
      '<dl class="kv"><dt>Usuario</dt><dd>' + esc(usuario) + '</dd><dt>PIN</dt><dd>' + esc(pin) + '</dd></dl>' +
      '<p class="muted">Entregue estos datos ahora. El PIN no se vuelve a mostrar.</p>' +
      '<textarea id="cred-text" readonly rows="4" spellcheck="false" style="width:100%">' + esc(msg) + '</textarea>' +
      '<button type="button" class="btn small" data-act="copy">Copiar mensaje</button></div>';
    try { $('#cred').scrollIntoView({ block: 'nearest' }); } catch (e) {}
  }

  // Crea la cuenta de acceso y su ficha. Reintenta si el usuario ya existe.
  function makeUser(role, casa, nombre, tries) {
    var usuario = FB.genUsuario(role === 'guardia' ? 'guardia' : casa), pin = FB.genPin();
    return FB.createAccount(usuario, pin).then(function (uid) {
      return ctx.db.collection('usuarios').doc(uid).set({ role: role, casa: casa || '', nombre: nombre || '', usuario: usuario, activo: true, creado: Date.now() })
        .then(function () { return { usuario: usuario, pin: pin, uid: uid }; });
    }, function (e) {
      if (e && e.code === 'auth/email-already-in-use' && (tries || 0) < 4) return makeUser(role, casa, nombre, (tries || 0) + 1);
      throw e;
    });
  }

  function listen() {
    if (unsub) unsub();
    unsub = ctx.db.collection('usuarios').onSnapshot(function (snap) {
      users = snap.docs.map(function (d) { var o = d.data(); o.uid = d.id; return o; });
      renderList();
    }, function (e) { toast(FB.explain(e), 'bad'); });
  }
  function start() {
    if (!FB.ready) { $('#nofb').hidden = false; return; }
    $('#login').hidden = false;
    FB.watch(['admin'], function (p, c) {
      ctx = c; me = p;
      if (p) { show(true); listen(); } else { if (unsub) { unsub(); unsub = null; } users = []; show(false); }
    }).catch(function (e) { var er = $('#l-err'); er.textContent = FB.explain(e); er.hidden = false; });
  }

  $('#f-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var er = $('#l-err'), btn = $('#l-go'); er.hidden = true;
    var u = $('#l-user').value.trim(), p = $('#l-pin').value;
    if (!u || !p) { er.textContent = 'Escriba el usuario y la contraseña.'; er.hidden = false; return; }
    btn.disabled = true; btn.textContent = 'Entrando…';
    FB.signIn(u, p, ['admin']).then(function () { $('#l-pin').value = ''; }, function (x) { er.textContent = FB.explain(x); er.hidden = false; })
      .then(function () { btn.disabled = false; btn.textContent = 'Entrar'; });
  });
  $('#n-role').addEventListener('change', function (e) { $('#n-casa-box').hidden = e.target.value === 'guardia'; });
  $('#filter').addEventListener('input', renderList);

  $('#f-new').addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var er = $('#n-err'); er.hidden = true;
    var role = $('#n-role').value, casa = $('#n-casa').value.trim(), nombre = $('#n-nombre').value.trim();
    var fail = function (m) { er.textContent = m; er.hidden = false; };
    if (role === 'propietario' && !casa) return fail('Escriba la casa o lote.');
    if (!nombre) return fail('Escriba el nombre.');
    busy = true; $('#n-go').disabled = true; $('#n-go').textContent = 'Creando…';
    makeUser(role, role === 'guardia' ? '' : casa, nombre).then(function (r) {
      credCard('Acceso creado: ' + (casa || nombre), r.usuario, r.pin, role);
      $('#n-casa').value = ''; $('#n-nombre').value = '';
    }, function (x) { fail(FB.explain(x)); }).then(function () { busy = false; $('#n-go').disabled = false; $('#n-go').textContent = 'Crear acceso'; });
  });

  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-toggle],[data-renew],[data-act]');
    if (!t) return;
    if (t.dataset.toggle) {
      var u = users.filter(function (x) { return x.uid === t.dataset.toggle; })[0]; if (!u) return;
      t.disabled = true;
      ctx.db.collection('usuarios').doc(u.uid).update({ activo: u.activo !== true }).then(function () { toast(u.activo === true ? 'Cuenta desactivada' : 'Cuenta activada'); }, function (x) { t.disabled = false; toast(FB.explain(x), 'bad'); });
    } else if (t.dataset.renew) {
      var o = users.filter(function (x) { return x.uid === t.dataset.renew; })[0]; if (!o || busy) return;
      if (t.dataset.sure !== '1') { t.dataset.sure = '1'; t.textContent = 'Toque otra vez'; setTimeout(function () { t.dataset.sure = ''; t.textContent = 'Nuevo PIN'; }, 4000); return; }
      busy = true; t.disabled = true;
      makeUser(o.role, o.casa, o.nombre).then(function (r) {
        return ctx.db.collection('usuarios').doc(o.uid).update({ activo: false }).then(function () { credCard('Nuevo acceso: ' + (o.casa || o.nombre), r.usuario, r.pin, o.role); });
      }).catch(function (x) { toast(FB.explain(x), 'bad'); }).then(function () { busy = false; });
    } else if (t.dataset.act === 'copy') {
      var txt = $('#cred-text').value;
      try { navigator.clipboard.writeText(txt).then(function () { toast('Mensaje copiado'); }, function () { $('#cred-text').select(); toast('Seleccione y copie el texto', 'bad'); }); } catch (x) { $('#cred-text').select(); }
    } else if (t.dataset.act === 'logout') FB.signOut();
  });
  start();
})();
