// -----------------------------------------------------------------------------
// Piwigo web services client (ws.php?format=json), checked against Piwigo
// 16.4.0 (test/fixtures/piwigo/ holds its real answers).
//
// Authentication, never in the URL nor in the logs:
// - an API key (Piwigo 16+, Profile > API keys): `pkid-YYYYMMDD-…:secret`,
//   sent in the `X-PIWIGO-API` header with every request (no session);
// - a user name and password: `pwg.session.login` opens a session (cookie
//   `pwg_id`), opened again once when Piwigo has forgotten it;
// - nothing: the guest view (public albums only).
//
// Pitfalls of the real server:
// - a forgotten session is not an error: Piwigo answers as the guest, with
//   the public albums only. `pwg.session.getStatus` tells it (`guest`);
// - a refused API key is an HTTP 401 `Invalid api_key`, a refused password an
//   HTTP 200 with `err: 999`;
// - `pwg.getInfos` is for administrators only (401 `Access denied` else);
// - the photos sent through the API wait in the "lounge" until Piwigo
//   publishes them: they are invisible until then, counters included;
// - the URLs of the answers carry the host Piwigo saw in the request: behind
//   a reverse proxy they may not be reachable from here, so the thumbnails
//   are read again on the configured address.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // API key, user name or password refused
  NOT_PIWIGO: 'not_piwigo', // something answers, not the web services of Piwigo
  REDIRECT: 'redirect', // the address redirects (HTTP to HTTPS, a login page)
  HTTP: 'http', // any other error
});

export class PiwigoError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status, code }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'PiwigoError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// An API key of Piwigo 16: its identifier, then its secret.
const API_KEY = /^pkid-\d{8}-[a-z0-9]{20}:[a-z0-9]{40}$/i;
const API_KEY_ID = /^pkid-\d{8}-[a-z0-9]{20}$/i;

export const AUTH_MODES = Object.freeze({ API_KEY: 'api_key', SESSION: 'session', GUEST: 'guest' });

/**
 * How to authenticate: the whole API key pasted in the password field (user
 * name ignored), or its identifier as user name and its secret as password;
 * else a user name and password; else the guest.
 */
export function authOf(username, password) {
  if (password && API_KEY.test(password)) {
    return { mode: AUTH_MODES.API_KEY, key: password };
  }
  if (
    username &&
    password &&
    API_KEY_ID.test(username) &&
    API_KEY.test(`${username}:${password}`)
  ) {
    return { mode: AUTH_MODES.API_KEY, key: `${username}:${password}` };
  }
  if (username && password) {
    return { mode: AUTH_MODES.SESSION };
  }
  return { mode: AUTH_MODES.GUEST };
}

// Order of the "last photos": the addition date, then the id (same second).
const RECENT_ORDER = 'date_available desc, id desc';

// The paths of Piwigo a picture URL may point to, below the gallery root.
const MEDIA_PATH = /\/(i\.php\?|_data\/|upload\/|galleries\/)/;

export class PiwigoClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL of the gallery (with its path, no trailing slash)
   * @param {string|null} [options.username]
   * @param {string|null} [options.password]
   * @param {Function} [options.request] HTTP seam (src/piwigo/http.js)
   */
  constructor({ url, username = null, password = null, request = httpRequest }) {
    this.url = url;
    this.username = username;
    this.password = password;
    this.request = request;
    this.auth = authOf(username, password);
    this.cookie = null;
    this.login = null;
  }

  headers() {
    if (this.auth.mode === AUTH_MODES.API_KEY) {
      return { 'X-PIWIGO-API': this.auth.key };
    }
    return this.cookie ? { cookie: this.cookie } : {};
  }

  /** One web service call; resolves its `result`. */
  async call(method, params = {}) {
    let answer;
    try {
      answer = await this.request(`${this.url}/ws.php?format=json&method=${method}`, {
        method: 'POST',
        form: params,
        headers: this.headers(),
      });
    } catch (err) {
      throw transportError(err, method);
    }
    const { status, headers = {}, body } = answer;
    const cookie = sessionCookie(headers['set-cookie']);
    if (cookie && this.auth.mode === AUTH_MODES.SESSION) {
      this.cookie = cookie;
    }
    if (status >= 300 && status < 400) {
      throw new PiwigoError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    let json;
    try {
      json = JSON.parse(body);
    } catch {
      if (status === 404 || (status >= 200 && status < 300)) {
        // A reverse proxy's login page, another web application...
        throw new PiwigoError(ERROR_KINDS.NOT_PIWIGO, `${method} did not answer JSON`, { status });
      }
      throw new PiwigoError(ERROR_KINDS.HTTP, `${method} answered HTTP ${status}`, { status });
    }
    if (!json || typeof json !== 'object' || !['ok', 'fail'].includes(json.stat)) {
      throw new PiwigoError(ERROR_KINDS.NOT_PIWIGO, `${method}: not a Piwigo answer`, { status });
    }
    if (json.stat === 'fail') {
      const code = Number(json.err);
      const message = typeof json.message === 'string' ? json.message.slice(0, 120) : '';
      if ((code === 401 && /api_key/i.test(message)) || code === 999) {
        throw new PiwigoError(ERROR_KINDS.AUTH, 'Credentials refused', { status, code });
      }
      if (code === 501) {
        // An unknown method: a Piwigo too old for it.
        throw new PiwigoError(ERROR_KINDS.NOT_PIWIGO, `${method} is unknown to this Piwigo`, {
          status,
          code,
        });
      }
      throw new PiwigoError(ERROR_KINDS.HTTP, `${method} failed: ${code} ${message}`, {
        status,
        code,
      });
    }
    return json.result;
  }

  /** Open a session with the user name and password (once for concurrent calls). */
  async openSession() {
    this.login ??= this.call('pwg.session.login', {
      username: this.username,
      password: this.password,
    }).finally(() => {
      this.login = null;
    });
    await this.login;
  }

  /**
   * The account Piwigo sees (`pwg.session.getStatus`): version, user, status,
   * time of the server. A session Piwigo has forgotten is opened again once.
   */
  async status() {
    if (this.auth.mode === AUTH_MODES.SESSION && !this.cookie) {
      await this.openSession();
    }
    let status = await this.call('pwg.session.getStatus');
    if (this.auth.mode === AUTH_MODES.SESSION && isGuest(status)) {
      this.cookie = null;
      await this.openSession();
      status = await this.call('pwg.session.getStatus');
      if (isGuest(status)) {
        throw new PiwigoError(ERROR_KINDS.AUTH, 'Credentials refused');
      }
    }
    if (!status || typeof status !== 'object' || typeof status.username !== 'string') {
      throw new PiwigoError(ERROR_KINDS.NOT_PIWIGO, 'pwg.session.getStatus: unexpected answer');
    }
    return status;
  }

  /** The figures of the gallery (administrators only). */
  infos() {
    return this.call('pwg.getInfos');
  }

  /** Every album the account sees, sub-albums included. */
  albums() {
    return this.call('pwg.categories.getList', { recursive: 'true' });
  }

  /**
   * The last photos added, the newest first: of the whole gallery, or of an
   * album and its sub-albums.
   */
  recent({ count, album = null }) {
    return this.call('pwg.categories.getImages', {
      per_page: count,
      page: 0,
      order: RECENT_ORDER,
      ...(album === null ? {} : { cat_id: album, recursive: 'true' }),
    });
  }

  /**
   * The address of a picture URL of an answer, on the configured address:
   * null when it does not point to a picture of the gallery.
   */
  mediaUrl(raw) {
    let url;
    try {
      url = new URL(String(raw));
    } catch {
      return null;
    }
    const relative = `${url.pathname}${url.search}`;
    const match = MEDIA_PATH.exec(relative);
    if (!match || relative.includes('..')) {
      return null;
    }
    return `${this.url}/${relative.slice(match.index + 1)}`;
  }

  /** The bytes of a picture (a thumbnail), with the credentials of the API. */
  async image(raw) {
    const url = this.mediaUrl(raw);
    if (!url) {
      throw new PiwigoError(ERROR_KINDS.HTTP, 'Not a picture of the gallery');
    }
    let answer;
    try {
      answer = await this.request(url, { binary: true, headers: this.headers() });
    } catch (err) {
      throw transportError(err, 'thumbnail');
    }
    if (answer.status !== 200) {
      throw new PiwigoError(ERROR_KINDS.HTTP, `Thumbnail answered HTTP ${answer.status}`, {
        status: answer.status,
      });
    }
    return answer.body;
  }
}

const isGuest = (status) => status?.username === 'guest' || status?.status === 'guest';

function sessionCookie(setCookie) {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const found = list.find((line) => /^pwg_id=[^;]+/.test(line) && !/^pwg_id=deleted/.test(line));
  return found ? found.split(';')[0] : null;
}

function transportError(err, what) {
  if (err.code === 'ETOOLARGE') {
    return new PiwigoError(ERROR_KINDS.HTTP, `${what}: answer too large`);
  }
  if (TLS_CODES.has(err.code)) {
    return new PiwigoError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
  }
  return new PiwigoError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
}
