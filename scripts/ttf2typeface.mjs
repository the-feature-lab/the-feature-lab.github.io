// Convert a TTF/OTF to a three.js "typeface JSON" font using opentype.js.
// Port of the gero3 facetype.js logic (glyph path commands -> typeface glyph
// outline strings). Usage: node scripts/ttf2typeface.mjs <in.ttf> <out.json> [reverse]
import opentype from 'opentype.js';
import { readFileSync, writeFileSync } from 'fs';

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) {
  console.error('usage: node ttf2typeface.mjs <in.ttf> <out.json>');
  process.exit(1);
}

const font = opentype.parse(readFileSync(inFile).buffer);
const scale = (1000 * 100) / ((font.unitsPerEm || 2048) * 72);
const result = { glyphs: {} };

// Restrict to a useful ASCII range (printable) to keep the JSON small.
function roundNum(v) { return Math.round(v); }

for (let i = 32; i < 127; i++) {
  const ch = String.fromCharCode(i);
  const glyph = font.charToGlyph(ch);
  if (!glyph) continue;
  const token = { ha: roundNum(glyph.advanceWidth * scale), x_min: 0, x_max: 0, o: '' };
  // Path in font units (getPath at em size gives coords in units per em).
  const path = glyph.getPath(0, 0, font.unitsPerEm || 2048);
  const bbox = glyph.getBoundingBox();
  token.x_min = roundNum(bbox.x1 * scale);
  token.x_max = roundNum(bbox.x2 * scale);

  const o = [];
  for (const cmd of path.commands) {
    if (cmd.type === 'M') {
      o.push('m', roundNum(cmd.x * scale), roundNum(-cmd.y * scale));
    } else if (cmd.type === 'L') {
      o.push('l', roundNum(cmd.x * scale), roundNum(-cmd.y * scale));
    } else if (cmd.type === 'Q') {
      o.push('q', roundNum(cmd.x * scale), roundNum(-cmd.y * scale),
             roundNum(cmd.x1 * scale), roundNum(-cmd.y1 * scale));
    } else if (cmd.type === 'C') {
      o.push('b', roundNum(cmd.x * scale), roundNum(-cmd.y * scale),
             roundNum(cmd.x1 * scale), roundNum(-cmd.y1 * scale),
             roundNum(cmd.x2 * scale), roundNum(-cmd.y2 * scale));
    }
  }
  token.o = o.join(' ');
  result.glyphs[ch] = token;
}

result.familyName = font.names.fontFamily?.en || 'Font';
result.ascender = roundNum((font.ascender ?? font.unitsPerEm) * scale);
result.descender = roundNum((font.descender ?? 0) * scale);
result.underlinePosition = -100;
result.underlineThickness = 50;
result.boundingBox = { yMin: -200, xMin: -100, yMax: 900, xMax: 1000 };
result.resolution = 1000;
result.original_font_information = {};

writeFileSync(outFile, JSON.stringify(result));
console.log(`${inFile} -> ${outFile}  (${Object.keys(result.glyphs).length} glyphs, ${(JSON.stringify(result).length / 1024).toFixed(0)}KB)`);
