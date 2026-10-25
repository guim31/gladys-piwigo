// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// `get_latest_photos` reads the last photos added now, of the whole gallery
// or of one album, and answers outputs the next actions of the scene use: a
// message "3 new photos today, the last one: {{name}}", a condition on the
// count of the last 24 hours... Read only: nothing changes in Piwigo.
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  async get_latest_photos(hub, { fields = {} }) {
    const album = typeof fields.album === 'string' ? fields.album.trim().slice(0, 200) : '';
    return hub.latestPhotos(album || null);
  },
};
