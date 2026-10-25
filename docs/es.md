# Piwigo

Su galería de fotos [Piwigo](https://piwigo.org) en Gladys, en su red local: el
número de fotos, álbumes y usuarios, la última foto añadida, un dispositivo por
cada álbum que quiera seguir, escenas que reaccionan cuando llegan fotos nuevas
o un álbum crece, una acción de escena que lee las últimas fotos y un widget
del panel con las últimas fotos.

La integración se probó con una galería Piwigo real (la imagen Docker
`linuxserver/piwigo`, Piwigo 16.4.0), todavía no en una instalación real de
Gladys: sus comentarios son bienvenidos en el
[foro de Gladys](https://community.gladysassistant.com) o en los
[issues](https://github.com/guim31/gladys-piwigo/issues).

## Lo que necesita

- Gladys Assistant 5.1.0 o posterior.
- Una galería **Piwigo** accesible desde Gladys (misma red).
- Lo mejor: una **clave de API** (Piwigo 16 o posterior): en Piwigo, abra su
  **perfil**, **Claves de API**, cree una y copie la clave entera: su
  identificador, dos puntos, su secreto (`pkid-20261025-…:…`). La clave actúa
  como su cuenta: una clave de **administrador** también da el número de
  usuarios.
- Si no, el usuario y la contraseña de una cuenta (cualquier versión de Piwigo
  con la API web).
- Sin ninguno de los dos, la integración lee la galería como invitado: solo
  álbumes públicos.

## Configuración

1. Instale la integración desde el catálogo de Gladys.
2. En **Configuración**, introduzca la **Dirección de la galería** con su
   puerto y su carpeta (por ejemplo `http://192.168.1.20/piwigo`; también vale
   una página de la galería copiada del navegador) y pegue la **clave de API**
   en el campo de contraseña, con el usuario vacío. Con una cuenta, introduzca
   en su lugar su usuario y su contraseña.
3. Si lo desea, indique los **Álbumes que seguir**: nombres o identificadores
   separados por comas (`Vacaciones, 12`); un subálbum por su ruta
   (`Vacaciones / Playa`). El identificador es el número al final de la
   dirección del álbum (`index.php?/category/12`): úselo para un nombre con una
   coma.
4. Elija la **Actualización** (5 minutos por defecto) y el **Idioma de los
   nombres**, y guarde. **Probar la conexión** lee la galería al momento e
   indica los álbumes no encontrados.
5. En **Descubrimiento**, añada el dispositivo **Piwigo** y los dispositivos de
   álbum que desee.

## Dispositivos

El dispositivo **Piwigo** muestra toda la galería (solo lectura):

| Función             | Lo que muestra                                                       |
| ------------------- | -------------------------------------------------------------------- |
| Fotos               | Fotos que la cuenta puede ver                                        |
| Álbumes             | Álbumes que la cuenta puede ver, subálbumes incluidos                |
| Usuarios            | Usuarios de la galería (solo cuenta o clave de administrador)        |
| Última foto añadida | Su nombre, su álbum y el día: `Atardecer · Vacaciones · 25 oct 2026` |

Cada álbum seguido da un dispositivo **Piwigo – ruta del álbum**:

| Función        | Lo que muestra                                             |
| -------------- | ---------------------------------------------------------- |
| Fotos          | Fotos del álbum y de sus subálbumes                        |
| Última adición | Día y hora de la última foto añadida: `25 oct 2026, 07:50` |

La integración lee la galería por sí misma (tres o cuatro peticiones pequeñas
por lectura): no hay nada que ajustar en Gladys. El indicador de conexión de
los dispositivos se pone en rojo cuando la galería deja de responder.

## Panel

El widget **Últimas fotos** muestra los contadores (fotos, álbumes, usuarios) y
las últimas fotos añadidas: nombre, álbum, día; al tocar se ve la hora en que
se añadió y el día en que se tomó. Con el ajuste **Álbum seguido**, muestra uno
de sus álbumes seguidos en lugar de toda la galería.

Las miniaturas están **desactivadas por defecto**: con el ajuste **Mostrar
miniaturas** se ve la miniatura pequeña de cada foto, y sus fotos aparecen
entonces en cualquier pantalla que muestre este panel (una tableta compartida,
un panel público, Gladys Plus). El navegador nunca carga Piwigo directamente:
Gladys se lo pide a la integración, que solo sirve las fotos de la lista del
widget.

## Escenas

### Disparadores

- **Fotos nuevas añadidas**: se añadieron fotos a la galería, sea cual sea la
  vía (subida web, aplicación móvil, sincronización), vistas en la lectura
  siguiente. Variables: número de fotos añadidas, nombre, álbum, fecha de
  adición y página de la última.
- **Fotos añadidas a un álbum**: un álbum, con sus subálbumes, contiene más
  fotos que en la lectura anterior (un álbum nuevo cuenta desde cero). Filtro:
  el nombre del álbum, exactamente como en Piwigo, sin sus álbumes padre.
  Variables: nombre, ruta e identificador del álbum, fotos añadidas, fotos en
  el álbum, página del álbum. Una foto añadida a un subálbum también activa este
  disparador para sus álbumes padre.

### Acciones

- **Leer las últimas fotos**: lee al momento las últimas fotos añadidas, de
  toda la galería o de un álbum (nombre, ruta o identificador; subálbumes
  incluidos). Salidas para las acciones siguientes de la escena: fotos añadidas
  en 24 horas, fotos en total, nombre, álbum, fecha de adición y página de la
  última. Nada cambia en Piwigo.

### Ideas de escenas

- Con **Fotos nuevas añadidas**, envíe un mensaje a la familia: «{{count}}
  fotos nuevas, la última: {{name}} en {{album}}».
- Cada noche a las 21 h, **Leer las últimas fotos** del álbum «Familia» y, si
  **Fotos añadidas en 24 horas** es mayor que 0, mostrar un mensaje en la
  tableta del salón.
- Con **Fotos añadidas a un álbum** «Vacaciones 2026», encender el pasillo en
  azul.

## Solución de problemas

- **«clave de API, usuario o contraseña rechazados»**: la clave caducó, fue
  revocada o no se pegó entera (identificador, dos puntos, secreto); con una
  cuenta, compruebe la contraseña.
- **«la galería no responde»**: compruebe la dirección, el puerto y la carpeta
  desde la máquina de Gladys.
- **«no hay ninguna galería Piwigo en esta dirección»**: la dirección lleva a
  otra página (página de inicio de sesión de un proxy inverso, otra
  aplicación): introduzca la dirección de la propia galería.
- **«certificado rechazado»**: un certificado autofirmado; use la dirección
  `http://` de su red.
- **Las fotos nuevas no aparecen**: Piwigo puede guardar las fotos enviadas
  desde la aplicación móvil o la API web en una sala de espera (el «lounge»)
  hasta que termina la subida; aparecen en la lectura siguiente.
- **El número de usuarios sigue vacío**: la cuenta o la clave no es de
  administrador.
- `LOG_LEVEL=debug` en los registros de la integración muestra cada lectura.

## Límites

- Las fotos nuevas se ven en la lectura siguiente (5 minutos por defecto), y
  solo las que la cuenta puede ver.
- La integración solo lee: nunca modifica, sube ni elimina nada en Piwigo.
- Ninguna foto sale de su red a través de la integración, salvo si activa las
  miniaturas del widget.
- Las fechas son las del servidor Piwigo, tal como las muestra.
- Sin relación con el proyecto Piwigo.
