// Pestaña "Visitas" de la app del guardia. Se carga después de app.js.
(function () {
  'use strict';
  var FB = window.FB, root = document.getElementById('visitas-root');
  if (!FB || !root) return;

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(t) { var d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  var TIPOS = { visita: 'Visita', domicilio: 'Domicilio', servicio: 'Servicio técnico', otro: 'Otro' };
  var VENCE = 12 * 3600000;

  var lastErr = '', me = null, ctx = null, unsub = null, visits = [], first = true, wake = null, audio = null;

  function pending(now) {
    now = now || Date.now();
    return visits.filter(function (v) { return v.estado === 'esperada' && v.esperadaPara > now - VENCE; })
      .sort(function (a, b) { return a.esperadaPara - b.esperadaPara; });
  }

  // ---------- Avisos (sonido, vibración, mensaje) ----------
  function unlockAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) {}
  }
  document.addEventListener('click', unlockAudio, { passive: true });
  document.addEventListener('touchstart', unlockAudio, { passive: true });
  function beep() {
    try {
      if (!audio) return;
      [0, 0.25, 0.5].forEach(function (d) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = 'sine'; o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
        var t = audio.currentTime + d;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.start(t); o.stop(t + 0.2);
      });
    } catch (e) {}
  }
  var alertEl = null, alertT;
  function alertNew(v) {
    beep();
    try { navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 300]); } catch (e) {}
    if (!alertEl) { alertEl = document.createElement('div'); alertEl.className = 'toast visit'; alertEl.setAttribute('role', 'alert'); alertEl.tabIndex = 0; document.body.appendChild(alertEl); alertEl.addEventListener('click', function () { alertEl.hidden = true; location.hash = 'visitas'; }); }
    alertEl.innerHTML = '<b>Nueva visita para ' + esc(v.casa) + '</b><br>' + esc(v.visitante) + (v.placa ? ' · ' + esc(FB.fmtPlate(v.placa)) : '') + '<br><small>Toque para ver</small>';
    alertEl.hidden = false;
    clearTimeout(alertT); alertT = setTimeout(function () { alertEl.hidden = true; }, 12000);
  }

  // ---------- Pantalla pegada ----------
  function keepAwake() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then(function (w) { wake = w; w.addEventListener('release', function () { wake = null; }); }, function () {});
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && me && !wake) keepAwake(); });

  // ---------- Dibujo ----------
  function card(v) {
    var late = v.esperadaPara < Date.now() - 30 * 60000;
    return '<article class="vcard"><div class="vhead"><b>' + esc(v.casa) + '</b><span class="pill ' + (late ? 'warn' : 'ok') + '">' + (late ? 'Hora pasada' : 'Esperada') + ' · ' + hm(v.esperadaPara) + '</span></div>' +
      '<dl class="kv"><dt>Visitante</dt><dd>' + esc(v.visitante) + '</dd>' +
      '<dt>Tipo</dt><dd>' + esc(TIPOS[v.tipo] || '') + '</dd>' +
      (v.placa ? '<dt>Placa</dt><dd><span class="chip" style="font-size:22px">' + esc(FB.fmtPlate(v.placa)) + '</span></dd>' : '') +
      '<dt>Anunció</dt><dd>' + esc(v.propietarioNombre || 'Propietario') + '</dd>' +
      (v.nota ? '<dt>Nota</dt><dd>' + esc(v.nota) + '</dd>' : '') + '</dl>' +
      '<div class="actions two"><button type="button" class="btn primary" data-vact="llego" data-vid="' + esc(v.id) + '">Ingresó</button>' +
      '<button type="button" class="btn danger" data-vact="rechazada" data-vid="' + esc(v.id) + '">Rechazar</button></div></article>';
  }
  var DONE = { llego: ['Ingresó', 'ok'], rechazada: ['Rechazada', 'bad'], cancelada: ['Canceló el propietario', ''] };
  function render() {
    if (!FB.ready) { root.innerHTML = '<p class="notice warn">Las visitas aún no están configuradas. Falta completar firebase-config.js.</p>'; setBadge(0); return; }
    if (!me) {
      root.innerHTML = '<form id="vlogin" class="panel-body" style="border:1px solid var(--line);border-radius:14px;background:var(--surface)" autocomplete="off" novalidate>' +
        '<p class="muted">Entre con la cuenta de guardia para recibir los avisos de visitas.</p>' +
        '<div class="field"><label for="vl-user">Usuario</label><input id="vl-user" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="username"></div>' +
        '<div class="field"><label for="vl-pin">PIN</label><input id="vl-pin" type="password" inputmode="numeric" autocomplete="current-password"></div>' +
        '<p class="err" id="vl-err" role="alert"' + (lastErr ? '' : ' hidden') + '>' + esc(lastErr) + '</p><button type="submit" class="btn primary" id="vl-go">Entrar</button></form>';
      setBadge(0); return;
    }
    var now = Date.now(), p = pending(now);
    var done = visits.filter(function (v) { return p.indexOf(v) < 0; }).sort(function (a, b) { return b.esperadaPara - a.esperadaPara; }).slice(0, 25);
    root.innerHTML = '<div class="stack">' +
      '<div class="sumrow"><h2>Visitas esperadas</h2><span class="muted">' + p.length + (p.length === 1 ? ' pendiente' : ' pendientes') + '</span></div>' +
      (p.length ? p.map(card).join('') : '<p class="muted">No hay visitas pendientes. Los avisos aparecen aquí solos.</p>') +
      '<details class="panel"><summary>Atendidas y vencidas (' + done.length + ')</summary><div class="panel-body"><ul class="rows">' +
      (done.length ? done.map(function (v) {
        var st = v.estado === 'esperada' ? ['Vencida', ''] : (DONE[v.estado] || [v.estado, '']);
        return '<li><div class="row" style="grid-template-columns:minmax(0,1fr) auto"><span class="row-main"><b>' + esc(v.visitante) + '</b><span>' + esc(v.casa + ' · ' + hm(v.esperadaPara) + (v.placa ? ' · ' + FB.fmtPlate(v.placa) : '')) + '</span></span><span class="pill ' + st[1] + '">' + esc(st[0]) + '</span></div></li>';
      }).join('') : '<li class="empty">Sin historial todavía.</li>') + '</ul></div></details>' +
      '<div class="actions two"><button type="button" class="btn small" data-vact="sound">Probar sonido</button><button type="button" class="btn small" data-vact="logout">Salir</button></div>' +
      '<p class="muted">Mantenga la app abierta y el teléfono encendido durante el turno para recibir los avisos.</p></div>';
    setBadge(p.length);
  }
  function setBadge(n) {
    var b = document.getElementById('vcnt');
    if (b) { b.textContent = n; b.hidden = !n; }
  }

  // ---------- Datos en vivo ----------
  function listen() {
    if (unsub) unsub();
    first = true;
    unsub = ctx.db.collection('visitas').orderBy('esperadaPara', 'desc').limit(80).onSnapshot(function (snap) {
      visits = snap.docs.map(function (d) { var o = d.data(); o.id = d.id; return o; });
      if (!first) snap.docChanges().forEach(function (c) {
        var v = c.doc.data();
        if (c.type === 'added' && v.estado === 'esperada' && !c.doc.metadata.hasPendingWrites) alertNew(v);
      });
      first = false;
      render();
    }, function () { render(); });
  }
  function startWatch() {
    if (!FB.ready) { render(); return; }
    render();
    FB.watch(['guardia', 'admin'], function (p, c, why) {
      ctx = c; me = p; lastErr = why ? FB.explain(why) : '';
      if (p) { listen(); keepAwake(); } else { if (unsub) { unsub(); unsub = null; } visits = []; render(); }
    }).catch(function () { /* sin conexión: la consulta de placas sigue funcionando */ });
  }

  // ---------- Acciones ----------
  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'vlogin') return;
    e.preventDefault(); unlockAudio();
    var er = document.getElementById('vl-err'), btn = document.getElementById('vl-go'); er.hidden = true;
    var u = document.getElementById('vl-user').value.trim(), p = document.getElementById('vl-pin').value.trim();
    if (!u || !p) { er.textContent = 'Escriba el usuario y el PIN.'; er.hidden = false; return; }
    btn.disabled = true; btn.textContent = 'Entrando…';
    FB.signIn(u, p, ['guardia', 'admin']).catch(function (x) { er.textContent = FB.explain(x); er.hidden = false; btn.disabled = false; btn.textContent = 'Entrar'; });
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-vact]');
    if (!t) return;
    var a = t.dataset.vact;
    if (a === 'sound') { unlockAudio(); beep(); try { navigator.vibrate && navigator.vibrate(200); } catch (x) {} return; }
    if (a === 'logout') { FB.signOut(); return; }
    if ((a === 'llego' || a === 'rechazada') && t.dataset.vid && ctx) {
      t.disabled = true;
      ctx.db.collection('visitas').doc(t.dataset.vid).update({ estado: a, actualizada: Date.now(), atendidoPor: me && (me.nombre || me.usuario) || 'guardia' })
        .catch(function () { t.disabled = false; });
    }
  });
  setInterval(function () { if (me) render(); }, 60000);

  // ---------- Enlace con la consulta de placas ----------
  function forPlate(n) {
    if (!me || !n) return [];
    return pending().filter(function (v) { return v.placa && FB.norm(v.placa) === n; });
  }
  window.Visitas = {
    forPlate: forPlate,
    banner: function (n) {
      var vs = forPlate(n);
      if (!vs.length) return '';
      return vs.map(function (v) {
        return '<article class="vbanner"><div class="vhead"><b>Visita anunciada</b><span class="pill ok">' + hm(v.esperadaPara) + '</span></div>' +
          '<p><b>' + esc(v.casa) + '</b> espera a <b>' + esc(v.visitante) + '</b>' + (v.nota ? '. Nota: ' + esc(v.nota) : '') + '.</p>' +
          '<div class="actions two"><button type="button" class="btn primary" data-vact="llego" data-vid="' + esc(v.id) + '">Ingresó</button>' +
          '<button type="button" class="btn danger" data-vact="rechazada" data-vid="' + esc(v.id) + '">Rechazar</button></div></article>';
      }).join('');
    }
  };
  startWatch();
})();
