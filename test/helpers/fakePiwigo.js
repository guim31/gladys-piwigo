// -----------------------------------------------------------------------------
// An in-memory Piwigo gallery behind the `request` seam of the client
// (src/piwigo/http.js). Answers are built on the real answers of Piwigo
// 16.4.0 (test/fixtures/piwigo/), with the behaviors that matter: API keys in
// the X-PIWIGO-API header, sessions of a user name and password (and a
// session Piwigo forgets), the guest view of the public albums only,
// pwg.getInfos for administrators only, photos and albums that grow, a
// thumbnail, a gallery that does not answer.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/piwigo/${name}.json`, import.meta.url), 'utf8'));

// A real 2small thumbnail (240 × 180) of a test photo, as Piwigo renders it.
export const THUMB = readFileSync(new URL('../fixtures/piwigo/2small.jpg', import.meta.url));

export const API_KEY = `pkid-20261025-abcdefghij0123456789:${'0123456789abcdef'.repeat(2)}01234567`;

const ORIGIN = 'http://192.0.2.30';

const json = (status, body, headers = {}) => ({
  status,
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});
const ok = (result, headers) => json(200, { stat: 'ok', result }, headers);
const fail = (status, err, message) => json(status, { stat: 'fail', err, message });

const pad = (n) => String(n).padStart(2, '0');
/** "2026-10-25 05:50:06" from milliseconds (the wall time of Piwigo). */
export const piwigoDate = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};

/** A photo like the ones of pwg.categories.getImages, in `albums`, added at `at` (ms). */
export function makeImage(id, { albums = [1], at = Date.parse('2026-10-25T05:50:06Z') } = {}) {
  const [template] = fixture('images-recent').result.images;
  const file = `20261025055006-${id.toString(16).padStart(8, '0')}`;
  const derivatives = Object.fromEntries(
    Object.entries(template.derivatives).map(([size, value]) => [
      size,
      { ...value, url: value.url.replace(/2026102505500\d-[0-9a-f]{8}/, file) },
    ]),
  );
  return {
    ...template,
    id,
    name: `Photo ${id}`,
    file: `p${id}.jpg`,
    date_available: piwigoDate(at),
    page_url: `${ORIGIN}/picture.php?/${id}`,
    element_url: `${ORIGIN}/upload/2026/10/25/${file}.jpg`,
    derivatives,
    categories: albums.map((album) => ({
      id: album,
      url: `${ORIGIN}/index.php?/category/${album}`,
      page_url: `${ORIGIN}/picture.php?/${id}/category/${album}`,
    })),
  };
}

export class FakePiwigo {
  constructor({
    apiKey = API_KEY,
    users = { admin: 'secret-1', reader: 'secret-2' },
    now = () => Date.parse('2026-10-25T08:00:00Z'),
  } = {}) {
    this.apiKey = apiKey;
    /** The clock of Piwigo (current_datetime). */
    this.now = now;
    this.users = users;
    this.admins = new Set(['admin']);
    /** Session id -> user name. */
    this.sessions = new Map();
    this.online = true;
    this.albums = fixture('categories').result.categories.map((album) => ({ ...album }));
    this.images = fixture('images-recent')
      .result.images.map((image) => ({ ...image }))
      .concat([2, 1].map((id) => makeImage(id, { albums: id === 1 ? [1] : [2] })));
    this.userCount = 3;
    this.requests = [];
    this.thumbRequests = [];
  }

  /** A photo uploaded (and published) outside Gladys. */
  add(image) {
    this.images.unshift(image);
  }

  nextId() {
    return Math.max(0, ...this.images.map((image) => image.id)) + 1;
  }

  /** Piwigo forgets every session (expired, restarted with another session store). */
  forgetSessions() {
    this.sessions.clear();
  }

  async handle(path, { method = 'GET', form = {}, headers = {}, binary = false } = {}) {
    if (!this.online) {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    }
    if (binary) {
      this.thumbRequests.push({ path, headers });
      return /^\/i\.php\?\/upload\/.+-2s\.jpg$/.test(path)
        ? { status: 200, headers: { 'content-type': 'image/jpeg' }, body: THUMB }
        : { status: 404, headers: {}, body: Buffer.alloc(0) };
    }
    const url = new URL(path, ORIGIN);
    if (url.pathname !== '/ws.php' || method !== 'POST') {
      return { status: 404, headers: { 'content-type': 'text/html' }, body: '<html>404</html>' };
    }
    const name = url.searchParams.get('method');
    this.requests.push({ method: name, form, headers });
    let user;
    const key = headers['X-PIWIGO-API'];
    if (key !== undefined) {
      if (key !== this.apiKey) {
        return fail(401, 401, 'Invalid api_key');
      }
      user = 'admin';
    } else {
      const session = /pwg_id=([^;]+)/.exec(headers.cookie ?? '')?.[1];
      user = this.sessions.get(session) ?? 'guest';
    }
    return this.answer(name, form, user);
  }

  answer(name, form, user) {
    const admin = this.admins.has(user);
    switch (name) {
      case 'pwg.session.login': {
        if (
          this.users[form.username] === undefined ||
          this.users[form.username] !== form.password
        ) {
          return fail(200, 999, 'Invalid username/password');
        }
        const id = `s${this.sessions.size + 1}${Math.random().toString(16).slice(2, 10)}`;
        this.sessions.set(id, form.username);
        return ok(true, { 'set-cookie': [`pwg_id=${id}; path=/; HttpOnly`] });
      }
      case 'pwg.session.getStatus': {
        const status = fixture(user === 'guest' ? 'status-guest' : 'status-apikey').result;
        return ok({
          ...status,
          username: user,
          status: user === 'guest' ? 'guest' : admin ? 'webmaster' : 'normal',
          current_datetime: piwigoDate(this.now()),
        });
      }
      case 'pwg.getInfos': {
        if (!admin) {
          return fail(401, 401, 'Access denied');
        }
        const infos = fixture('infos-admin').result.infos.map((info) => {
          if (info.name === 'nb_users') {
            return { ...info, value: String(this.userCount) };
          }
          if (info.name === 'nb_elements') {
            return { ...info, value: String(this.images.length) };
          }
          return info;
        });
        return ok({ infos });
      }
      case 'pwg.categories.getList': {
        const last = (images) =>
          images
            .map((image) => image.date_available)
            .sort()
            .at(-1) ?? null;
        const albums = this.visibleAlbums(user).map((album) => ({
          ...album,
          nb_images: this.imagesOf(album.id, false, user).length,
          total_nb_images: this.imagesOf(album.id, true, user).length,
          date_last: last(this.imagesOf(album.id, false, user)),
          max_date_last: last(this.imagesOf(album.id, true, user)),
        }));
        return ok({ categories: albums });
      }
      case 'pwg.categories.getImages': {
        const perPage = Number(form.per_page ?? 100);
        const list =
          form.cat_id === undefined
            ? this.visibleImages(user)
            : this.imagesOf(Number(form.cat_id), form.recursive === 'true', user);
        const sorted = [...list].sort(
          (a, b) => b.date_available.localeCompare(a.date_available) || b.id - a.id,
        );
        return ok({
          paging: {
            page: 0,
            per_page: perPage,
            count: Math.min(perPage, sorted.length),
            total_count: sorted.length,
          },
          images: sorted.slice(0, perPage),
        });
      }
      default:
        return fail(501, 501, 'Method name is not valid');
    }
  }

  visibleAlbums(user) {
    return user === 'guest'
      ? this.albums.filter((album) => album.status === 'public')
      : this.albums;
  }

  visibleImages(user) {
    const visible = new Set(this.visibleAlbums(user).map((album) => album.id));
    return this.images.filter((image) => image.categories.some((album) => visible.has(album.id)));
  }

  /** The photos of an album, and of its sub-albums with `recursive`. */
  imagesOf(id, recursive, user) {
    const albums = new Set(
      this.visibleAlbums(user)
        .filter((album) =>
          recursive ? String(album.uppercats).split(',').map(Number).includes(id) : album.id === id,
        )
        .map((album) => album.id),
    );
    return this.images.filter((image) => image.categories.some((album) => albums.has(album.id)));
  }
}

/** A fake network: the servers by origin, every other address unreachable. */
export function createNetwork(servers) {
  return {
    async request(url, options) {
      const target = new URL(url);
      const entry = Object.entries(servers).find(([base]) => url.startsWith(`${base}/`));
      if (!entry) {
        throw Object.assign(new Error('connect EHOSTUNREACH'), { code: 'EHOSTUNREACH' });
      }
      const [base, server] = entry;
      const path = `${target.pathname}${target.search}`.slice(new URL(base).pathname.length);
      return server.handle(path.startsWith('/') ? path : `/${path}`, options);
    },
  };
}
