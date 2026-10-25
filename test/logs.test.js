// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only. A normal reading writes nothing, a failure that repeats is logged
// once, and its end once. Never a password nor an API key, never a photo
// name at info.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_KEY, SERVER_URL, createWorld, makeImage } from './helpers/world.js';

/** Capture the lines of the SDK logger at LOG_LEVEL=info. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('a normal reading cycle writes nothing at info, not even a name', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t, { config: { server_url: SERVER_URL, password: API_KEY, albums: '3' } });
  assert.ok(
    logs.texts().some((text) => text.includes('connected')),
    'the start is logged',
  );
  logs.clear();
  for (let i = 0; i < 5; i += 1) {
    w.clock.advance(5 * 60_000);
    w.server.add(makeImage(10 + i, { albums: [3], at: w.clock.now() }));
    await w.hub.refresh();
  }
  // Each photo: photos_added, and album_photos_added for the album and its parent.
  assert.equal(w.fake.sceneEvents.length, 15, 'events were fired');
  assert.deepEqual(logs.texts(), []);
});

test('an album to follow that does not exist is logged once', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t, {
    config: { server_url: SERVER_URL, password: API_KEY, albums: 'Nope' },
  });
  for (let i = 0; i < 3; i += 1) {
    await w.hub.refresh();
  }
  const warnings = logs.texts().filter((text) => text.includes('not found'));
  assert.equal(warnings.length, 1, logs.texts().join('\n'));
  assert.match(warnings[0], /Albums to follow not found: Nope/);
});

test('a gallery that stays down is logged once, and once when it is back', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.server.online = false;
  for (let i = 0; i < 6; i += 1) {
    await w.hub.refresh();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.equal(logs.lines[0].stream, 'err');
  logs.clear();
  w.server.online = true;
  await w.hub.refresh();
  await w.hub.refresh();
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /connection restored/);
});

test('refused credentials are logged once, never the password', async (t) => {
  const logs = captureLogs(t, 'debug');
  const w = await world(t, {
    config: { server_url: SERVER_URL, username: 'admin', password: 'wrong-pass-42' },
  });
  for (let i = 0; i < 5; i += 1) {
    await w.hub.refresh();
  }
  const warnings = logs.lines.filter((line) => line.stream === 'err');
  assert.equal(warnings.length, 1, logs.texts().join('\n'));
  assert.match(warnings[0].text, /Credentials refused/);
  const text = logs.texts().join('\n');
  assert.ok(!text.includes('wrong-pass-42'), 'never the password');
  assert.ok(!text.includes(API_KEY.split(':')[1]), 'never the API key');
});

test('Gladys refusing the states is logged once', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.gladys.publishStates = async () => {
    throw new Error('HTTP 500');
  };
  for (let i = 0; i < 4; i += 1) {
    w.server.add(makeImage(10 + i, { at: w.clock.now() + i * 1000 }));
    await w.hub.refresh();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /States refused/);
});
