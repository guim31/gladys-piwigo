# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-25

### Added

- Piwigo gallery device: photos, albums, users (administrator account), and
  the name, album and day of the last photo added.
- One device per followed album (names, paths or ids in the configuration):
  photos, sub-albums included, and the date of the last addition.
- Scene triggers: new photos added, photos added to an album (filter: album
  name).
- Scene action "Read the last photos", of the gallery or of an album: photos
  added in 24 hours, photos in all, and the last one (name, album, date, page).
- "Last photos" dashboard widget: the counters and the last photos added, of
  the gallery or of a followed album; thumbnails only when the widget setting
  asks for them.
- Sign-in with a Piwigo 16 API key, or with the user name and password of an
  account, or none for the public albums.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-piwigo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-piwigo/releases/tag/v1.0.0
