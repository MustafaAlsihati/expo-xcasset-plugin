import type { XcassetSvg } from './types';

const PREFIX = '[expo-xcasset-plugin]';

// Asset names end up as `<name>.imageset` folders and as `UIImage(named:)`
// lookups, so keep them to characters that are safe in both.
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates the plugin props and flattens them into a list of assets.
 *
 * Accepts an array of `{ [name]: svgPath }` records (a record may hold several
 * entries), or one `{ [name]: svgPath }` object.
 */
export function normalizeAssets(props: unknown): XcassetSvg[] {
  if (props === undefined || props === null) {
    throw new Error(
      `${PREFIX} No SVGs configured. Pass an array like [{ "icon-name": "./assets/icon.svg" }] as the plugin props.`,
    );
  }

  const records = Array.isArray(props) ? props : [props];
  const assets: XcassetSvg[] = [];
  const seen = new Set<string>();

  records.forEach((record, index) => {
    if (!isPlainObject(record)) {
      throw new Error(
        `${PREFIX} Expected item ${index} to be an object like { "icon-name": "./assets/icon.svg" }, got ${
          Array.isArray(record) ? 'an array' : typeof record
        }.`,
      );
    }

    for (const [name, svgPath] of Object.entries(record)) {
      if (!NAME_PATTERN.test(name)) {
        throw new Error(
          `${PREFIX} Invalid asset name "${name}". Use letters, numbers, "-" and "_", starting with a letter or number.`,
        );
      }
      if (typeof svgPath !== 'string' || svgPath.trim() === '') {
        throw new Error(
          `${PREFIX} "${name}": expected the SVG path as a non-empty string, got ${
            typeof svgPath === 'string' ? 'an empty string' : typeof svgPath
          }.`,
        );
      }
      if (!svgPath.toLowerCase().endsWith('.svg')) {
        throw new Error(
          `${PREFIX} "${name}": "${svgPath}" is not an .svg file.`,
        );
      }
      if (seen.has(name)) {
        throw new Error(`${PREFIX} Duplicate asset name "${name}".`);
      }
      seen.add(name);
      assets.push({ name, svgPath });
    }
  });

  return assets;
}
