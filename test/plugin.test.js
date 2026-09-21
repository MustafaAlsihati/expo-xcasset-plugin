const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { compileModsAsync, withPlugins } = require('expo/config-plugins');
const plugin = require('../build').default;

const HOME = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.02 2.84l-5.39 4.2C2.73 7.74 2 9.23 2 10.36v7.41c0 2.32 1.89 4.22 4.21 4.22h11.58c2.32 0 4.21-1.9 4.21-4.21V10.5c0-1.21-.81-2.76-1.8-3.45l-6.18-4.33c-1.4-.98-3.65-.93-5 .12zM12 17.99v-3"/></svg>`;
const WIDE = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="20"><rect width="48" height="20" rx="4" fill="#000"/></svg>`;

const roots = [];
test.after(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

/** A minimal stand-in for what `expo prebuild` generates for iOS. */
function makeProject({ catalog = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xcasset-plugin-'));
  roots.push(root);

  const source = path.join(root, 'ios', 'testapp');
  const catalogDir = path.join(source, 'Images.xcassets');
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'AppDelegate.swift'), '// test\n');
  if (catalog) {
    fs.mkdirSync(path.join(catalogDir, 'AppIcon.appiconset'), { recursive: true });
    fs.writeFileSync(path.join(catalogDir, 'Contents.json'), '{ "info": { "version": 1, "author": "expo" } }\n');
  }

  fs.mkdirSync(path.join(root, 'assets', 'icons'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets', 'icons', 'home.svg'), HOME);
  fs.writeFileSync(path.join(root, 'assets', 'wide.svg'), WIDE);
  return { root, catalogDir };
}

/** Runs the plugin the way prebuild does. A fresh config per run, as Expo requires. */
async function run(root, props, platforms = ['ios']) {
  const config = withPlugins(
    { name: 'testapp', slug: 'testapp', _internal: { projectRoot: root } },
    [[plugin, props]],
  );
  await compileModsAsync(config, { projectRoot: root, platforms, assertMissingModProviders: false });
}

const readContents = (catalogDir, name) =>
  JSON.parse(fs.readFileSync(path.join(catalogDir, `${name}.imageset`, 'Contents.json'), 'utf8'));
const readPdf = (catalogDir, name) =>
  fs.readFileSync(path.join(catalogDir, `${name}.imageset`, `${name}.pdf`));

test('writes a vector, template-rendered image set per SVG, paths relative to app.json', async () => {
  const { root, catalogDir } = makeProject();
  await run(root, [{ 'tab-home': './assets/icons/home.svg' }, { banner: 'assets/wide.svg' }]);

  assert.deepEqual(readContents(catalogDir, 'tab-home'), {
    images: [{ filename: 'tab-home.pdf', idiom: 'universal' }],
    info: { author: 'expo-xcasset-plugin', version: 1 },
    properties: {
      'preserves-vector-representation': true,
      'template-rendering-intent': 'template',
    },
  });

  const home = readPdf(catalogDir, 'tab-home');
  assert.equal(home.subarray(0, 5).toString(), '%PDF-');
  assert.match(home.toString('latin1'), /\/MediaBox \[0 0 24 24\]/);
  // The size follows each SVG rather than being fixed.
  assert.match(readPdf(catalogDir, 'banner').toString('latin1'), /\/MediaBox \[0 0 48 20\]/);
});

test('leaves the rest of the catalog alone', async () => {
  const { root, catalogDir } = makeProject();
  await run(root, [{ 'tab-home': './assets/icons/home.svg' }]);

  assert.deepEqual(fs.readdirSync(catalogDir).sort(), ['AppIcon.appiconset', 'Contents.json', 'tab-home.imageset']);
  assert.equal(
    fs.readFileSync(path.join(catalogDir, 'Contents.json'), 'utf8'),
    '{ "info": { "version": 1, "author": "expo" } }\n',
  );
});

test('is repeatable: a rerun replaces the image set and gives identical output', async () => {
  const { root, catalogDir } = makeProject();
  const props = [{ 'tab-home': './assets/icons/home.svg' }];
  await run(root, props);
  const first = readPdf(catalogDir, 'tab-home');

  fs.writeFileSync(path.join(catalogDir, 'tab-home.imageset', 'stale.txt'), 'left over');
  await run(root, props);

  assert.ok(readPdf(catalogDir, 'tab-home').equals(first));
  assert.equal(fs.existsSync(path.join(catalogDir, 'tab-home.imageset', 'stale.txt')), false);
});

test('accepts the { name: path } object form too', async () => {
  const { root, catalogDir } = makeProject();
  await run(root, { 'tab-home': './assets/icons/home.svg' });
  assert.equal(readPdf(catalogDir, 'tab-home').subarray(0, 5).toString(), '%PDF-');
});

test('an SVG that does not exist names the asset and the resolved path', async () => {
  const { root } = makeProject();
  await assert.rejects(run(root, [{ ghost: './assets/nope.svg' }]), error => {
    assert.match(error.message, /"ghost": cannot read/);
    assert.match(error.message, /nope\.svg/);
    assert.match(error.message, /relative to app\.json/);
    return true;
  });
});

test('an SVG with no usable size names the asset', async () => {
  const { root } = makeProject();
  fs.writeFileSync(path.join(root, 'assets', 'nosize.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  await assert.rejects(run(root, [{ nosize: './assets/nosize.svg' }]), /"nosize" \(\.\/assets\/nosize\.svg\): cannot tell the size/);
});

test('an SVG that would come out blank names the asset instead of shipping an invisible icon', async () => {
  const { root, catalogDir } = makeProject();
  fs.writeFileSync(path.join(root, 'assets', 'blank.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>');
  await assert.rejects(run(root, [{ blank: './assets/blank.svg' }]), /"blank" \(\.\/assets\/blank\.svg\): nothing was drawn/);
  assert.equal(fs.existsSync(path.join(catalogDir, 'blank.imageset')), false);
});

test('a currentColor icon (how icon libraries ship SVGs) ends up with drawn content', async () => {
  const { root, catalogDir } = makeProject();
  await run(root, [{ 'tab-home': './assets/icons/home.svg' }]);
  const zlib = require('node:zlib');
  const text = readPdf(catalogDir, 'tab-home').toString('latin1');
  const drawn = [...text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].some(([, body]) =>
    /^S$/m.test(zlib.inflateSync(Buffer.from(body, 'latin1')).toString('latin1')),
  );
  assert.ok(drawn, 'the generated PDF should stroke the icon path');
});

test('a missing asset catalog is a clear error', async () => {
  const { root } = makeProject({ catalog: false });
  await assert.rejects(run(root, [{ 'tab-home': './assets/icons/home.svg' }]), /Could not find the asset catalog/);
});

test('invalid props fail while the config is evaluated, before any prebuild work', () => {
  assert.throws(() => plugin({ name: 'a', slug: 'a' }, [{ 'bad name': 'a.svg' }]), /Invalid asset name/);
  assert.throws(() => plugin({ name: 'a', slug: 'a' }, undefined), /No SVGs configured/);
});

test('an empty list changes nothing', () => {
  const config = { name: 'a', slug: 'a' };
  assert.equal(plugin(config, []), config);
});

test('an Android-only prebuild does not touch the iOS catalog', async () => {
  const { root, catalogDir } = makeProject();
  await run(root, [{ 'tab-home': './assets/icons/home.svg' }], ['android']);
  assert.deepEqual(fs.readdirSync(catalogDir).sort(), ['AppIcon.appiconset', 'Contents.json']);
});

test('app.plugin.js exposes the plugin function that Expo loads', () => {
  const loaded = require('../app.plugin.js');
  assert.equal(typeof loaded, 'function');
  assert.equal(loaded, plugin);
});
