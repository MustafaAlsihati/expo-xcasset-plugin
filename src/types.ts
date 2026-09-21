/**
 * `{ [assetName]: svgPath }`, where `svgPath` is relative to the directory that
 * holds `app.json`.
 */
export type XcassetSvgRecord = Record<string, string>;

/**
 * Plugin props: an array of `{ [assetName]: svgPath }` records, or a single
 * `{ [assetName]: svgPath }` object.
 */
export type XcassetPluginProps = XcassetSvgRecord[] | XcassetSvgRecord;

/** A single asset to generate, after the props have been validated. */
export interface XcassetSvg {
  /** Name of the asset in the catalog, i.e. what `UIImage(named:)` looks up. */
  name: string;
  /** SVG path exactly as written in the config (relative to `app.json`). */
  svgPath: string;
}
