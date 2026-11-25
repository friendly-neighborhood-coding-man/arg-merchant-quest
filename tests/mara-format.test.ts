import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMaraText, inlineTokens } from "../src/lib/mara-format";

test("Mara formatting: bold, italic and code become distinct tokens", () => {
  const tokens = inlineTokens("**Observed:** the tag is *blank*, not `voided`.");
  assert.deepEqual(tokens, [
    { text: "Observed:", style: "bold" },
    { text: " the tag is ", style: "plain" },
    { text: "blank", style: "italic" },
    { text: ", not ", style: "plain" },
    { text: "voided", style: "code" },
    { text: ".", style: "plain" },
  ]);
});

test("Mara formatting: lists and paragraphs are separate blocks", () => {
  const blocks = formatMaraText("**Observed:** two lines.\n\n- first clue\n- second clue\n\nClosing question?");
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].kind, "paragraph");
  assert.equal(blocks[1].kind, "list");
  if (blocks[1].kind === "list") {
    assert.equal(blocks[1].ordered, false);
    assert.equal(blocks[1].items.length, 2);
    assert.equal(blocks[1].items[0][0].text, "first clue");
  }
  assert.equal(blocks[2].kind, "paragraph");
});

test("Mara formatting: raw HTML stays inert text and is never markup", () => {
  const reply = '<img src=x onerror=alert(1)> **bold** <script>bad()</script>';
  const blocks = formatMaraText(reply);
  assert.equal(blocks.length, 1);
  const tokens = blocks[0].kind === "paragraph" ? blocks[0].lines[0] : [];
  assert.equal(
    tokens.map((token) => token.text).join(""),
    "<img src=x onerror=alert(1)> bold <script>bad()</script>",
  );
  assert.ok(tokens.every((token) => ["plain", "bold"].includes(token.style)));
});

test("Mara formatting: headings and numbered steps keep their order", () => {
  const blocks = formatMaraText("## Where it fits\n1. Check the strip\n2. Count the stamps");
  assert.equal(blocks[0].kind, "paragraph");
  if (blocks[0].kind === "paragraph") {
    assert.deepEqual(blocks[0].lines[0], [{ text: "Where it fits", style: "bold" }]);
  }
  assert.equal(blocks[1].kind, "list");
  if (blocks[1].kind === "list") assert.equal(blocks[1].ordered, true);
});

test("Mara formatting: an empty reply produces no blocks", () => {
  assert.deepEqual(formatMaraText("   \n  \n"), []);
});
