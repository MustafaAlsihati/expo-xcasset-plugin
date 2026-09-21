import fs from 'fs';
import path from 'path';

/**
 * `Contents.json` for a single-vector image set. The PDF keeps its vector data
 * and is rendered as a template image, so UIKit tints it (tab bar items,
 * `tintColor`) instead of drawing it in its own colors.
 */
export function contentsJson(filename: string) {
  return {
    images: [{ filename, idiom: 'universal' }],
    info: { author: 'expo-xcasset-plugin', version: 1 },
    properties: {
      'preserves-vector-representation': true,
      'template-rendering-intent': 'template',
    },
  };
}

/**
 * Writes `<catalogDir>/<name>.imageset/{<name>.pdf, Contents.json}`, replacing
 * an existing image set of the same name.
 */
export async function writeImageset(
  catalogDir: string,
  name: string,
  pdf: Buffer,
): Promise<void> {
  const imageset = path.join(catalogDir, `${name}.imageset`);
  const filename = `${name}.pdf`;

  await fs.promises.rm(imageset, { recursive: true, force: true });
  await fs.promises.mkdir(imageset, { recursive: true });
  await fs.promises.writeFile(path.join(imageset, filename), pdf);
  await fs.promises.writeFile(
    path.join(imageset, 'Contents.json'),
    JSON.stringify(contentsJson(filename), null, 2) + '\n',
  );
}
