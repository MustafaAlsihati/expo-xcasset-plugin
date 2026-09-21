const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAssets } = require('../build');

test('flattens an array of { name: path } records, in order', () => {
  assert.deepEqual(
    normalizeAssets([
      { home: './assets/home.svg' },
      { profile: './assets/profile.svg' },
    ]),
    [
      { name: 'home', svgPath: './assets/home.svg' },
      { name: 'profile', svgPath: './assets/profile.svg' },
    ],
  );
});

test('accepts records holding several entries', () => {
  assert.deepEqual(
    normalizeAssets([{ a: 'a.svg', b: 'b.svg' }, { c: 'c.svg' }]).map(
      asset => asset.name,
    ),
    ['a', 'b', 'c'],
  );
});

test('accepts a single { name: path } object', () => {
  assert.deepEqual(normalizeAssets({ home: './home.svg' }), [
    { name: 'home', svgPath: './home.svg' },
  ]);
});

test('accepts an uppercase .SVG extension', () => {
  assert.equal(normalizeAssets([{ logo: 'logo.SVG' }]).length, 1);
});

test('an empty array means nothing to generate', () => {
  assert.deepEqual(normalizeAssets([]), []);
});

test('missing props are an error that shows the expected shape', () => {
  assert.throws(() => normalizeAssets(undefined), /No SVGs configured/);
  assert.throws(() => normalizeAssets(null), /No SVGs configured/);
});

test('rejects items that are not { name: path } objects', () => {
  assert.throws(() => normalizeAssets(['a.svg']), /item 0.*string/);
  assert.throws(() => normalizeAssets([[]]), /item 0.*an array/);
  assert.throws(() => normalizeAssets([{ ok: 'a.svg' }, 5]), /item 1.*number/);
});

test('rejects names that are unsafe as an .imageset folder or image name', () => {
  for (const name of ['bad name', '../up', 'a/b', '-leading', '_leading', '']) {
    assert.throws(
      () => normalizeAssets([{ [name]: 'a.svg' }]),
      /Invalid asset name/,
      `should reject "${name}"`,
    );
  }
});

test('rejects values that are not a non-empty string path', () => {
  assert.throws(() => normalizeAssets([{ a: 5 }]), /"a".*number/);
  assert.throws(() => normalizeAssets([{ a: '  ' }]), /"a".*empty string/);
  assert.throws(() => normalizeAssets([{ a: null }]), /"a"/);
});

test('rejects paths that are not .svg files', () => {
  assert.throws(() => normalizeAssets([{ a: 'a.png' }]), /"a".*not an \.svg/);
});

test('rejects duplicate names, also across records', () => {
  assert.throws(
    () => normalizeAssets([{ a: 'one.svg' }, { a: 'two.svg' }]),
    /Duplicate asset name "a"/,
  );
});
