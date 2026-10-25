// -----------------------------------------------------------------------------
// Parsing of the Piwigo answers into the few values the integration uses.
// Tolerant: a missing or odd field gives a neutral value, never an exception
// (test/fixtures/piwigo/ holds the real answers of Piwigo 16.4.0).
// -----------------------------------------------------------------------------

const count = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#039': "'" };

/** A name of Piwigo, which may hold HTML entities (names typed in the admin pages). */
export function text(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/&(amp|lt|gt|quot|apos|#0?39);/g, (_, entity) => ENTITIES[entity])
    .replace(/<[^>]*>/g, '')
    .trim();
}

/**
 * Milliseconds of a Piwigo date ("2026-10-25 05:50:06", the wall time of its
 * database), read as UTC: displayed back with timeZone UTC, it shows as Piwigo
 * shows it. Null for none.
 */
export function timeOf(value) {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(
    typeof value === 'string' ? value : '',
  );
  if (!match) {
    return null;
  }
  const time = Date.parse(`${match[1]}T${match[2]}Z`);
  return Number.isFinite(time) && time > Date.UTC(1900, 0, 1) ? time : null;
}

/** "2026-10-25 05:50", the wall time of Piwigo (scene variables). */
export const stamp = (time) =>
  time === null ? '' : new Date(time).toISOString().slice(0, 16).replace('T', ' ');

const ADMIN_STATUSES = new Set(['admin', 'webmaster']);

/** pwg.session.getStatus: who Piwigo sees, and its clock. */
export function parseStatus(status) {
  return {
    version: typeof status?.version === 'string' ? status.version : null,
    username: typeof status?.username === 'string' ? status.username : null,
    admin: ADMIN_STATUSES.has(status?.status),
    guest: status?.username === 'guest' || status?.status === 'guest',
    now: timeOf(status?.current_datetime),
  };
}

/** pwg.getInfos: `[{ name, value }]` to the figures the integration shows. */
export function parseInfos(result) {
  const list = Array.isArray(result?.infos) ? result.infos : [];
  const value = (name) => list.find((info) => info?.name === name)?.value;
  return {
    users: value('nb_users') === undefined ? null : count(value('nb_users')),
  };
}

/**
 * pwg.categories.getList (recursive): every album the account sees, with
 * its full path ("Holidays / Beach") and the photos of the album and its
 * sub-albums.
 */
export function parseAlbums(result) {
  const list = Array.isArray(result?.categories) ? result.categories : [];
  const names = new Map(
    list
      .filter((album) => Number.isInteger(Number(album?.id)))
      .map((album) => [String(album.id), text(album.name_raw ?? album.name) || `#${album.id}`]),
  );
  return list
    .filter((album) => album && Number.isInteger(Number(album.id)) && Number(album.id) > 0)
    .map((album) => {
      const id = Number(album.id);
      const path = String(album.uppercats ?? id)
        .split(',')
        .map((part) => names.get(part.trim()) ?? `#${part.trim()}`)
        .join(' / ');
      return {
        id,
        name: names.get(String(id)),
        path,
        photos: count(album.total_nb_images ?? album.nb_images),
        lastAt: timeOf(album.max_date_last) ?? timeOf(album.date_last),
        url: typeof album.url === 'string' ? album.url : null,
      };
    });
}

/** pwg.categories.getImages: the photos of the page, and how many there are in all. */
export function parseImages(result) {
  const list = Array.isArray(result?.images) ? result.images : [];
  const images = list
    .filter((image) => image && Number.isInteger(Number(image.id)) && Number(image.id) > 0)
    .map((image) => {
      const derivatives = image.derivatives ?? {};
      return {
        id: Number(image.id),
        name: text(image.name) || text(image.file) || `#${image.id}`,
        addedAt: timeOf(image.date_available),
        takenAt: timeOf(image.date_creation),
        albums: (Array.isArray(image.categories) ? image.categories : [])
          .map((category) => Number(category?.id))
          .filter((id) => Number.isInteger(id)),
        pageUrl: typeof image.page_url === 'string' ? image.page_url : null,
        // 240 px wide: a list row of the widget shows it under 64 px.
        thumbUrl: derivatives['2small']?.url ?? derivatives.thumb?.url ?? null,
      };
    });
  const total = Number(result?.paging?.total_count);
  return { images, total: Number.isFinite(total) ? count(total) : images.length };
}
