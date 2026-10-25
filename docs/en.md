# Piwigo

Bring your [Piwigo](https://piwigo.org) photo gallery into Gladys, over your
local network: the number of photos, albums and users, the last photo added,
one device per album you want to follow, scenes that react when new photos
arrive or an album grows, a scene action that reads the last photos, and a
dashboard widget with the last photos.

The integration was tested against a real Piwigo gallery (the
`linuxserver/piwigo` Docker image, Piwigo 16.4.0), not yet in a real Gladys
installation: feedback is welcome on the
[Gladys forum](https://community.gladysassistant.com) or in the
[issues](https://github.com/guim31/gladys-piwigo/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- A **Piwigo** gallery reachable from Gladys (same network).
- Best: an **API key** (Piwigo 16 or later): in Piwigo, open your **profile**,
  **API keys**, create one, and copy the whole key: its identifier, a colon,
  its secret (`pkid-20261025-…:…`). The key acts as its account: an
  **administrator** key also gives the number of users.
- Otherwise, the user name and password of an account (any Piwigo version
  with the web API).
- With neither, the integration reads the gallery as a guest: public albums
  only.

## Set up

1. Install the integration from the Gladys catalog.
2. In **Configuration**, enter the **Gallery URL** with its port and folder
   (for example `http://192.168.1.20/piwigo`; a page of the gallery copied from
   the browser works too) and paste the **API key** in the password field,
   with the user name empty. With an account, fill in its user name and
   password instead.
3. Optionally, list the **Albums to follow**: names or ids separated by commas
   (`Holidays, 12`); a sub-album by its path (`Holidays / Beach`). The id is the
   number at the end of the album address (`index.php?/category/12`); use it
   for a name holding a comma.
4. Choose the **Refresh** (5 minutes by default) and the **Language of the
   names**, then save. **Test the connection** reads the gallery at once and
   tells the albums it did not find.
5. In **Discovery**, add the **Piwigo** device and the album devices you want.

## Devices

The **Piwigo** device shows the whole gallery (read-only):

| Feature          | What it shows                                                      |
| ---------------- | ------------------------------------------------------------------ |
| Photos           | Photos the account can see                                         |
| Albums           | Albums the account can see, sub-albums included                    |
| Users            | Users of the gallery (administrator account or key only)           |
| Last photo added | Its name, its album and the day: `Sunset · Holidays · 25 Oct 2026` |

Each followed album gives a device **Piwigo – album path**:

| Feature       | What it shows                                              |
| ------------- | ---------------------------------------------------------- |
| Photos        | Photos of the album and of its sub-albums                  |
| Last addition | Day and time of the last photo added: `25 Oct 2026, 07:50` |

The integration reads the gallery itself (three or four small requests per
reading): nothing to set on the Gladys side. The connection badge of the
devices turns red when the gallery stops answering.

## Dashboard

The **Last photos** widget shows the counters (photos, albums, users) and the
last photos added: name, album, day; a tap shows the time it was added and the
day it was taken. With the **Followed album** setting, it shows one of your
followed albums instead of the whole gallery.

Thumbnails are **off by default**: with the **Show thumbnails** setting, the
small thumbnail of each photo is shown, which means your photos appear on every
screen that displays this dashboard (a shared tablet, a public dashboard,
Gladys Plus). The browser never loads Piwigo directly: Gladys asks the
integration, which only serves the photos the widget lists.

## Scenes

### Triggers

- **New photos added**: photos were added to the gallery, whatever the way
  (web upload, the mobile app, synchronization), seen at the next reading.
  Variables: number of photos added, name, album, date added and page of the
  last one.
- **Photos added to an album**: an album, sub-albums included, holds more
  photos than at the previous reading (a new album counts from zero). Filter:
  the album name, exactly as in Piwigo, without its parent albums. Variables:
  album name, path and id, photos added, photos in the album, page of the
  album. A photo added to a sub-album also fires this trigger for its parent
  albums.

### Actions

- **Read the last photos**: reads the last photos added now, of the whole
  gallery or of one album (name, path or id; sub-albums included). Outputs for
  the next actions of the scene: photos added in 24 hours, photos in all, name,
  album, date added and page of the last one. Nothing changes in Piwigo.

### Scene ideas

- On **New photos added**, send the family a message: "{{count}} new photos,
  the last one: {{name}} in {{album}}".
- Every evening at 9 p.m., **Read the last photos** of the album "Family", and
  when **Photos added in 24 hours** is above 0, show a message on the living
  room tablet.
- On **Photos added to an album** "Holidays 2026", light the hallway in blue.

## Troubleshooting

- **"API key, user name or password refused"**: the key expired, was revoked
  or was not pasted whole (identifier, colon, secret); with an account, check
  the password.
- **"the gallery does not answer"**: check the address, the port and the folder
  from the Gladys machine.
- **"no Piwigo gallery at this address"**: the address leads to another page
  (a login page of a reverse proxy, another application): enter the address of
  the gallery itself.
- **"certificate refused"**: a self-signed certificate; use the `http://`
  address on your network.
- **New photos do not show**: Piwigo may keep the photos sent through the
  mobile app or the web API in a waiting room (the "lounge") until the upload
  is complete; they show at the next reading after that.
- **The number of users stays empty**: the account or the key is not an
  administrator one.
- `LOG_LEVEL=debug` in the logs of the integration shows each reading.

## Limits

- New photos are seen at the next reading (5 minutes by default), and only the
  photos the account can see.
- The integration only reads: it never changes, uploads or deletes anything
  in Piwigo.
- No photo leaves your network through the integration unless you turn on the
  thumbnails of the widget.
- The dates are the ones of the Piwigo server, as it shows them.
- Not affiliated with the Piwigo project.
