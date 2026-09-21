import { ConfigPlugin, IOSConfig, withDangerousMod } from 'expo/config-plugins';
import fs from 'fs';
import path from 'path';
import { normalizeAssets } from './normalize';
import { svgToPdf } from './svgToPdf';
import type { XcassetPluginProps } from './types';
import { writeImageset } from './xcasset';

const PREFIX = '[expo-xcasset-plugin]';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Turns SVG files into iOS asset catalog image sets during `expo prebuild`.
 *
 * Props: an array of `{ [assetName]: svgPath }` records, with each `svgPath`
 * relative to the directory that holds `app.json`.
 */
const withXcassets: ConfigPlugin<XcassetPluginProps> = (config, props) => {
  // Validate while the config is evaluated, so a typo fails immediately.
  const assets = normalizeAssets(props);
  if (assets.length === 0) {
    return config;
  }

  return withDangerousMod(config, [
    'ios',
    async config => {
      const { projectRoot } = config.modRequest;
      const catalogDir = path.join(
        IOSConfig.Paths.getSourceRoot(projectRoot),
        'Images.xcassets',
      );
      if (!fs.existsSync(catalogDir)) {
        throw new Error(
          `${PREFIX} Could not find the asset catalog at ${catalogDir}. It ships with the default Expo iOS template.`,
        );
      }

      for (const { name, svgPath } of assets) {
        const absolutePath = path.resolve(projectRoot, svgPath);

        let svg: string;
        try {
          svg = await fs.promises.readFile(absolutePath, 'utf8');
        } catch (error) {
          throw new Error(
            `${PREFIX} "${name}": cannot read ${absolutePath} (${messageOf(error)}). Paths are relative to app.json.`,
            { cause: error },
          );
        }

        let result;
        try {
          result = await svgToPdf(svg, name);
        } catch (error) {
          throw new Error(
            `${PREFIX} "${name}" (${svgPath}): ${messageOf(error)}`,
            { cause: error },
          );
        }

        for (const warning of result.warnings) {
          console.warn(`${PREFIX} "${name}": ${warning}`);
        }
        await writeImageset(catalogDir, name, result.pdf);
      }

      return config;
    },
  ]);
};

export default withXcassets;
export { normalizeAssets } from './normalize';
export { getSvgSize, svgToPdf } from './svgToPdf';
export type {
  XcassetPluginProps,
  XcassetSvg,
  XcassetSvgRecord,
} from './types';
