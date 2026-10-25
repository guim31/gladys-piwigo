// -----------------------------------------------------------------------------
// The "Last photos" widget: content validated by the SDK's own validator
// (what the core accepts), the gallery or a followed album, the opt-in
// thumbnails served through onWidgetGetImage.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEYS } from '../src/hub.js';
import {
  CONFIG,
  SERVER_URL,
  THUMB,
  albumDevice,
  createWorld,
  galleryDevice,
  makeImage,
} from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, settings = {}, language = 'en') {
  const ack = await w.fake.widgetGet(WIDGET_KEYS.LATEST_PHOTOS, { settings, language });
  assert.equal(ack.success, true, ack.error);
  const body = ack.data.content;
  assert.deepEqual(validateWidgetContent(body), [], JSON.stringify(body));
  assert.ok(body.components.length <= 8, 'the budget of the core');
  assert.ok(body.components.filter((c) => c.type === 'text').length <= 2, 'two texts at most');
  return body;
}

const ofType = (body, type) => body.components.filter((component) => component.type === type);

test('the gallery: counters and the last photos, without thumbnails', async (t) => {
  const w = await world(t);
  const body = await content(w, {}, 'fr');
  assert.deepEqual(
    ofType(body, 'value').map((tile) => [tile.label, tile.value]),
    [
      ['Photos', 5],
      ['Albums', 3],
      ['Utilisateurs', 3],
    ],
  );
  const [list] = ofType(body, 'card-list');
  assert.equal(list.items.length, 5);
  assert.deepEqual(list.items[0], {
    title: 'Photo 4',
    subtitle: 'Famille · 25 oct. 2026',
    description: 'Photo 4\nFamille\nAjoutée le 25 oct. 2026, 05:50',
  });
  assert.ok(
    list.items.every((item) => item.image === undefined),
    'no thumbnail by default',
  );
});

test('thumbnails on demand, served from the gallery, only for the photos shown', async (t) => {
  const w = await world(t);
  const body = await content(w, { thumbnails: true });
  const [list] = ofType(body, 'card-list');
  assert.equal(list.items[0].image, 'photo-5');
  const ack = await w.fake.widgetGetImage('photo-5');
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.image, THUMB.toString('base64'));
  // Read on the configured address, not the host written in the answer.
  assert.match(w.server.thumbRequests[0].path, /^\/i\.php\?\/upload\/.+-2s\.jpg$/);
  for (const key of ['photo-99', 'thumb-5', '../etc/passwd']) {
    const refused = await w.fake.widgetGetImage(key);
    assert.equal(refused.success, false, key);
  }
});

test('a followed album: its name, its photos, its last photos', async (t) => {
  const w = await world(t, { config: { ...CONFIG, albums: 'Vacances 2026' } });
  w.server.add(makeImage(6, { albums: [3], at: Date.parse('2026-10-25T07:30:00Z') }));
  await w.hub.refresh();
  const body = await content(w, { album: albumDevice(w.gladys, 1), thumbnails: true });
  assert.deepEqual(ofType(body, 'text')[0].text, 'Vacances 2026');
  assert.deepEqual(
    ofType(body, 'value').map((tile) => tile.value),
    [4],
  );
  const [list] = ofType(body, 'card-list');
  assert.deepEqual(
    list.items.map((item) => item.title),
    ['Photo 6', 'Photo 3', 'Photo 2', 'Photo 1'],
  );
  const ack = await w.fake.widgetGetImage('photo-6');
  assert.equal(ack.success, true, ack.error);
  // The gallery device, or an album no longer followed: the whole gallery.
  for (const album of [galleryDevice(w.gladys), albumDevice(w.gladys, 2)]) {
    const gallery = await content(w, { album });
    assert.equal(ofType(gallery, 'value').length, 3);
  }
});

test('not configured, unreachable, empty', async (t) => {
  const empty = await world(t, { config: {} });
  assert.match((await content(empty)).components[0].text, /Enter the address/);

  const down = await world(t, { config: { server_url: 'http://192.0.2.99' } });
  assert.match((await content(down)).components[0].text, /does not answer/);

  const w = await world(t);
  w.server.online = false;
  await w.hub.refresh();
  const stale = await content(w);
  assert.equal(ofType(stale, 'value').length, 3, 'the last counters stay');
  assert.match(ofType(stale, 'text')[0].text, /does not answer/);

  const nothing = await world(t, { config: { server_url: SERVER_URL } });
  nothing.server.images = [];
  await nothing.hub.refresh();
  assert.match(ofType(await content(nothing), 'text')[0].text, /No photo yet/);
});

test('a new photo asks Gladys to refresh the widget', async (t) => {
  const w = await world(t);
  const before = w.fake.widgetRefreshes.length;
  await w.hub.refresh();
  assert.equal(w.fake.widgetRefreshes.length, before, 'nothing changed');
  w.server.add(makeImage(6, { at: Date.parse('2026-10-25T07:30:00Z') }));
  await w.hub.refresh();
  assert.equal(w.fake.widgetRefreshes.length, before + 1);
});
