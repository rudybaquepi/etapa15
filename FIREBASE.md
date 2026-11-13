# Configurar Firebase para las visitas

Firebase es el servicio gratuito de Google que guarda los avisos de visitas y los entrega en vivo al guardia. Se hace una sola vez y toma unos 15 minutos. Necesita una cuenta de Google.

## 1. Crear el proyecto

1. Entre a https://console.firebase.google.com e inicie sesión con su cuenta de Google.
2. Toque **Crear un proyecto** (o **Add project**).
3. Nombre: `control-placas`. Siga con **Continuar**.
4. Cuando pregunte por Google Analytics, apáguelo y toque **Crear proyecto**.

## 2. Activar el ingreso con usuario y PIN

1. En el menú izquierdo abra **Compilación (Build) → Authentication** y toque **Comenzar**.
2. En la pestaña **Sign-in method**, elija **Correo electrónico/contraseña**.
3. Active solo el primer interruptor (el segundo, "vínculo de correo", déjelo apagado) y toque **Guardar**.

## 3. Copiar los datos de conexión

1. Toque la rueda de engranaje junto a "Descripción general del proyecto" y elija **Configuración del proyecto**.
2. Baje hasta **Tus apps** y toque el icono web `</>`.
3. Apodo: `control-placas`. No marque Firebase Hosting. Toque **Registrar app**.
4. Aparece un bloque `const firebaseConfig = { ... }`. Copie cada valor en el archivo `firebase-config.js`, reemplazando los textos `PEGUE_AQUI`.

## 4. Crear la base de datos y las reglas de seguridad

1. En el menú izquierdo abra **Compilación → Firestore Database** y toque **Crear base de datos**.
2. Elija la ubicación más cercana (por ejemplo `southamerica-east1`) y el modo **Producción**.
3. Cuando esté lista, abra la pestaña **Reglas**.
4. Borre todo el texto, pegue el contenido del archivo `firestore.rules` y toque **Publicar**.

Las reglas son las que protegen los datos: solo cuentas creadas por el administrador pueden entrar, un propietario solo ve sus propios avisos, y el guardia solo puede marcar una visita como "Ingresó" o "Rechazada".

## 5. Crear la cuenta del administrador

1. En **Authentication → Users** toque **Agregar usuario**.
2. Correo: `admin@placas.local`. Contraseña: una larga que usted recuerde. Toque **Agregar usuario**.
3. En la lista aparece el usuario. Copie su **UID** (el código largo de la última columna).
4. Vaya a **Firestore Database → Datos** y toque **Iniciar colección**. Nombre de la colección: `usuarios`.
5. En **ID del documento** pegue el UID. Agregue estos campos, uno por uno:

| Campo | Tipo | Valor |
| --- | --- | --- |
| `role` | string | `admin` |
| `activo` | boolean | `true` |
| `nombre` | string | `Administrador` |
| `usuario` | string | `admin` |
| `casa` | string | (vacío) |

6. Toque **Guardar**.

## 6. Subir los archivos y crear los accesos

1. Suba todos los archivos al repositorio, con `firebase-config.js` ya completado.
2. Abra `https://su-usuario.github.io/control-placas/accesos.html`.
3. Entre con usuario `admin` y la contraseña del paso 5.
4. Cree una cuenta **Guardia** y una cuenta por cada casa. La página muestra el usuario y un PIN de 6 dígitos, con un mensaje listo para copiar y enviar por WhatsApp. El PIN no se vuelve a mostrar.

## Cómo se usa

- **Propietario:** abre `propietario.html`, entra con su usuario y PIN, y anuncia la visita con nombre, placa (opcional), hora y nota. Puede cancelarla mientras siga esperada.
- **Guardia:** abre la app normal, toca la pestaña **Visitas** y entra con su cuenta. Los avisos nuevos aparecen solos con sonido y vibración. Si consulta la placa de un auto anunciado, sale el aviso "Visita anunciada" junto al resultado, incluso si la placa no es de la etapa.
- **Administrador:** en `accesos.html` crea cuentas, las desactiva y reemite un PIN nuevo si alguien lo pierde (el acceso anterior queda desactivado).

## Límites que debe conocer

- Los avisos llegan en vivo solo si la app está abierta en el teléfono del guardia. Con el teléfono bloqueado o la app cerrada no suena. La app intenta mantener la pantalla encendida mientras la sesión está abierta; conviene dejar el teléfono cargando durante el turno.
- Una visita sin placa se muestra en la pestaña Visitas. Solo las que traen placa se cruzan con la consulta.
- Las visitas esperadas pasan a "vencida" 12 horas después de la hora anunciada.
- El plan gratuito de Firebase (Spark) cubre de sobra una urbanización. No pide tarjeta de crédito.

## Si algo falla

| Mensaje | Qué hacer |
| --- | --- |
| "Falta configurar Firebase" | Revise que `firebase-config.js` no tenga textos `PEGUE_AQUI` y que lo haya subido. |
| "Falta activar el acceso por Correo/Contraseña" | Repita el paso 2. |
| "Esta cuenta no tiene permiso…" | La cuenta no existe en la colección `usuarios`, está desactivada, o tiene otro rol. En el administrador, revise el paso 5. |
| "Sin permiso para esta acción" | Las reglas no están publicadas o están incompletas. Repita el paso 4. |
| Error de dominio no autorizado | En **Authentication → Settings → Authorized domains** agregue `su-usuario.github.io`. |
