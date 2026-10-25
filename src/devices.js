// -----------------------------------------------------------------------------
// The Gladys devices of the integration:
// - the "Piwigo" gallery (identity `gallery:main`: moving the gallery to
//   another address keeps the device and its history): photos, albums,
//   users (an administrator account only: Piwigo tells nobody else), and the
//   last photo added (text/text: name, album, date);
// - one device per followed album (identity `album:<id of Piwigo>`): its
//   photos, sub-albums included, and the date of its last addition.
//
// Every feature is read-only (category/type couples of the core table, see
// test/gladys-rules.test.js). should_poll: false: the integration reads the
// gallery on its own timer (src/hub.js).
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const GALLERY_TYPE = 'gallery';
export const GALLERY_ID = 'main';
export const ALBUM_TYPE = 'album';
export const URL_PARAM = 'PIWIGO_URL';
export const ALBUM_PARAM = 'PIWIGO_ALBUM_ID';

// Suffixes of the feature external ids: permanent once published.
export const KEYS = Object.freeze({
  PHOTOS: 'photos',
  ALBUMS: 'albums',
  USERS: 'users',
  LATEST: 'latest',
  LAST_ADDED: 'last_added',
});

// Feature names, per language (Gladys does not tell a device integration the
// user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [KEYS.PHOTOS]: 'Photos',
    [KEYS.ALBUMS]: 'Albums',
    [KEYS.USERS]: 'Users',
    [KEYS.LATEST]: 'Last photo added',
    [KEYS.LAST_ADDED]: 'Last addition',
  },
  fr: {
    [KEYS.PHOTOS]: 'Photos',
    [KEYS.ALBUMS]: 'Albums',
    [KEYS.USERS]: 'Utilisateurs',
    [KEYS.LATEST]: 'Dernière photo ajoutée',
    [KEYS.LAST_ADDED]: 'Dernier ajout',
  },
  de: {
    [KEYS.PHOTOS]: 'Fotos',
    [KEYS.ALBUMS]: 'Alben',
    [KEYS.USERS]: 'Benutzer',
    [KEYS.LATEST]: 'Zuletzt hinzugefügtes Foto',
    [KEYS.LAST_ADDED]: 'Letzte Ergänzung',
  },
  es: {
    [KEYS.PHOTOS]: 'Fotos',
    [KEYS.ALBUMS]: 'Álbumes',
    [KEYS.USERS]: 'Usuarios',
    [KEYS.LATEST]: 'Última foto añadida',
    [KEYS.LAST_ADDED]: 'Última adición',
  },
};

// Display bounds (the core never applies them on write).
const COUNTER_MAX = 10_000_000;

const readOnly = { read_only: true, has_feedback: false };

const counter = (key, value, max = COUNTER_MAX) => ({
  key,
  definition: {
    ...readOnly,
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    keep_history: true,
    min: 0,
    max,
  },
  value,
});

const textFeature = (key, value) => ({
  key,
  text: true,
  definition: {
    ...readOnly,
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    keep_history: true,
    min: 0,
    max: 0,
  },
  value,
});

// Order = display order in Gladys. `value` reads the snapshot of the hub.
const GALLERY_FEATURES = [
  counter(KEYS.PHOTOS, (s) => s.photos ?? null),
  counter(KEYS.ALBUMS, (s) => s.albums ?? null, 1_000_000),
  { ...counter(KEYS.USERS, (s) => s.users ?? null, 1_000_000), adminOnly: true },
  textFeature(KEYS.LATEST, (s) => s.latest || null),
];

const ALBUM_FEATURES = [
  counter(KEYS.PHOTOS, (s) => s.photos ?? null),
  textFeature(KEYS.LAST_ADDED, (s) => s.lastAdded || null),
];

export const galleryIds = (gladys) => gladys.externalIds(GALLERY_TYPE, GALLERY_ID);
export const albumIds = (gladys, id) => gladys.externalIds(ALBUM_TYPE, String(id));

const galleryFeatures = (admin) =>
  GALLERY_FEATURES.filter((feature) => admin || !feature.adminOnly);

/**
 * The discovery payload of the gallery. The users counter only for an
 * administrator account (the only one Piwigo tells it).
 */
export function buildGalleryDevice(gladys, { url, admin }, language = 'en') {
  const ids = galleryIds(gladys);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: 'Piwigo',
    external_id: ids.device,
    should_poll: false,
    params: [{ name: URL_PARAM, value: url }],
    features: galleryFeatures(admin).map(({ key, definition }) => ({
      ...definition,
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

/** The discovery payload of a followed album (parseAlbums). */
export function buildAlbumDevice(gladys, album, language = 'en') {
  const ids = albumIds(gladys, album.id);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: `Piwigo – ${album.path}`.slice(0, 100),
    external_id: ids.device,
    should_poll: false,
    params: [{ name: ALBUM_PARAM, value: String(album.id) }],
    features: ALBUM_FEATURES.map(({ key, definition }) => ({
      ...definition,
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

const valuesOf = (ids, features, snapshot) =>
  features.map(({ key, value, text = false }) => ({
    key,
    externalId: ids.feature(key),
    value: value(snapshot),
    text,
  }));

/**
 * The value of every feature (null: nothing to publish).
 * @returns {Array<{ key: string, externalId: string, value: number|string|null, text: boolean }>}
 */
export const galleryValues = (gladys, snapshot) =>
  valuesOf(galleryIds(gladys), galleryFeatures(snapshot.admin), snapshot);

export const albumValues = (gladys, id, snapshot) =>
  valuesOf(albumIds(gladys, id), ALBUM_FEATURES, snapshot);
