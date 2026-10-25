// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Piwigo gallery on a fake
// network, a temporary /data and a manual clock, with the integration
// wired on top through registerHandlers. No timer runs unless
// `timers: true`: the tests read the server with `world.hub.refresh()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { API_KEY, FakePiwigo, THUMB, createNetwork, makeImage } from './fakePiwigo.js';

process.env.LOG_LEVEL ??= 'silent';

export const SERVER_URL = 'http://192.0.2.30:8080/piwigo';

/** A manual clock: shortly after the real captures (Piwigo's clock says 08:00). */
export function createClock(start = Date.parse('2026-10-25T08:00:00Z')) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const CONFIG = { server_url: SERVER_URL, password: API_KEY, language: 'en' };

/**
 * @param {object} [options]
 * @param {FakePiwigo} [options.server]
 * @param {object} [options.config] raw integration config
 */
export async function createWorld({
  clock = createClock(),
  server = new FakePiwigo({ now: clock.now }),
  config = CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-piwigo-')),
  timings = {},
  timers = false,
} = {}) {
  const network = createNetwork({ [SERVER_URL]: server });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, network, server, app, hub: app.hub, clock, dataDir };
}

export const galleryDevice = (gladys) => gladys.externalIds('gallery', 'main').device;
export const feature = (gladys, key) => gladys.externalIds('gallery', 'main').feature(key);
export const albumDevice = (gladys, id) => gladys.externalIds('album', String(id)).device;
export const albumFeature = (gladys, id, key) =>
  gladys.externalIds('album', String(id)).feature(key);

/** Resolves once `predicate()` holds (background work of the hub). */
export async function until(predicate, label = 'condition') {
  for (let i = 0; i < 200; i += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

export { API_KEY, FakePiwigo, THUMB, makeImage };
