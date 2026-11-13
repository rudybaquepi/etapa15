// Base compartida de Firebase para las páginas de visitas.
(function () {
  'use strict';
  var V = '10.12.2', BASE = 'https://www.gstatic.com/firebasejs/' + V + '/';
  var DOMAIN = '@placas.local';
  var cfg = window.FIREBASE_CONFIG || {};
  var ready = !!(cfg.apiKey && cfg.projectId && !/PEGUE/i.test(cfg.apiKey + cfg.projectId));

  function loadScript(src) {
    return new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = function () { no(Object.assign(new Error('red'), { code: 'network' })); };
      document.head.appendChild(s);
    });
  }
  var booting = null;
  function init() {
    if (!ready) return Promise.reject(Object.assign(new Error('config'), { code: 'config' }));
    if (booting) return booting;
    booting = loadScript(BASE + 'firebase-app-compat.js')
      .then(function () { return loadScript(BASE + 'firebase-auth-compat.js'); })
      .then(function () { return loadScript(BASE + 'firebase-firestore-compat.js'); })
      .then(function () {
        var app = firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
        return { firebase: firebase, app: app, auth: firebase.auth(), db: firebase.firestore() };
      });
    booting.catch(function () { booting = null; });
    return booting;
  }

  function norm(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function fmtPlate(s) {
    var n = norm(s).slice(0, 7);
    var m = /^[A-Z]{3}/.test(n) ? 3 : (/^[A-Z]{2}\d/.test(n) ? 2 : 0);
    return (m && n.length > m) ? n.slice(0, m) + '-' + n.slice(m) : n;
  }
  function emailOf(usuario) { return String(usuario || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') + DOMAIN; }

  function explain(err) {
    var c = err && (err.code || '');
    if (c === 'config') return 'Falta configurar Firebase. Revise el archivo firebase-config.js.';
    if (c === 'network' || c === 'auth/network-request-failed' || c === 'unavailable') return 'No hay conexión. Revise el internet e intente de nuevo.';
    if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-email') return 'Usuario o PIN incorrecto.';
    if (c === 'auth/too-many-requests') return 'Demasiados intentos. Espere unos minutos.';
    if (c === 'auth/operation-not-allowed') return 'Falta activar el acceso por Correo/Contraseña en Firebase.';
    if (c === 'auth/email-already-in-use') return 'Ese usuario ya existe.';
    if (c === 'sinacceso') return 'Esta cuenta no tiene permiso para entrar aquí o está desactivada.';
    if (c === 'permission-denied') return 'Sin permiso para leer o guardar datos. Revise que las reglas de Firestore estén publicadas y que la cuenta exista en la colección usuarios.';
    return 'Ocurrió un error' + (c ? ' (' + c + ')' : '') + '. Intente de nuevo.';
  }

  // Entra y comprueba que la cuenta exista en "usuarios", esté activa y tenga uno de los roles permitidos.
  function signIn(usuario, pin, roles) {
    var ctx;
    return init().then(function (c) {
      ctx = c;
      return c.auth.signInWithEmailAndPassword(emailOf(usuario), String(pin).trim());
    }).then(function (cred) { return profileOf(ctx, cred.user.uid, roles); }).catch(function (e) {
      if (ctx && e && e.code === 'sinacceso') ctx.auth.signOut();
      throw e;
    });
  }
  function profileOf(ctx, uid, roles) {
    return ctx.db.collection('usuarios').doc(uid).get().then(function (d) {
      var p = d.exists ? d.data() : null;
      if (!p || p.activo !== true || (roles && roles.indexOf(p.role) < 0)) throw Object.assign(new Error('sinacceso'), { code: 'sinacceso' });
      p.uid = uid;
      return p;
    });
  }
  // Avisa con el perfil (o null) cada vez que cambia la sesión. El tercer dato es el motivo si se rechaza.
  // Solo cierra la sesión si la cuenta no tiene acceso; ante fallos de red o permisos reintenta y muestra el error.
  function watch(roles, cb) {
    return init().then(function (ctx) {
      ctx.auth.onAuthStateChanged(function (u) {
        if (!u) return cb(null, ctx);
        var tries = 0;
        (function go() {
          profileOf(ctx, u.uid, roles).then(function (p) { cb(p, ctx); }, function (e) {
            if (e && e.code === 'sinacceso') { ctx.auth.signOut(); return cb(null, ctx, e); }
            if (tries++ < 2) return setTimeout(go, 800);
            cb(null, ctx, e);
          });
        })();
      });
      return ctx;
    });
  }
  function signOut() { return init().then(function (c) { return c.auth.signOut(); }); }

  // Crea una cuenta sin cerrar la sesión del administrador (usa una app secundaria).
  function createAccount(usuario, pin) {
    return init().then(function (ctx) {
      var sec = ctx.firebase.initializeApp(cfg, 'sec' + Date.now());
      var done = function () { return sec.delete().catch(function () {}); };
      return sec.auth().createUserWithEmailAndPassword(emailOf(usuario), String(pin)).then(function (cred) {
        var uid = cred.user.uid;
        return sec.auth().signOut().then(done).then(function () { return uid; });
      }, function (e) { return done().then(function () { throw e; }); });
    });
  }
  function rnd(n, chars) {
    var a = new Uint32Array(n), out = '';
    crypto.getRandomValues(a);
    for (var i = 0; i < n; i++) out += chars[a[i] % chars.length];
    return out;
  }
  function genPin() { return rnd(6, '0123456789'); }
  function genUsuario(base) {
    var slug = String(base || 'u').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '').slice(0, 10) || 'u';
    return slug + rnd(3, 'abcdefghjkmnpqrstuvwxyz23456789');
  }

  window.FB = { ready: ready, init: init, norm: norm, fmtPlate: fmtPlate, explain: explain, signIn: signIn, watch: watch, signOut: signOut, createAccount: createAccount, genPin: genPin, genUsuario: genUsuario };
})();
