// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Piwigo gallery: its address, an API key or the user name and password
// of an account (nothing: the guest view, public albums only), the albums to
// follow as devices, the reading interval and the language of the names.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Reading intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['60', '300', '900'];

export const DEFAULT_CONFIG = {
  server_url: '',
  username: '',
  password: '',
  albums: '',
  poll_interval: '300',
  language: 'fr',
};

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.30:8080`), or the URL copied from the browser, with the path of
 * a gallery in a sub-folder (`https://example.org/photos/index.php?/category/2`).
 * HTTP by default; the query, the fragment, a trailing slash and the page
 * (`index.php`, `ws.php`, `admin.php`...) dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/base]`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs and the device params.
  if (url.username || url.password) {
    return null;
  }
  // A page of the gallery copied (index.php, picture.php, ws.php...): keep the base.
  const path = url.pathname.replace(/\/[a-z_]+\.php(\/.*)?$/i, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };
  const typed = text('server_url');
  const url = parseServerUrl(typed);
  const username = text('username');
  const password = text('password');
  // A user name needs its password. A password alone must be an API key.
  const usable =
    Boolean(url) && !(username && !password) && !(password && !username && !isApiKey(password));
  return {
    url: usable ? url : null,
    username: usable && username ? username : null,
    password: usable && password ? password : null,
    // Something typed, but not usable: the status says so.
    incomplete: Boolean(typed || username || password) && !usable,
    albums: parseAlbumList(source.albums),
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

const isApiKey = (value) => /^pkid-\d{8}-[a-z0-9]{20}:[a-z0-9]{40}$/i.test(value);

/**
 * The albums to follow, as typed: ids (`12`) or names (`Holidays`), or full
 * paths (`Holidays / Beach`), separated by commas or semicolons. Duplicates
 * dropped, 50 at most.
 * @returns {string[]}
 */
export function parseAlbumList(raw) {
  if (typeof raw !== 'string') {
    return [];
  }
  const seen = new Set();
  const list = [];
  for (const part of raw.split(/[,;\n]/)) {
    const value = part
      .trim()
      .replace(/^#/, '')
      .replace(/\s*\/\s*/g, ' / ');
    if (value && !seen.has(value.toLowerCase())) {
      seen.add(value.toLowerCase());
      list.push(value);
    }
  }
  return list.slice(0, 50);
}

/**
 * The albums of `albums` (parseAlbums) named by the list: by id, full path or
 * name (case ignored). Also says which entries match nothing.
 */
export function matchAlbums(list, albums) {
  const matched = [];
  const missing = [];
  for (const entry of list) {
    const lower = entry.toLowerCase();
    const album = /^\d+$/.test(entry)
      ? albums.find((item) => item.id === Number(entry))
      : (albums.find((item) => item.path.toLowerCase() === lower) ??
        albums.find((item) => item.name.toLowerCase() === lower));
    if (!album) {
      missing.push(entry);
    } else if (!matched.includes(album)) {
      matched.push(album);
    }
  }
  return { matched, missing };
}
