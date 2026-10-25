// -----------------------------------------------------------------------------
// The hub against the fake Piwigo gallery: the devices and their states, the
// new photos and album events (once, also across restarts), the followed
// albums, the API key, the sessions and the guest view, the error statuses,
// the scene action, the container's own timer.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRIGGERS } from '../src/hub.js';
import {
  CONFIG,
  FakePiwigo,
  SERVER_URL,
  albumDevice,
  albumFeature,
  createClock,
  createWorld,
  feature,
  galleryDevice,
  makeImage,
  until,
} from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);
const state = (w, key) => w.fake.lastState(feature(w.gladys, key));
const ADDED_AT = Date.parse('2026-10-25T07:30:00Z');

test('discovers the gallery, read by the container, with the users of an admin key', async (t) => {
  const w = await world(t);
  const [device, ...others] = w.fake.discoveredDevices;
  assert.deepEqual(others, [], 'no album followed');
  assert.equal(device.name, 'Piwigo');
  assert.equal(device.external_id, galleryDevice(w.gladys));
  assert.equal(device.should_poll, false);
  assert.deepEqual(device.params, [{ name: 'PIWIGO_URL', value: SERVER_URL }]);
  assert.deepEqual(
    device.features.map((item) => item.name),
    ['Photos', 'Albums', 'Users', 'Last photo added'],
  );
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.deepEqual(w.fake.transports.at(-1), {
    device_external_id: galleryDevice(w.gladys),
    transport: 'local',
  });
  // The key goes in its header, never in a URL or a form.
  const [first] = w.server.requests;
  assert.equal(first.method, 'pwg.session.getStatus');
  assert.equal(first.headers['X-PIWIGO-API'], CONFIG.password);
  assert.ok(w.server.requests.every((request) => !JSON.stringify(request.form).includes('pkid')));
});

test('publishes the counters of the real gallery at the first reading', async (t) => {
  const w = await world(t);
  assert.equal(state(w, 'photos'), 5);
  assert.equal(state(w, 'albums'), 3);
  assert.equal(state(w, 'users'), 3);
  assert.equal(state(w, 'latest'), 'Photo 4 · Famille · Oct 25, 2026');
  assert.deepEqual(w.fake.sceneEvents, [], 'the first reading announces nothing');
});

test('new photos fire photos_added once, with the last one described', async (t) => {
  const clock = createClock();
  const dataDir = (await createWorld({ connect: false })).dataDir;
  const w = await world(t, { clock, dataDir });
  w.server.add(makeImage(6, { albums: [3], at: ADDED_AT }));
  w.server.add(makeImage(7, { albums: [2], at: ADDED_AT + 1000 }));
  await w.hub.refresh();
  await w.hub.refresh();
  const [event, ...more] = events(w, TRIGGERS.PHOTOS_ADDED);
  assert.deepEqual(more, [], 'announced once');
  assert.deepEqual(event.data, {
    device: galleryDevice(w.gladys),
    count: 2,
    name: 'Photo 7',
    album: 'Famille',
    added_at: '2026-10-25 07:30',
    url: 'http://192.0.2.30/picture.php?/7',
  });
  assert.equal(state(w, 'photos'), 7);
  assert.equal(state(w, 'latest'), 'Photo 7 · Famille · Oct 25, 2026');

  // A restart (same /data) announces nothing twice.
  await w.app.stop();
  const again = await world(t, { clock, dataDir, server: w.server });
  await again.hub.refresh();
  assert.equal(events(again, TRIGGERS.PHOTOS_ADDED).length, 0);
  again.server.add(makeImage(8, { at: ADDED_AT + 2000 }));
  await again.hub.refresh();
  assert.equal(events(again, TRIGGERS.PHOTOS_ADDED)[0].data.count, 1);
});

test('more photos than one page: the count comes from the total', async (t) => {
  const w = await world(t, { timings: { recentCount: 3 } });
  for (let id = 6; id <= 10; id += 1) {
    w.server.add(makeImage(id, { at: ADDED_AT + id * 1000 }));
  }
  await w.hub.refresh();
  assert.equal(events(w, TRIGGERS.PHOTOS_ADDED)[0].data.count, 5);
});

test('an album that grows fires album_photos_added, its parent too', async (t) => {
  const w = await world(t);
  w.server.add(makeImage(6, { albums: [3], at: ADDED_AT }));
  w.server.add(makeImage(7, { albums: [3], at: ADDED_AT }));
  await w.hub.refresh();
  const fired = events(w, TRIGGERS.ALBUM_PHOTOS_ADDED).map((event) => event.data);
  assert.deepEqual(
    fired.map(({ album, path, album_id: id, count, total }) => [album, path, id, count, total]),
    [
      ['Vacances 2026', 'Vacances 2026', 1, 2, 5],
      ['Plage', 'Vacances 2026 / Plage', 3, 2, 3],
    ],
  );
  assert.equal(fired[1].device, galleryDevice(w.gladys), 'an album not followed: the gallery');
  assert.equal(fired[1].url, 'http://192.0.2.30/index.php?/category/3');
  await w.hub.refresh();
  assert.equal(events(w, TRIGGERS.ALBUM_PHOTOS_ADDED).length, 2, 'once');
});

test('followed albums are devices with their photos and last addition', async (t) => {
  const w = await world(t, { config: { ...CONFIG, albums: 'Plage, 2, Nowhere', language: 'fr' } });
  const devices = w.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((device) => device.name),
    ['Piwigo', 'Piwigo – Vacances 2026 / Plage', 'Piwigo – Famille'],
  );
  const plage = devices[1];
  assert.equal(plage.external_id, albumDevice(w.gladys, 3));
  assert.deepEqual(plage.params, [{ name: 'PIWIGO_ALBUM_ID', value: '3' }]);
  assert.deepEqual(
    plage.features.map((item) => item.name),
    ['Photos', 'Dernier ajout'],
  );
  assert.equal(w.fake.lastState(albumFeature(w.gladys, 3, 'photos')), 1);
  assert.equal(w.fake.lastState(albumFeature(w.gladys, 3, 'last_added')), '25 oct. 2026, 05:50');
  assert.equal(w.fake.lastState(albumFeature(w.gladys, 2, 'photos')), 2);
  assert.deepEqual(w.hub.missing, ['Nowhere']);

  w.server.add(makeImage(6, { albums: [3], at: ADDED_AT }));
  await w.hub.refresh();
  assert.equal(w.fake.lastState(albumFeature(w.gladys, 3, 'photos')), 2);
  assert.equal(w.fake.lastState(albumFeature(w.gladys, 3, 'last_added')), '25 oct. 2026, 07:30');
  const plageEvent = events(w, TRIGGERS.ALBUM_PHOTOS_ADDED).find(
    (event) => event.data.album_id === 3,
  );
  assert.equal(plageEvent.data.device, albumDevice(w.gladys, 3));

  const report = await w.fake.action('test_connection', {});
  assert.match(
    report.data.message.fr,
    /^Piwigo 16\.4\.0 : connecté en tant que admin, 6 photo\(s\) dans 3 album\(s\), 2 album\(s\) suivi\(s\), introuvable\(s\) : Nowhere$/,
  );
});

test('changing the followed albums republishes the devices at once', async (t) => {
  const w = await world(t);
  const requests = w.server.requests.length;
  await w.fake.configUpdated({ ...CONFIG, albums: 'Famille' });
  await until(() => w.fake.discoveredDevices.length === 2, 'the album device');
  assert.ok(w.server.requests.length > requests);
});

test('states are published on change only, again on device creation', async (t) => {
  const w = await world(t);
  const published = () => w.fake.states.length;
  const before = published();
  await w.hub.refresh();
  assert.equal(published(), before, 'nothing changed: nothing published');
  await w.fake.deviceCreated(w.fake.discoveredDevices[0]);
  await until(() => published() >= before + 4, 'every state again');
});

test('an unchanged value is republished after 12 hours', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  const before = w.fake.states.length;
  clock.advance(12 * 60 * 60_000 + 1);
  await w.hub.refresh();
  assert.equal(w.fake.states.length, before + 4);
});

test('an account and password: one session, opened again when Piwigo forgets it', async (t) => {
  const w = await world(t, {
    config: { server_url: SERVER_URL, username: 'admin', password: 'secret-1' },
  });
  const logins = () => w.server.requests.filter((r) => r.method === 'pwg.session.login').length;
  assert.equal(logins(), 1);
  await w.hub.refresh();
  assert.equal(logins(), 1, 'the session is kept');
  w.server.forgetSessions();
  await w.hub.refresh();
  assert.equal(logins(), 2);
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(state(w, 'photos'), 5, 'not the guest view');
});

test('an account that is not admin: no users counter', async (t) => {
  const w = await world(t, {
    config: { server_url: SERVER_URL, username: 'reader', password: 'secret-2', language: 'en' },
  });
  assert.deepEqual(
    w.fake.discoveredDevices[0].features.map((item) => item.name),
    ['Photos', 'Albums', 'Last photo added'],
  );
  assert.ok(!w.server.requests.some((r) => r.method === 'pwg.getInfos'));
});

test('no credentials: the guest view of the public albums', async (t) => {
  const w = await world(t, { config: { server_url: SERVER_URL } });
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(state(w, 'photos'), 3);
  assert.equal(state(w, 'albums'), 2);
  const report = await w.fake.action('test_connection', {});
  assert.match(report.data.message.en, /connected as guest \(public albums only\)/);
});

test('refused credentials, a wrong address, a gallery that stops answering', async (t) => {
  const wrong = await world(t, {
    config: { server_url: SERVER_URL, username: 'admin', password: 'nope' },
  });
  assert.equal(wrong.fake.connectionStatus.connected, false);
  assert.match(
    wrong.fake.connectionStatus.message.fr,
    /^Piwigo : clé d'API, nom d'utilisateur ou mot de passe refusé$/,
  );
  assert.deepEqual(wrong.fake.discoveredDevices, [], 'no device before a first reading');

  const key = await world(t, {
    config: { ...CONFIG, password: CONFIG.password.replace('0', '9') },
  });
  assert.match(key.fake.connectionStatus.message.en, /API key, user name or password refused/);

  const elsewhere = await world(t, { config: { server_url: 'http://192.0.2.99' } });
  assert.match(elsewhere.fake.connectionStatus.message.en, /does not answer/);

  const page = await world(t, { config: { ...CONFIG, server_url: 'http://192.0.2.30:8080' } });
  assert.equal(page.fake.connectionStatus.connected, false);

  const w = await world(t);
  w.server.online = false;
  await w.hub.refresh();
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.equal(w.fake.transports.at(-1).transport, 'unreachable');
  const states = w.fake.states.length;
  await w.hub.refresh();
  assert.equal(w.fake.states.length, states, 'the last counts are not republished as fresh');
  w.server.online = true;
  await w.hub.refresh();
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(w.fake.transports.at(-1).transport, 'local');
});

test('not a Piwigo: an HTML page or an unknown method', async (t) => {
  const server = new FakePiwigo();
  server.answer = () => ({ status: 200, headers: {}, body: '<html>login</html>' });
  const w = await world(t, { server });
  assert.match(w.fake.connectionStatus.message.en, /no Piwigo gallery at this address/);
});

test('incomplete or empty configuration: a status, no device, no request', async (t) => {
  const empty = await world(t, { config: {} });
  assert.equal(empty.fake.connectionStatus.connected, false);
  assert.match(empty.fake.connectionStatus.message.en, /Enter the address/);
  assert.deepEqual(empty.fake.discoveredDevices, []);
  const half = await world(t, { config: { server_url: SERVER_URL, username: 'admin' } });
  assert.match(half.fake.connectionStatus.message.en, /incomplete/);
  assert.equal(half.server.requests.length, 0);
});

test('read the last photos: gallery or album, count of 24 hours, outputs', async (t) => {
  const w = await world(t, { config: { ...CONFIG, language: 'fr' } });
  w.server.add(makeImage(6, { albums: [3], at: ADDED_AT }));
  const gallery = await w.fake.sceneAction('get_latest_photos', {});
  assert.equal(gallery.success, true, gallery.error);
  assert.deepEqual(gallery.data.outputs, {
    count_24h: 6,
    total: 6,
    name: 'Photo 6',
    album: 'Plage',
    added_at: '2026-10-25 07:30',
    url: 'http://192.0.2.30/picture.php?/6',
  });
  const album = await w.fake.sceneAction('get_latest_photos', { album: 'Famille' });
  assert.equal(album.data.outputs.total, 2);
  assert.equal(album.data.outputs.name, 'Photo 4');
  const old = await world(t, { clock: createClock(Date.parse('2026-10-27T08:00:00Z')) });
  const stale = await old.fake.sceneAction('get_latest_photos', { album: '1' });
  assert.equal(stale.data.outputs.count_24h, 0, 'in the clock of Piwigo');
  const unknown = await w.fake.sceneAction('get_latest_photos', { album: 'Nowhere' });
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /Aucun album de ce nom/);
  w.server.online = false;
  const down = await w.fake.sceneAction('get_latest_photos', {});
  assert.match(down.error, /^Piwigo : la galerie ne répond pas$/);
  // A scene action never fires a trigger.
  assert.equal(w.fake.sceneEvents.length, 0);
});

test('the container reads the gallery on its own timer', async (t) => {
  const w = await world(t, {
    timers: true,
    config: { ...CONFIG, poll_interval: '60' },
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  w.hub.schedule();
  const before = w.server.requests.length;
  w.server.add(makeImage(6, { at: ADDED_AT }));
  t.mock.timers.tick(60_000);
  await w.hub.running;
  t.mock.timers.reset();
  assert.equal(events(w, TRIGGERS.PHOTOS_ADDED).length, 1, 'a reading by the timer');
  assert.ok(w.server.requests.length > before);
});

test('another account on the same gallery is a starting point, not news', async (t) => {
  const clock = createClock();
  const dataDir = (await createWorld({ connect: false })).dataDir;
  const guest = await world(t, { clock, dataDir, config: { server_url: SERVER_URL } });
  await guest.app.stop();
  // The key sees the private album "Famille" and its photos, older than the cursor of the guest.
  const w = await world(t, { clock, dataDir, server: guest.server });
  await w.hub.refresh();
  assert.deepEqual(w.fake.sceneEvents, []);
  w.server.add(makeImage(6, { albums: [2], at: ADDED_AT }));
  await w.hub.refresh();
  assert.deepEqual(
    w.fake.sceneEvents.map((event) => [event.key, event.data.album]),
    [
      [TRIGGERS.PHOTOS_ADDED, 'Famille'],
      [TRIGGERS.ALBUM_PHOTOS_ADDED, 'Famille'],
    ],
  );
});

test('an album hidden then shown again is no news; a new album counts from zero', async (t) => {
  const w = await world(t);
  const famille = w.server.albums.find((album) => album.id === 2);
  famille.status = 'private';
  w.server.admins.delete('admin');
  const hidden = w.server.albums;
  w.server.albums = hidden.filter((album) => album.id !== 2);
  await w.hub.refresh();
  w.server.albums = hidden;
  await w.hub.refresh();
  assert.deepEqual(w.fake.sceneEvents, []);
  w.server.albums.push({
    ...famille,
    id: 9,
    name: 'Nouvel album',
    name_raw: 'Nouvel album',
    uppercats: '9',
  });
  w.server.add(makeImage(6, { albums: [9], at: ADDED_AT }));
  await w.hub.refresh();
  const album = events(w, TRIGGERS.ALBUM_PHOTOS_ADDED).map((event) => [
    event.data.album,
    event.data.count,
  ]);
  assert.deepEqual(album, [['Nouvel album', 1]]);
});

test('the scene action and the album widget reopen a forgotten session', async (t) => {
  const w = await world(t, {
    config: { server_url: SERVER_URL, username: 'admin', password: 'secret-1', albums: 'Famille' },
  });
  w.server.forgetSessions();
  const ack = await w.fake.sceneAction('get_latest_photos', { album: 'Famille' });
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.outputs.total, 2, 'not the guest view');
  w.server.forgetSessions();
  const widget = await w.fake.widgetGet('latest_photos', {
    settings: { album: albumDevice(w.gladys, 2) },
  });
  const list = widget.data.content.components.find((c) => c.type === 'card-list');
  assert.equal(list.items.length, 2);
});

test('a reconfiguration during a reading keeps the state of the new gallery clean', async (t) => {
  const w = await world(t);
  w.server.add(makeImage(6, { at: ADDED_AT }));
  const publish = w.gladys.publishDiscoveredDevices.bind(w.gladys);
  let reconfigured;
  w.gladys.publishDiscoveredDevices = async (devices) => {
    w.gladys.publishDiscoveredDevices = publish;
    reconfigured = w.hub.reconfigure({ ...w.hub.config, password: null, url: 'http://192.0.2.99' });
    return publish(devices);
  };
  w.hub.devicesKey = null;
  await w.hub.refresh();
  await reconfigured;
  assert.equal(w.hub.saved.source, 'http://192.0.2.99|guest');
  assert.equal(w.hub.saved.lastId, null);
  assert.equal(w.hub.saved.albums, null);
});

test('a reverse proxy answering 503 means the gallery does not answer', async (t) => {
  const server = new FakePiwigo();
  server.answer = () => ({ status: 503, headers: {}, body: '<html>503</html>' });
  const w = await world(t, { server });
  assert.match(w.fake.connectionStatus.message.en, /the gallery does not answer/);
});
