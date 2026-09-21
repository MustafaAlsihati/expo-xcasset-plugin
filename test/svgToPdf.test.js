const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { getSvgSize, svgToPdf } = require('../build');

/** The drawing operators of every (compressed) content stream in a PDF. */
function contentOf(pdf) {
  const text = pdf.toString('latin1');
  return [...text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map(([, body]) => {
      try {
        return zlib.inflateSync(Buffer.from(body, 'latin1')).toString('latin1');
      } catch {
        return '';
      }
    })
    .join('\n');
}

// The kind of SVG icon libraries ship: viewBox only, `currentColor` strokes.
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M8 7H16C17.8856 7 18.8284 7 19.4142 7.58579C20 8.17157 20 9.11438 20 11V15C20 18.2998 20 19.9497 18.9749 20.9749C17.9497 22 16.2998 22 13 22H11C7.70017 22 6.05025 22 5.02513 20.9749C4 19.9497 4 18.2998 4 15V11C4 9.11438 4 8.17157 4.58579 7.58579C5.17157 7 6.11438 7 8 7Z"/>
  <path d="M16 9.5C16 5.63401 14.2091 2 12 2C9.79086 2 8 5.63401 8 9.5"/>
</svg>`;

test('size comes from the viewBox when there is no width/height', () => {
  assert.deepEqual(getSvgSize(ICON), { width: 24, height: 24 });
  assert.deepEqual(getSvgSize('<svg viewBox="0 0 48.5, 20"></svg>'), {
    width: 48.5,
    height: 20,
  });
});

test('width and height win over the viewBox, and px/pt units are accepted', () => {
  assert.deepEqual(
    getSvgSize('<svg width="30px" height="12pt" viewBox="0 0 24 24"></svg>'),
    { width: 30, height: 12 },
  );
});

test('stroke-width on the root element is not mistaken for width', () => {
  assert.deepEqual(
    getSvgSize('<svg stroke-width="2" viewBox="0 0 16 16"></svg>'),
    { width: 16, height: 16 },
  );
});

test('reads single-quoted and multi-line attributes', () => {
  assert.deepEqual(getSvgSize("<svg\n  width='20'\n  height='10'\n>\n</svg>"), {
    width: 20,
    height: 10,
  });
});

test('an SVG whose size cannot be determined is an error', () => {
  assert.throws(
    () => getSvgSize('<svg width="100%" height="100%"></svg>'),
    /cannot tell the size/,
  );
  assert.throws(
    () => getSvgSize('<svg></svg>'),
    /add width and height, or a viewBox/,
  );
});

test('something that is not an SVG is an error', () => {
  assert.throws(() => getSvgSize('<html></html>'), /no <svg> element/);
});

test('produces a single-page vector PDF sized like the SVG', async () => {
  const { pdf, warnings } = await svgToPdf(ICON, 'bag');
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const text = pdf.toString('latin1');
  assert.match(text, /\/MediaBox \[0 0 24 24\]/);
  assert.equal((text.match(/\/Type \/Page\b/g) ?? []).length, 1);
  assert.deepEqual(warnings, []);
});

test('uses the SVG size rather than a fixed one', async () => {
  const { pdf } = await svgToPdf(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="20"><rect width="48" height="20" fill="#000"/></svg>',
    'wide',
  );
  assert.match(pdf.toString('latin1'), /\/MediaBox \[0 0 48 20\]/);
});

test('a currentColor icon is drawn as vector paths, with the SVG stroke settings', async () => {
  // Regression: `stroke="currentColor"` used to produce a blank PDF.
  const icon = contentOf((await svgToPdf(ICON, 'icon')).pdf);

  assert.match(icon, /\bc\b/, 'curves are kept as curves');
  assert.match(icon, /\bS\b/, 'the paths are stroked');
  assert.match(icon, /\b1\.5 w\b/, 'stroke-width 1.5 carries over');
  assert.match(icon, /\b1 J\b/, 'round line caps carry over');
  assert.match(icon, /\b1 j\b/, 'round line joins carry over');
});

test('currentColor on a single element and on fills is drawn too', async () => {
  const stroked = await svgToPdf(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4L20 20" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    'stroked',
  );
  assert.match(contentOf(stroked.pdf), /\bS\b/);

  const filled = await svgToPdf(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16v16H4z"/></svg>',
    'filled',
  );
  assert.match(contentOf(filled.pdf), /\bf\b/);
});

test('currentColor icons convert without warnings', async () => {
  assert.deepEqual((await svgToPdf(ICON, 'icon')).warnings, []);
});

test('an SVG that draws nothing is an error, not a blank icon', async () => {
  await assert.rejects(
    svgToPdf('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>', 'blank'),
    /nothing was drawn/,
  );
  // Painted with `none`, so also invisible.
  await assert.rejects(
    svgToPdf(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M4 4L20 20"/></svg>',
      'invisible',
    ),
    /nothing was drawn/,
  );
});

test('the output is identical between runs', async () => {
  const a = await svgToPdf(ICON, 'bag');
  const b = await svgToPdf(ICON, 'bag');
  assert.ok(a.pdf.equals(b.pdf));
});
