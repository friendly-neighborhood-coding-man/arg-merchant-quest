/**
 * Minimal, safe formatting for Mara's replies.
 *
 * Models answer in light Markdown (`**Observed:**`, `- item`, `# heading`). The
 * panel used to print those characters literally. This parser turns the small
 * subset the companion actually produces into a token tree the React component
 * renders as elements, so no string ever reaches `dangerouslySetInnerHTML`:
 * angle brackets, tags and attributes in a reply stay inert text.
 */

export type InlineStyle = "plain" | "bold" | "italic" | "code";

export interface InlineToken {
  text: string;
  style: InlineStyle;
}

export type MaraBlock =
  | { kind: "paragraph"; lines: InlineToken[][] }
  | { kind: "list"; ordered: boolean; items: InlineToken[][] };

/** `**bold**`, `*italic*`, `` `code` `` — in that order, no nesting. */
const INLINE = /\*\*([^*]+)\*\*|(?<!\*)\*([^*\n]+)\*(?!\*)|`([^`\n]+)`/g;

export function inlineTokens(line: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  for (const match of line.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ text: line.slice(last, index), style: "plain" });
    if (match[1] !== undefined) tokens.push({ text: match[1], style: "bold" });
    else if (match[2] !== undefined) tokens.push({ text: match[2], style: "italic" });
    else tokens.push({ text: match[3] ?? "", style: "code" });
    last = index + match[0].length;
  }
  if (last < line.length) tokens.push({ text: line.slice(last), style: "plain" });
  return tokens.length ? tokens : [{ text: "", style: "plain" }];
}

export function formatMaraText(raw: string): MaraBlock[] {
  const blocks: MaraBlock[] = [];
  let paragraph: InlineToken[][] = [];
  let list: { kind: "list"; ordered: boolean; items: InlineToken[][] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", lines: paragraph });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      paragraph.push([{ text: heading[1], style: "bold" }]);
      flushParagraph();
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      if (!list) list = { kind: "list", ordered: false, items: [] };
      list.items.push(inlineTokens(bullet[1]));
      continue;
    }
    const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ordered) {
      flushParagraph();
      if (!list) list = { kind: "list", ordered: true, items: [] };
      list.items.push(inlineTokens(ordered[1]));
      continue;
    }
    flushList();
    paragraph.push(inlineTokens(line));
  }
  flushParagraph();
  flushList();
  return blocks;
}
