'use strict';

/** Tiled GID flip/rotate bit flags (unsigned 32-bit). */
const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;
const FLIP_D = 0x20000000;
const GID_MASK = 0x1fffffff;

function decodeGid(raw) {
  const g = raw >>> 0;
  return {
    id: g & GID_MASK,
    flipH: !!(g & FLIP_H),
    flipV: !!(g & FLIP_V),
    flipD: !!(g & FLIP_D),
    raw: g,
  };
}

/**
 * Encode a local tile id (or bare gid without flags) with optional flips.
 * @param {number} id - tile id / gid without flags
 * @param {{flipH?:boolean,flipV?:boolean,flipD?:boolean}} flags
 */
function encodeGid(id, flags = {}) {
  let g = (Number(id) >>> 0) & GID_MASK;
  if (flags.flipH) g |= FLIP_H;
  if (flags.flipV) g |= FLIP_V;
  if (flags.flipD) g |= FLIP_D;
  return g >>> 0;
}

/**
 * Apply --flip-h / --flip-v / --flip-d (and aliases) from CLI flags onto a gid.
 * If no flip flags are present, returns gid unchanged (still >>> 0).
 */
function applyFlipFlags(gid, flags = {}) {
  const has =
    flags['flip-h'] ||
    flags.flipH ||
    flags.fliph ||
    flags['flip-v'] ||
    flags.flipV ||
    flags.flipv ||
    flags['flip-d'] ||
    flags.flipD ||
    flags.flipd;
  if (!has) return gid >>> 0;
  const base = (gid >>> 0) & GID_MASK;
  return encodeGid(base, {
    flipH: !!(flags['flip-h'] || flags.flipH || flags.fliph),
    flipV: !!(flags['flip-v'] || flags.flipV || flags.flipv),
    flipD: !!(flags['flip-d'] || flags.flipD || flags.flipd),
  });
}

module.exports = {
  FLIP_H,
  FLIP_V,
  FLIP_D,
  GID_MASK,
  decodeGid,
  encodeGid,
  applyFlipFlags,
};
