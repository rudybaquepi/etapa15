# Control de Placas

Aplicación web para que el guardia consulte desde el celular si una placa pertenece a la etapa. Funciona en cualquier navegador y no necesita servidor.

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Página principal |
| `styles.css` | Estilos |
| `app.js` | Lógica de consulta |
| `config.js` | Nombre de la urbanización, etapa y horario nocturno |
| `placas.csv` | **La base de vehículos** (la única que se edita a menudo) |
| `sw.js` | Permite abrir la app sin internet |
| `admin.html` y `admin.js` | Panel de administración para agregar, editar y quitar placas |
| `propietario.html` y `propietario.js` | Página donde los propietarios anuncian visitas |
| `accesos.html` y `accesos.js` | Administrador: crea los usuarios y PIN de propietarios y guardias |
| `visitas-guardia.js` | Pestaña Visitas de la app del guardia |
| `fb.js`, `firebase-config.js` | Conexión con Firebase (ver `FIREBASE.md`) |
| `firestore.rules` | Reglas de seguridad que se pegan en Firebase |

## Publicar en GitHub Pages

1. Cree un repositorio y suba todos estos archivos a la raíz.
2. Entre a **Settings → Pages**.
3. En **Source** elija **Deploy from a branch**, rama `main`, carpeta `/ (root)` y guarde.
4. Después de un minuto, GitHub muestra la dirección, por ejemplo `https://usuario.github.io/control-placas/`.
5. En el teléfono del guardia abra esa dirección y use **Agregar a pantalla de inicio** para tener un acceso directo.

## Formato de placas.csv

```
placa,propietario,casa,vehiculo,nota,estado
GAB-1234,Nombre Apellido,Mz 3 · Villa 12,Chevrolet Sail gris,,activo
```

- `estado` puede ser `activo` o `inactivo`. Un vehículo inactivo aparece en amarillo para que el guardia confirme con la administración.
- Las filas cuyo propietario empieza con `EJEMPLO` son de muestra. Bórrelas antes de usar la app.
- Para actualizar la base: abra `placas.csv` en GitHub, toque el lápiz, edite y guarde con **Commit changes**. Los teléfonos reciben el cambio al volver a abrir la app.
- Si trabaja en Excel, la pestaña **Registro** tiene una herramienta que combina su lista con la actual y descarga un `placas.csv` listo para subir.

## Panel de administración

Abra `https://su-usuario.github.io/control-placas/admin.html`. No hay enlace desde la app del guardia.

1. Cree un token en GitHub: Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token. Elija solo su repositorio y ponga **Contents: Read and write**.
2. En el panel escriba `usuario/control-placas` y pegue el token. Ese token hace de contraseña.
3. Agregue, edite o quite vehículos, o importe una lista. Los cambios quedan como borrador.
4. Toque **Publicar cambios**. El panel guarda `placas.csv` en GitHub y los teléfonos lo reciben en 1 o 2 minutos.

Cada publicación queda en el historial del repositorio (pestaña Commits), por si necesita volver a una versión anterior. Si pierde el token, bórrelo en GitHub y cree otro.

## Visitas anunciadas (opcional)

Los propietarios anuncian visitas desde `propietario.html` y el guardia las recibe en la pestaña **Visitas** de la app. Necesita Firebase, que se configura una vez siguiendo `FIREBASE.md`. Sin esa configuración, la consulta de placas funciona igual y la pestaña Visitas indica que falta configurar.

## Privacidad

GitHub Pages publica los archivos en internet. Cualquiera que conozca la dirección podría descargar `placas.csv`, con nombres y casas.

- Use un repositorio privado con Pages solo si su plan de GitHub lo permite (Pages privado requiere plan de pago).
- En un repositorio público, ponga solo lo necesario: placa y casa. Deje vacía la columna propietario si puede.
- Los avisos de visitas se guardan en Firebase, no en GitHub, y solo los ven cuentas creadas por el administrador.
- La página lleva `noindex` para que los buscadores no la listen, pero eso no la protege de quien tenga el enlace.

## Prueba en su computador

Abra una terminal en la carpeta y ejecute `python3 -m http.server 8000`; luego visite `http://localhost:8000`. No abra `index.html` con doble clic: el navegador bloquea la lectura de `placas.csv`.
