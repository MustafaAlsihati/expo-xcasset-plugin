import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import zlib from 'zlib';

export interface SvgSize {
  width: number;
  height: number;
}

export interface SvgToPdfResult {
  /** A single-page vector PDF, one point per SVG user unit. */
  pdf: Buffer;
  /** Things in the SVG that could not be converted faithfully. */
  warnings: string[];
}

// Matches the `<svg ...>` opening tag, even when an attribute value contains ">".
const SVG_TAG = /<svg\b(?:[^>"']|"[^"]*"|'[^']*')*>/i;
const LENGTH = /^\s*(\d*\.?\d+)\s*(?:px|pt)?\s*$/i;

function getAttribute(tag: string, name: string): string | undefined {
  // The leading whitespace keeps `width` from matching inside `stroke-width`.
  const match = tag.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'),
  );
  return match ? (match[1] ?? match[2]) : undefined;
}

function parseLength(value: string | undefined): number | undefined {
  const match = value?.match(LENGTH);
  const length = match ? Number(match[1]) : NaN;
  return length > 0 ? length : undefined;
}

/**
 * The size of the SVG in points: its `width` and `height` when both are plain
 * numbers (or `px`/`pt`), otherwise the size of its `viewBox`.
 */
export function getSvgSize(svg: string): SvgSize {
  const tag = svg.match(SVG_TAG)?.[0];
  if (!tag) {
    throw new Error('not an SVG: no <svg> element found');
  }

  const width = parseLength(getAttribute(tag, 'width'));
  const height = parseLength(getAttribute(tag, 'height'));
  if (width && height) {
    return { width, height };
  }

  const viewBox = getAttribute(tag, 'viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    viewBox?.length === 4 &&
    viewBox.every(Number.isFinite) &&
    viewBox[2]! > 0 &&
    viewBox[3]! > 0
  ) {
    return { width: viewBox[2]!, height: viewBox[3]! };
  }

  throw new Error(
    'cannot tell the size of the SVG: add width and height, or a viewBox, to the <svg> element',
  );
}

// Path/shading/image/text painting operators. Every PDF page starts with a clip
// only, so finding none of these means nothing was drawn.
const PAINT_OPERATOR = /^(?:S|s|f\*?|F|B\*?|b\*?|sh|Do|Tj|TJ)$/m;

function drawsSomething(pdf: Buffer): boolean {
  const text = pdf.toString('latin1');
  for (const [, body] of text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = zlib.inflateSync(Buffer.from(body!, 'latin1')).toString('latin1');
    } catch {
      content = body!; // not compressed
    }
    if (PAINT_OPERATOR.test(content)) {
      return true;
    }
  }
  return false;
}

/**
 * Converts an SVG into a single-page vector PDF (no rasterisation), which is
 * what an asset catalog keeps sharp at any scale.
 *
 * Throws when the result would be blank, rather than producing an invisible
 * icon.
 */
export async function svgToPdf(
  svg: string,
  title: string,
): Promise<SvgToPdfResult> {
  const { width, height } = getSvgSize(svg);
  const warnings: string[] = [];

  // Icon libraries draw with `currentColor`, which the converter cannot resolve
  // (nothing is painted). The asset is rendered as a template image, so only its
  // shape matters and any opaque color will do.
  const source = svg.replace(/currentColor/gi, '#000000');

  const doc = new PDFDocument({
    size: [width, height],
    margin: 0,
    info: {
      Title: title,
      Creator: 'expo-xcasset-plugin',
      Producer: 'expo-xcasset-plugin',
      // Fixed dates keep the output identical between runs. They have to be
      // passed here: pdfkit derives the file ID from them while constructing.
      CreationDate: new Date(0),
      ModDate: new Date(0),
    },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  try {
    SVGtoPDF(doc, source, 0, 0, {
      width,
      height,
      assumePt: true,
      preserveAspectRatio: 'xMidYMid meet',
      warningCallback: (message: string) => warnings.push(message),
    });
  } finally {
    doc.end();
  }

  const pdf = await done;
  if (!drawsSomething(pdf)) {
    throw new Error(
      `nothing was drawn: the SVG is empty, or only uses features that cannot be converted${
        warnings.length ? ` (${warnings.join('; ')})` : ''
      }`,
    );
  }
  return { pdf, warnings };
}
