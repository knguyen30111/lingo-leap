/**
 * The one visible version authority.
 *
 * The build substitutes `package.json`'s `version` here, and the release
 * contract asserts that every other version authority in the repository —
 * `tauri.conf.json`, `Cargo.toml`, and both lockfiles — agrees with it. The
 * settings footer reads this value, so no locale file carries a version
 * literal that a release can leave behind.
 */
export const APP_VERSION: string = __APP_VERSION__
