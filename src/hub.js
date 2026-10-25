// -----------------------------------------------------------------------------
// The hub: reads the Piwigo gallery on a timer of the container, publishes
// the states of the gallery and of the followed albums when they change,
// fires the scene events, and answers the scene action and the widget.
//
// One reading (every `pollIntervalMs`, 1 to 15 min, configuration) is three
// or four requests: who Piwigo sees (pwg.session.getStatus), the users of
// the gallery (pwg.getInfos, administrators only), the albums, the last
// photos added. Photo ids only grow: the photos above the last id seen fire
// `photos_added`; an album holding more photos than at the previous reading
// fires `album_photos_added`. The last id and the album counts live under
// /data: an addition is announced once, also across restarts.
//
// Gladys never polls the devices (should_poll: false): the scene events must
// fire even before a device is added.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { matchAlbums } from './config.js';
import {
  albumIds,
  albumValues,
  buildAlbumDevice,
  buildGalleryDevice,
  galleryIds,
  galleryValues,
} from './devices.js';
import { AUTH_MODES, ERROR_KINDS, PiwigoClient, authOf } from './piwigo/client.js';
import { parseAlbums, parseImages, parseInfos, parseStatus, stamp } from './piwigo/model.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  describePhoto,
  everyLanguage,
  labelled,
  momentOf,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'piwigo-hub' });

// Widget keys (manifest `widgets`): permanent once published.
export const WIDGET_KEYS = Object.freeze({
  LATEST_PHOTOS: 'latest_photos',
});

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  PHOTOS_ADDED: 'photos_added',
  ALBUM_PHOTOS_ADDED: 'album_photos_added',
});

export const HUB_TIMINGS = {
  // Photos read at each reading (the newest first).
  recentCount: 50,
  // Photos kept for the widget.
  shownCount: 8,
  // Photos read by the scene action.
  actionCount: 500, // the most Piwigo returns in one page
  // At most this many album events per reading.
  maxEventsPerRead: 10,
  // The last photos of an album shown by the widget are read again after this.
  albumCacheMs: 60_000,
  // Republish an unchanged value this often (Gladys flags a value older than 48 h).
  heartbeatMs: 12 * 60 * 60_000,
};

const DAY_MS = 24 * 60 * 60_000;

const signature = (config) => JSON.stringify([config.url, config.username, config.password]);

/**
 * The gallery and the account reading it (never a secret: the id of an API
 * key, a user name, or "guest"). Another account sees other photos and
 * albums: its additions are counted again from now.
 */
export function identityOf(config) {
  if (!config.url) {
    return null;
  }
  const auth = authOf(config.username, config.password);
  const account =
    auth.mode === AUTH_MODES.API_KEY
      ? auth.key.split(':')[0]
      : auth.mode === AUTH_MODES.SESSION
        ? `user:${config.username}`
        : 'guest';
  return `${config.url}|${account}`;
}

const freshSaved = (source) => ({ source, lastId: null, total: null, albums: null });

const emptySnapshot = () => ({
  photos: null,
  albums: null,
  users: null,
  admin: false,
  latest: null,
});

export class PiwigoHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/piwigo/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.client = null;
    this.signature = null;
    this.reachable = null;
    this.error = null;
    /** pwg.session.getStatus, parsed (parseStatus); null before the first reading. */
    this.status = null;
    /** Clock of Piwigo minus ours, to tell "the last 24 hours" in its time. */
    this.serverOffset = 0;
    this.snapshot = emptySnapshot();
    /** The last photos added, the newest first (parseImages). */
    this.recent = [];
    /** Every album the account sees (parseAlbums). */
    this.albums = [];
    /** The followed albums found in the gallery, and the entries not found. */
    this.followed = [];
    this.missing = [];
    /** The last photos of the albums shown by the widget: id -> { at, images }. */
    this.albumCache = new Map();
    /** Last value published per feature external id: { value, at }. */
    this.published = new Map();
    this.transportsKey = null;
    this.connection = null;
    this.devicesKey = null;
    /** Kept under /data: whose additions, last photo id, photo total, album counts. */
    this.saved = freshSaved(null);
    this.timer = null;
    this.running = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  // --- Logs ------------------------------------------------------------------

  /** Log a problem once (`level` warn or error), its repeats at debug. */
  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  /** The problem `key` is gone: the next occurrence is logged again. */
  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    const count = (value) => (Number.isInteger(value) && value >= 0 ? value : null);
    this.saved = {
      source: typeof saved.source === 'string' ? saved.source : null,
      lastId: count(saved.lastId),
      total: count(saved.total),
      albums: saved.albums && typeof saved.albums === 'object' ? saved.albums : null,
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.transportsKey = null;
    this.connection = null;
    this.devicesKey = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    this.config = config;
    if (signature(config) !== this.signature) {
      this.signature = signature(config);
      this.reset();
      this.client = config.url
        ? new PiwigoClient({
            url: config.url,
            username: config.username,
            password: config.password,
            request: this.request,
          })
        : null;
      // Another gallery or another account: its additions are counted again from now.
      if (config.url && this.saved.source !== identityOf(config)) {
        this.saved = freshSaved(identityOf(config));
        this.store.save(this.saved);
      }
    }
    try {
      if (this.status) {
        // Only the albums or the language changed: no need to wait for the reading.
        this.followAlbums();
        await this.publishDevices();
      }
      await this.refresh();
    } finally {
      // Even after a failure: the next tick tries again.
      this.schedule();
    }
  }

  reset() {
    this.published.clear();
    this.reachable = null;
    this.error = null;
    this.status = null;
    this.snapshot = emptySnapshot();
    this.recent = [];
    this.albums = [];
    this.followed = [];
    this.missing = [];
    this.albumCache.clear();
    this.transportsKey = null;
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running?.catch(() => {});
    await this.store.flush();
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.timer = setTimeout(async () => {
      try {
        await this.refresh();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Reading failed', err, 'error');
      }
      this.schedule();
    }, this.config.pollIntervalMs);
  }

  // --- Reading the gallery -------------------------------------------------------

  /** One reading. Concurrent calls share the reading in progress. */
  refresh() {
    if (this.running && this.runningClient === this.client) {
      return this.running;
    }
    // A reading of a previous configuration may still run: this one follows it.
    const previous = this.running ?? Promise.resolve();
    const run = previous
      .catch(() => {})
      .then(() => this.read())
      .finally(() => {
        if (this.running === run) {
          this.running = null;
        }
      });
    this.running = run;
    this.runningClient = this.client;
    return run;
  }

  async read() {
    const client = this.client;
    if (!client) {
      await this.publishDevices();
      await this.afterChanges(false);
      return;
    }
    // A reconfiguration during the reading replaces this.saved: this reading keeps its own.
    const saved = this.saved;
    let changed;
    try {
      const status = parseStatus(await client.status());
      const infos = status.admin
        ? await client.infos().then(parseInfos, (err) => {
            if (err.kind !== ERROR_KINDS.HTTP) {
              throw err;
            }
            return parseInfos(null);
          })
        : parseInfos(null);
      const albums = parseAlbums(await client.albums());
      const recent = parseImages(await client.recent({ count: this.timings.recentCount }));
      if (client !== this.client) {
        return; // reconfigured meanwhile: this reading is dropped
      }
      if (this.error) {
        logger.info('Piwigo: connection restored');
      } else if (this.reachable === null) {
        logger.info(
          `Piwigo: connected, version ${status.version}${status.guest ? ' (guest view)' : ''}`,
        );
      }
      const before = this.widgetKey();
      const wasReachable = this.reachable;
      this.error = null;
      this.reachable = true;
      this.status = status;
      this.serverOffset = status.now === null ? 0 : status.now - this.now();
      this.albums = albums;
      this.recent = recent.images.slice(0, this.timings.shownCount);
      this.snapshot = {
        photos: recent.total,
        albums: albums.length,
        users: infos.users,
        admin: status.admin,
        latest: recent.images[0]
          ? describePhoto(recent.images[0], this.albumName(recent.images[0]), this.config.language)
          : null,
      };
      this.followAlbums();
      await this.publishDevices();
      if (client !== this.client) {
        return;
      }
      await this.announcePhotos(recent, saved);
      await this.announceAlbums(albums, saved);
      await this.publishStates();
      changed = wasReachable !== true || before !== this.widgetKey();
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      if (client !== this.client) {
        return;
      }
      changed = this.reachable !== false;
      this.applyFailure(err);
    }
    await this.afterChanges(changed);
  }

  /** What the widget shows of the gallery: it is refreshed when this changes. */
  widgetKey() {
    return JSON.stringify([
      this.snapshot,
      this.recent.map((image) => image.id),
      this.followed.map((album) => [album.id, album.photos]),
    ]);
  }

  /** The followed albums of the configuration, among the albums of the gallery. */
  followAlbums() {
    const { matched, missing } = matchAlbums(this.config.albums, this.albums);
    this.followed = matched;
    const key = `albums:${missing.join('|')}`;
    if (missing.join('|') !== this.missing.join('|')) {
      for (const old of this.warned) {
        if (old.startsWith('albums:')) {
          this.warned.delete(old);
        }
      }
      if (missing.length > 0) {
        this.problem(key, `Albums to follow not found: ${missing.join(', ')}`);
      }
    }
    this.missing = missing;
  }

  /** The name of the (first) album of a photo, null when unknown. */
  albumName(image) {
    const album = this.albums.find((item) => image.albums.includes(item.id));
    return album ? album.name : null;
  }

  applyFailure(err) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    this.reachable = false;
    // One warning when the problem starts (or changes), not one per reading.
    if (wasError !== err.kind) {
      logger.warn(`Piwigo: ${err.message}`);
    } else {
      logger.debug(`Piwigo: ${err.message} (again)`);
    }
  }

  /**
   * Announce the photos above the last id seen. The first reading of a
   * gallery is the starting point, not news.
   */
  async announcePhotos({ images, total }, saved) {
    const newest = Math.max(0, ...images.map((image) => image.id));
    const { lastId, total: previousTotal } = saved;
    const fresh = lastId === null ? [] : images.filter((image) => image.id > lastId);
    saved.total = total;
    saved.lastId = lastId === null ? newest : Math.max(lastId, newest);
    this.save(saved);
    if (fresh.length === 0) {
      return; // the first reading of a gallery is the starting point
    }
    // Every photo read is new: more may have come than the page holds.
    const more =
      fresh.length === images.length && previousTotal !== null
        ? Math.max(0, total - previousTotal)
        : 0;
    const [latest] = fresh;
    const count = Math.max(fresh.length, more);
    logger.debug(`New photos: ${count}`);
    await this.fire(TRIGGERS.PHOTOS_ADDED, galleryIds(this.gladys).device, {
      count,
      name: latest.name,
      album: this.albumName(latest),
      added_at: stamp(latest.addedAt),
      url: latest.pageUrl,
    });
  }

  /**
   * Announce the albums holding more photos than at the previous reading. An
   * album seen for the first time counts from zero only when it is newer than
   * every album known (album ids grow too): an older one was hidden (rights)
   * and is a starting point. Albums no longer seen keep their count.
   */
  async announceAlbums(albums, saved) {
    const previous = saved.albums;
    const newestKnown = previous ? Math.max(0, ...Object.keys(previous).map(Number)) : 0;
    const current = { ...previous };
    const grown = [];
    for (const album of albums) {
      const before = previous?.[album.id] ?? (album.id > newestKnown ? 0 : album.photos);
      current[album.id] = album.photos;
      // The first reading of the albums is the starting point.
      if (previous && album.photos > before) {
        grown.push({ album, added: album.photos - before, before });
      }
    }
    // Past the cap, an album keeps its previous count: announced at the next reading.
    for (const { album, before } of grown.slice(this.timings.maxEventsPerRead)) {
      current[album.id] = before;
    }
    saved.albums = current;
    this.save(saved);
    for (const { album, added } of grown.slice(0, this.timings.maxEventsPerRead)) {
      this.albumCache.delete(album.id);
      logger.debug(`Album ${album.id}: ${added} new photo(s)`);
      const followed = this.followed.some((item) => item.id === album.id);
      await this.fire(
        TRIGGERS.ALBUM_PHOTOS_ADDED,
        followed ? albumIds(this.gladys, album.id).device : galleryIds(this.gladys).device,
        {
          album: album.name,
          album_id: album.id,
          path: album.path,
          count: added,
          total: album.photos,
          url: album.url,
        },
      );
    }
  }

  /** Write the state, unless a reconfiguration replaced it meanwhile. */
  save(saved) {
    if (saved === this.saved) {
      this.store.save(saved);
    }
  }

  /** Fire a scene event. */
  async fire(key, device, data) {
    try {
      await this.gladys.publishSceneEvent(key, { device, ...data });
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  async publishDevices() {
    if (this.config?.url && !this.status) {
      return; // the users counter depends on the account: wait for the first reading
    }
    const language = this.config?.language;
    const devices = this.config?.url
      ? [
          buildGalleryDevice(
            this.gladys,
            { url: this.config.url, admin: this.status.admin },
            language,
          ),
          ...this.followed.map((album) => buildAlbumDevice(this.gladys, album, language)),
        ]
      : [];
    const key = JSON.stringify(devices);
    if (key === this.devicesKey) {
      return;
    }
    // Even an empty list: the Discovery tab then shows no stale device.
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesKey = key;
      this.resolved('devices');
    } catch (err) {
      // Sent again at the next reading.
      this.problem('devices', `Devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: publish the devices again, read the gallery. */
  async rediscover() {
    this.devicesKey = null;
    await this.publishDevices();
    await this.refresh();
  }

  /** The user added a device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    const ours = [
      galleryIds(this.gladys).device,
      ...this.followed.map((album) => albumIds(this.gladys, album.id).device),
    ];
    if (!ours.includes(device.external_id)) {
      return;
    }
    this.transportsKey = null;
    await this.publishStates({ force: true });
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEYS.LATEST_PHOTOS);
  }

  /** Every feature value of the gallery and of the followed albums. */
  values() {
    const language = this.config?.language;
    return [
      ...galleryValues(this.gladys, this.snapshot),
      ...this.followed.flatMap((album) =>
        albumValues(this.gladys, album.id, {
          photos: album.photos,
          lastAdded: album.lastAt === null ? null : momentOf(album.lastAt, language),
        }),
      ),
    ];
  }

  /** One publication at a time: a late answer never records an older value. */
  publishStates(options) {
    const run = (this.publishing ?? Promise.resolve()).then(() => this.publishNow(options));
    this.publishing = run;
    return run;
  }

  async publishNow({ force = false } = {}) {
    // While the gallery is down, the last counts are not republished as fresh.
    if (this.reachable !== true && !force) {
      return;
    }
    const now = this.now();
    const states = [];
    for (const { externalId, value, text } of this.values()) {
      if (value === null) {
        continue;
      }
      const last = this.published.get(externalId);
      if (!force && last && last.value === value && now - last.at < this.timings.heartbeatMs) {
        continue;
      }
      states.push(
        text
          ? { device_feature_external_id: externalId, text: String(value) }
          : { device_feature_external_id: externalId, state: value },
      );
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishStates(states);
      for (const state of states) {
        this.published.set(state.device_feature_external_id, {
          value: state.text ?? state.state,
          at: now,
        });
      }
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async afterChanges(changed) {
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (changed) {
      this.gladys.requestWidgetRefresh(WIDGET_KEYS.LATEST_PHOTOS);
    }
  }

  async publishTransports() {
    if (this.reachable === null || !this.config?.url) {
      return;
    }
    const transport = this.reachable ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE;
    const list = [
      galleryIds(this.gladys).device,
      ...this.followed.map((album) => albumIds(this.gladys, album.id).device),
    ].map((externalId) => ({ external_id: externalId, transport }));
    const key = JSON.stringify(list);
    if (key === this.transportsKey) {
      return;
    }
    try {
      await this.gladys.publishTransports(list);
      this.transportsKey = key;
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config?.url) {
      return {
        connected: false,
        message: this.config?.incomplete ? CONNECTION_TEXT.invalid : CONNECTION_TEXT.noServer,
      };
    }
    if (this.error) {
      return {
        connected: false,
        message: everyLanguage(ERROR_TEXT[this.error.kind], (text, language) =>
          labelled('Piwigo', text, language).slice(0, 200),
        ),
      };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  // --- Scene action and widget -----------------------------------------------------------

  requireClient() {
    if (!this.client) {
      throw new Error(pick(ACTION_TEXT.noServer, this.config?.language));
    }
    return this.client;
  }

  /** The error of an action, in the language of the configuration. */
  actionError(err) {
    if (!err.kind) {
      return err;
    }
    const text = pick(ERROR_TEXT[err.kind], this.config.language);
    return new Error(labelled('Piwigo', text, this.config.language));
  }

  /**
   * Read the last photos now, of the gallery or of an album (`entry`: name,
   * full path or id). Answers the outputs of the scene action.
   */
  async latestPhotos(entry) {
    const client = this.requireClient();
    try {
      // A session Piwigo forgot would read the guest view without an error.
      await client.ensureSession();
      let album = null;
      if (entry) {
        const albums = parseAlbums(await client.albums());
        [album] = matchAlbums([entry], albums).matched;
        if (!album) {
          throw new Error(pick(ACTION_TEXT.unknownAlbum, this.config.language));
        }
      }
      const { images, total } = parseImages(
        await client.recent({ count: this.timings.actionCount, album: album?.id ?? null }),
      );
      const serverNow = this.now() + this.serverOffset;
      const [last] = images;
      return {
        count_24h: images.filter(
          (image) => image.addedAt !== null && serverNow - image.addedAt <= DAY_MS,
        ).length,
        total,
        name: last?.name ?? '',
        album: (last && this.albumName(last)) ?? album?.name ?? '',
        added_at: stamp(last?.addedAt ?? null),
        url: last?.pageUrl ?? '',
      };
    } catch (err) {
      throw this.actionError(err);
    }
  }

  /** The followed album of a device external id, null for the gallery or another one. */
  followedAlbum(externalId) {
    return (
      this.followed.find((album) => albumIds(this.gladys, album.id).device === externalId) ?? null
    );
  }

  /** The last photos of an album, for the widget (read again after `albumCacheMs`). */
  async albumRecent(album) {
    const cached = this.albumCache.get(album.id);
    if (cached && this.now() - cached.at < this.timings.albumCacheMs) {
      return cached.images;
    }
    const client = this.requireClient();
    await client.ensureSession();
    const { images } = parseImages(
      await client.recent({ count: this.timings.shownCount, album: album.id }),
    );
    this.albumCache.set(album.id, { at: this.now(), images });
    return images;
  }

  /** The thumbnail URL of a photo the widget shows, null for any other photo. */
  thumbUrlOf(id) {
    const lists = [this.recent, ...[...this.albumCache.values()].map((entry) => entry.images)];
    for (const list of lists) {
      const image = list.find((item) => item.id === id);
      if (image) {
        return image.thumbUrl;
      }
    }
    return null;
  }

  /** "Test the connection": read the gallery now, one line. */
  async testConnection() {
    await this.refresh();
    const status = this.connectionStatus();
    if (!status.connected) {
      return status.message;
    }
    const { version, username, guest } = this.status;
    return everyLanguage(REPORT_TEXT, (text) =>
      [
        guest ? text.guest(version) : text.ok(version, username),
        text.gallery(this.snapshot.photos, this.snapshot.albums),
        ...(this.config.albums.length > 0 ? [text.followed(this.followed.length)] : []),
        ...(this.missing.length > 0 ? [text.missing(this.missing.join(', '))] : []),
      ]
        .join(', ')
        .slice(0, 500),
    );
  }
}
