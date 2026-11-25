import type { InlineToken } from "@/lib/mara-format";
import { formatMaraText } from "@/lib/mara-format";

/**
 * Renders Mara's light Markdown as React elements. Nothing is injected as HTML:
 * the token tree only ever becomes text nodes, so a reply containing `<script>`
 * or an event handler attribute is displayed, not executed.
 */
function renderInline(tokens: InlineToken[]) {
  return tokens.map((token, index) => {
    if (token.style === "bold") {
      return (
        <strong key={index} className="font-semibold text-white/90">
          {token.text}
        </strong>
      );
    }
    if (token.style === "italic") {
      return <em key={index}>{token.text}</em>;
    }
    if (token.style === "code") {
      return (
        <code key={index} className="rounded bg-ink/80 px-1 py-0.5 font-mono text-[11.5px] text-amber-soft">
          {token.text}
        </code>
      );
    }
    return <span key={index}>{token.text}</span>;
  });
}

export function MaraText({ text }: { text: string }) {
  return (
    <>
      {formatMaraText(text).map((block, blockIndex) =>
        block.kind === "list" ? (
          <ul
            key={blockIndex}
            className={`mt-1 space-y-0.5 pl-4 ${block.ordered ? "list-decimal" : "list-disc"}`}
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={blockIndex} className={blockIndex > 0 ? "mt-1.5" : undefined}>
            {block.lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {renderInline(line)}
              </span>
            ))}
          </p>
        ),
      )}
    </>
  );
}
