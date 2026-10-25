// -----------------------------------------------------------------------------
// Normalization of the configuration: the address typed by the user, the API
// key or the account, the albums to follow, the interval and the language;
// and the parsing of the real Piwigo 16.4.0 answers.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  matchAlbums,
  normalizeConfig,
  parseAlbumList,
  parseServerUrl,
} from '../src/config.js';
import { AUTH_MODES, authOf } from '../src/piwigo/client.js';
import {
  parseAlbums,
  parseImages,
  parseInfos,
  parseStatus,
  stamp,
  text,
  timeOf,
} from '../src/piwigo/model.js';
import { describePhoto } from '../src/texts.js';
import { API_KEY, fixture } from './helpers/fakePiwigo.js';

test('the address: bare host, page of the gallery, sub-folder', () => {
  assert.equal(parseServerUrl('192.0.2.30'), 'http://192.0.2.30');
  assert.equal(parseServerUrl(' http://192.0.2.30:8080/ '), 'http://192.0.2.30:8080');
  assert.equal(
    parseServerUrl('http://192.0.2.30/piwigo/index.php?/category/2'),
    'http://192.0.2.30/piwigo',
  );
  assert.equal(parseServerUrl('https://example.org/photos/ws.php'), 'https://example.org/photos');
  assert.equal(
    parseServerUrl('https://example.org/photos/index.php/category/2'),
    'https://example.org/photos',
    'URLs with the path after index.php',
  );
  assert.equal(parseServerUrl('ftp://192.0.2.30'), null);
  assert.equal(parseServerUrl('http://user:secret@192.0.2.30'), null, 'no credentials');
  assert.equal(parseServerUrl(''), null);
  assert.equal(parseServerUrl(42), null);
});

test('defaults, API key, account, guest, incomplete', () => {
  assert.deepEqual(normalizeConfig(), {
    url: null,
    username: null,
    password: null,
    incomplete: false,
    albums: [],
    pollIntervalMs: 300_000,
    language: DEFAULT_CONFIG.language,
  });
  const key = normalizeConfig({ server_url: '192.0.2.30', password: ` ${API_KEY} ` });
  assert.equal(key.url, 'http://192.0.2.30');
  assert.equal(key.password, API_KEY);
  assert.equal(key.incomplete, false);
  const account = normalizeConfig({
    server_url: '192.0.2.30',
    username: ' admin ',
    password: ' pass ',
    albums: 'Famille, 3',
    poll_interval: '60',
    language: 'de',
  });
  assert.deepEqual(account, {
    url: 'http://192.0.2.30',
    username: 'admin',
    password: 'pass',
    incomplete: false,
    albums: ['Famille', '3'],
    pollIntervalMs: 60_000,
    language: 'de',
  });
  assert.equal(normalizeConfig({ server_url: '192.0.2.30' }).incomplete, false, 'guest view');
  assert.equal(normalizeConfig({ server_url: '192.0.2.30', username: 'admin' }).incomplete, true);
  assert.equal(
    normalizeConfig({ server_url: '192.0.2.30', password: 'not-a-key' }).incomplete,
    true,
    'a password alone must be an API key',
  );
  assert.equal(normalizeConfig({ password: 'p' }).incomplete, true);
  assert.equal(normalizeConfig({ poll_interval: '5' }).pollIntervalMs, 300_000);
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});

test('how to authenticate: whole key, key id + secret, account, guest', () => {
  const [id, secret] = API_KEY.split(':');
  assert.deepEqual(authOf(null, API_KEY), { mode: AUTH_MODES.API_KEY, key: API_KEY });
  assert.deepEqual(authOf('ignored', API_KEY), { mode: AUTH_MODES.API_KEY, key: API_KEY });
  assert.deepEqual(authOf(id, secret), { mode: AUTH_MODES.API_KEY, key: API_KEY });
  assert.deepEqual(authOf('admin', 'pass'), { mode: AUTH_MODES.SESSION });
  assert.deepEqual(authOf(null, null), { mode: AUTH_MODES.GUEST });
});

test('the albums to follow: list, ids, paths, names', () => {
  assert.deepEqual(parseAlbumList(' Famille ;#3, famille,Vacances 2026/Plage ,, '), [
    'Famille',
    '3',
    'Vacances 2026 / Plage',
  ]);
  assert.deepEqual(parseAlbumList(undefined), []);
  const albums = parseAlbums(fixture('categories').result);
  const { matched, missing } = matchAlbums(
    ['plage', '2', 'Vacances 2026 / Plage', 'Nowhere', '99'],
    albums,
  );
  assert.deepEqual(
    matched.map((album) => album.id),
    [3, 2],
  );
  assert.deepEqual(missing, ['Nowhere', '99']);
});

test('the real answers: status, figures, albums, photos', () => {
  const status = parseStatus(fixture('status-apikey').result);
  assert.deepEqual(status, {
    version: '16.4.0',
    username: 'admin',
    admin: true,
    guest: false,
    now: Date.parse('2026-10-25T05:51:39Z'),
  });
  assert.equal(parseStatus(fixture('status-guest').result).guest, true);
  assert.equal(parseStatus(fixture('status-user').result).admin, false);
  assert.deepEqual(parseInfos(fixture('infos-admin').result), { users: 3 });
  assert.deepEqual(parseInfos(null), { users: null });

  const albums = parseAlbums(fixture('categories').result);
  assert.deepEqual(
    albums.map(({ id, name, path, photos }) => ({ id, name, path, photos })),
    [
      { id: 2, name: 'Famille', path: 'Famille', photos: 2 },
      { id: 1, name: 'Vacances 2026', path: 'Vacances 2026', photos: 3 },
      { id: 3, name: 'Plage', path: 'Vacances 2026 / Plage', photos: 1 },
    ],
  );
  assert.equal(albums[0].lastAt, Date.parse('2026-10-25T05:50:06Z'));

  const { images, total } = parseImages(fixture('images-recent').result);
  assert.equal(total, 5);
  assert.deepEqual(
    images.map(({ id, name, albums: ids }) => [id, name, ids]),
    [
      [5, 'Photo 4', [2]],
      [4, 'Photo 3', [1]],
      [3, 'Photo 2', [3]],
    ],
  );
  assert.match(images[0].thumbUrl, /-2s\.jpg$/);
  assert.equal(images[0].takenAt, null, 'no EXIF date');
  assert.deepEqual(parseImages({ error: 'x' }), { images: [], total: 0 });
});

test('names and dates of Piwigo', () => {
  assert.equal(text('Tom &amp; Jerry &#039;s <b>day</b>'), "Tom & Jerry 's day");
  assert.equal(timeOf('2026-10-25 05:50:06'), Date.parse('2026-10-25T05:50:06Z'));
  assert.equal(timeOf('0000-00-00 00:00:00'), null);
  assert.equal(timeOf(null), null);
  assert.equal(stamp(Date.parse('2026-10-25T05:50:06Z')), '2026-10-25 05:50');
  assert.equal(stamp(null), '');
});

test('the "last photo added" text, in the four languages', () => {
  const image = { name: 'Sunset', addedAt: Date.parse('2026-05-14T23:30:00Z') };
  assert.equal(describePhoto(image, 'Beach', 'en'), 'Sunset · Beach · May 14, 2026');
  assert.equal(describePhoto(image, 'Plage', 'fr'), 'Sunset · Plage · 14 mai 2026');
  assert.equal(describePhoto(image, null, 'de'), 'Sunset · 14. Mai 2026');
  assert.equal(describePhoto({ ...image, addedAt: null }, null, 'es'), 'Sunset');
});
