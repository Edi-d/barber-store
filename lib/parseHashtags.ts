const HASHTAG_REGEX = /(#[a-zA-Z0-9_\-\u00C0-\u024F]+)/g;

export type CaptionSegment =
  | { type: 'text'; value: string }
  | { type: 'hashtag'; value: string };

/**
 * Splits a caption string into alternating text and hashtag segments.
 * Hashtag segments include the leading "#" character.
 *
 * Example:
 *   "Tunsoare #Fade la salon #Barba" =>
 *   [
 *     { type: 'text',    value: 'Tunsoare ' },
 *     { type: 'hashtag', value: '#Fade' },
 *     { type: 'text',    value: ' la salon ' },
 *     { type: 'hashtag', value: '#Barba' },
 *   ]
 */
export function parseCaption(caption: string): CaptionSegment[] {
  if (!caption) return [];

  const segments: CaptionSegment[] = [];
  let lastIndex = 0;

  let match: RegExpExecArray | null;
  HASHTAG_REGEX.lastIndex = 0; // reset stateful regex

  while ((match = HASHTAG_REGEX.exec(caption)) !== null) {
    const [fullMatch] = match;
    const matchStart = match.index;

    // Text before the hashtag
    if (matchStart > lastIndex) {
      segments.push({ type: 'text', value: caption.slice(lastIndex, matchStart) });
    }

    segments.push({ type: 'hashtag', value: fullMatch });
    lastIndex = matchStart + fullMatch.length;
  }

  // Remaining text after the last hashtag
  if (lastIndex < caption.length) {
    segments.push({ type: 'text', value: caption.slice(lastIndex) });
  }

  return segments;
}
