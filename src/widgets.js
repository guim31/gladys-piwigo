// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `latest_photos`, the
// counters and the last photos added, of the whole gallery or of a followed
// album (setting `album`, a device of the integration).
//
// The figures are sent as values, not bound to device features, so the
// widget works before the devices are added to Gladys.
//
// Thumbnails only when the widget setting asks for them: a picture of the
// family then reaches every screen showing the dashboard (a public one, Gladys
// Plus). The content declares a key per photo, Gladys asks for its bytes
// through onWidgetGetImage, and the hub reads the 240 px thumbnail from the
// gallery: the browser never loads a Piwigo URL.
// -----------------------------------------------------------------------------

import { validateWidgetImage } from '@gladysassistant/integration-sdk';
import { WIDGET_KEYS } from './hub.js';
import { dayOf, momentOf, pick } from './texts.js';

const MAX_ROWS = 8;
const MAX_IMAGE_BYTES = 300 * 1024;
const PHOTO_KEY = /^photo-(\d{1,12})$/;

export const TEXT = {
  configure: {
    en: 'Enter the address of your Piwigo gallery in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre galerie Piwigo dans la configuration de l'intégration.",
    de: 'Gib die Adresse deiner Piwigo-Galerie in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su galería Piwigo en la configuración de la integración.',
  },
  unreachable: {
    en: 'The Piwigo gallery does not answer: see the status of the integration.',
    fr: "La galerie Piwigo ne répond pas : voyez l'état de l'intégration.",
    de: 'Die Piwigo-Galerie antwortet nicht: Sieh dir den Status der Integration an.',
    es: 'La galería Piwigo no responde: consulte el estado de la integración.',
  },
  empty: {
    en: 'No photo yet.',
    fr: 'Aucune photo pour le moment.',
    de: 'Noch keine Fotos.',
    es: 'Todavía no hay fotos.',
  },
  photos: { en: 'Photos', fr: 'Photos', de: 'Fotos', es: 'Fotos' },
  albums: { en: 'Albums', fr: 'Albums', de: 'Alben', es: 'Álbumes' },
  users: { en: 'Users', fr: 'Utilisateurs', de: 'Benutzer', es: 'Usuarios' },
  added: { en: 'Added', fr: 'Ajoutée le', de: 'Hinzugefügt', es: 'Añadida el' },
  taken: { en: 'Taken', fr: 'Prise le', de: 'Aufgenommen', es: 'Tomada el' },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

const isTrue = (value) => value === true || value === 'true';

/** Image key of the thumbnail of a photo (its id: a photo of Piwigo keeps its file). */
export const photoKey = (id) => `photo-${id}`;

function rowOf(hub, image, language, thumbnails) {
  const album = hub.albumName(image);
  const added = image.addedAt === null ? null : momentOf(image.addedAt, language);
  return {
    title: fit(image.name, 60),
    subtitle: fit(
      [album, image.addedAt === null ? null : dayOf(image.addedAt, language)]
        .filter(Boolean)
        .join(' · '),
      120,
    ),
    ...(thumbnails && image.thumbUrl ? { image: photoKey(image.id) } : {}),
    description: fit(
      [
        image.name,
        album,
        added ? `${t(TEXT.added, language)} ${added}` : null,
        image.takenAt === null
          ? null
          : `${t(TEXT.taken, language)} ${dayOf(image.takenAt, language)}`,
      ]
        .filter(Boolean)
        .join('\n'),
      2000,
    ),
  };
}

async function getLatestPhotos(hub, { settings = {}, language = 'en' }) {
  if (!hub.client) {
    return message(TEXT.configure, language);
  }
  if (!hub.status) {
    return message(TEXT.unreachable, language);
  }
  const album = settings.album ? hub.followedAlbum(settings.album) : null;
  const components = [];
  let images = hub.recent;
  if (album) {
    components.push(
      { type: 'text', variant: 'heading', text: fit(album.name, 40) },
      { type: 'value', value: album.photos, label: t(TEXT.photos, language), icon: 'image' },
    );
    if (!hub.error) {
      try {
        images = await hub.albumRecent(album);
      } catch {
        images = null;
      }
    }
  } else {
    components.push(
      { type: 'value', value: hub.snapshot.photos, label: t(TEXT.photos, language), icon: 'image' },
      {
        type: 'value',
        value: hub.snapshot.albums,
        label: t(TEXT.albums, language),
        icon: 'book-open',
      },
    );
    if (hub.snapshot.users !== null) {
      components.push({
        type: 'value',
        value: hub.snapshot.users,
        label: t(TEXT.users, language),
        icon: 'users',
      });
    }
  }
  if (hub.error || images === null) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.unreachable, language) });
  } else if (images.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.empty, language) });
  } else {
    const thumbnails = isTrue(settings.thumbnails);
    components.push({
      type: 'card-list',
      display: 'list',
      items: images.slice(0, MAX_ROWS).map((image) => rowOf(hub, image, language, thumbnails)),
    });
  }
  return { ttl_seconds: 300, components };
}

/**
 * Bytes of a thumbnail, as raw base64 (onWidgetGetImage). Only the photos the
 * widget shows, only from the configured gallery.
 */
export async function getImage(hub, imageKey) {
  const match = PHOTO_KEY.exec(String(imageKey));
  const url = match ? hub.thumbUrlOf(Number(match[1])) : null;
  if (!url) {
    throw new Error(`Unknown image ${imageKey}`);
  }
  const body = await hub.requireClient().image(url);
  if (!Buffer.isBuffer(body) || body.length === 0 || body.length > MAX_IMAGE_BYTES) {
    throw new Error(`Thumbnail ${imageKey} is empty or too large`);
  }
  const image = body.toString('base64');
  // The checks of the core (format, header, size): refused here, explained in the logs.
  const problems = validateWidgetImage(image);
  if (problems.length > 0) {
    throw new Error(`Thumbnail ${imageKey} refused: ${problems.join('; ')}`);
  }
  return image;
}

export const WIDGETS = {
  [WIDGET_KEYS.LATEST_PHOTOS]: getLatestPhotos,
};
