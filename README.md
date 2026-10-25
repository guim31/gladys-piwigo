# Piwigo for Gladys Assistant

External integration connecting a [Piwigo](https://piwigo.org) gallery
(self-hosted photo gallery) to
[Gladys Assistant](https://gladysassistant.com), built on the official
[JavaScript SDK](https://github.com/GladysAssistant/integration-sdk-js) and the
[integration template](https://github.com/GladysAssistant/integration-template-js).

## Features

| Surface          | What you get                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| Gallery device   | Photos, albums, users (administrator account), last photo added (name, album, day)                                   |
| Album devices    | One per followed album: photos (sub-albums included), date of the last addition                                      |
| Scene triggers   | `photos_added` (any upload), `album_photos_added` (filter: album name)                                               |
| Scene action     | `get_latest_photos`: reads the last photos of the gallery or of an album; outputs the count of 24 hours and the last |
| Dashboard widget | `latest_photos`: counters and the last photos, of the gallery or of a followed album; thumbnails only on demand      |

Texts and documentation in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- A Piwigo gallery on the local network, and an **API key** (Piwigo 16+:
  profile → API keys) pasted whole (`pkid-…:secret`). The user name and
  password of an account work too (any Piwigo with the web API), and without
  either the integration reads the public albums as a guest.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-piwigo` (or
   install **Piwigo** from the catalog once it is listed).
2. In **Configuration**, enter the address of your gallery
   (`http://192.168.1.20/piwigo`) and the API key, and optionally the albums to
   follow (names, paths or ids). Save, then click **Test the connection**.
3. Open the **Discover** tab and add the **Piwigo** device and the album
   devices.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- Piwigo web services (`ws.php?format=json`) only, with the API key in the
  `X-PIWIGO-API` header (Piwigo 16), or a session (`pwg_id` cookie) opened with
  `pwg.session.login` and opened again when Piwigo forgets it.
- One reading every 1, 5 (default) or 15 minutes, on a timer of the container
  (`should_poll: false`): `pwg.session.getStatus`, `pwg.getInfos`
  (administrators only), `pwg.categories.getList` (recursive),
  `pwg.categories.getImages` (the last 50 additions).
- Photo ids only grow: new photos are announced from the last id seen, album
  growth from the photo count of each album, both kept in `/data`: once, also
  across restarts.
- The widget thumbnails (the 240 px `2small` size, opt-in) are read on the
  configured address and go through the widget image proxy of Gladys, for the
  photos the widget lists only.
- Quiet logs: the lifecycle and the errors at info, once; photo names only at
  debug.

## Checked against a real gallery

The client, the parsers and the scenarios were checked against **Piwigo
16.4.0** (the `linuxserver/piwigo` image with MariaDB 11): installation,
albums and a sub-album, photos uploaded with `pwg.images.addSimple`, an API key
created from the web session, an administrator and a normal account, the guest
view, refused passwords and keys. The answers in `test/fixtures/piwigo/` are
real (tokens removed, addresses anonymized), and the integration ran in its
locked-down container against that gallery. It has not yet run in a real
Gladys installation: feedback welcome.

## Limitations

- Polling, not push: new photos reach Gladys at the next reading.
- Only what the account sees: a guest sees the public albums only, and the
  number of users needs an administrator account.
- The photos Piwigo keeps in its upload "lounge" show once it publishes them.
- One gallery per installation of the integration.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against a fake Piwigo gallery built from real answers
(`test/fixtures/piwigo/`) and the fake Gladys of the SDK; they never touch the
network. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Piwigo](https://github.com/Piwigo/Piwigo) (GPL-2.0) by the Piwigo team and
  contributors, and its
  [web API documentation](https://piwigo.org/doc/doku.php?id=dev:webapi:start).
  No code was copied from it.
- The cover shows the Piwigo logo, taken from the official repository
  (`admin/themes/default/images/piwigo-orange.svg`), in white on the Piwigo
  orange.
- Built on the official
  [integration template](https://github.com/GladysAssistant/integration-template-js)
  and [SDK](https://github.com/GladysAssistant/integration-sdk-js).

## Disclaimer

Not affiliated with, nor endorsed by, the Piwigo project.

## License

[Apache-2.0](LICENSE)
