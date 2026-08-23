/* eslint-disable max-len */

import {
  buildPollDescription,
  computeCollageLayout,
  countPollVoters,
  escapeHtml,
  formatRuntime,
  injectMeta,
  selectCollagePosterPaths,
  stripMarkdown,
  truncateText,
} from "./meta-helpers";

const template = `<!DOCTYPE html>
<html>
  <head>
    <title>Poll-A-Lot</title>
    <meta name="title" content="Poll-A-Lot">
    <meta property="og:title" content="Poll-A-Lot: Vote now!">
    <meta name="description" content="Poll creation and sharing made easy.">
    <meta property="og:description" content="Poll creation and sharing made easy.">
    <meta property="og:image" content="https://poll-a-lot.firebaseapp.com/assets/img/poll-a-lot-meta-share.webp">
    <meta property="og:image:width" content="300">
    <meta property="og:image:height" content="300">
    <meta property="og:url" content="https://poll-a-lot.firebaseapp.com">
  </head>
  <body></body>
</html>`;

describe("escapeHtml", () => {
  it("escapes all five HTML-significant characters", () => {
    expect(escapeHtml("&<>\"'")).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Friday Movie Night 🍿")).toBe(
        "Friday Movie Night 🍿"
    );
  });
});

describe("truncateText", () => {
  it("returns text unchanged when within budget", () => {
    expect(truncateText("short text", 200)).toBe("short text");
  });

  it("truncates with an ellipsis and trims trailing whitespace", () => {
    const result = truncateText("a".repeat(210), 200);
    expect(result.length).toBe(200);
    expect(result.endsWith("…")).toBe(true);
  });

  it("keeps a multi-byte emoji intact when it falls right at the truncation boundary", () => {
    // 🎬 is a surrogate pair (2 UTF-16 code units) placed as the very last
    // code point kept. A naive .slice() on code units (rather than code
    // points) would land inside the pair and corrupt it; the emoji must
    // survive whole in the truncated output.
    const text = `${"x".repeat(198)}🎬${"y".repeat(10)}`;
    const result = truncateText(text, 200);
    expect(result).toBe(`${"x".repeat(198)}🎬…`);
  });
});

describe("formatRuntime", () => {
  it("formats hours and minutes together", () => {
    expect(formatRuntime(133)).toBe("2h 13m");
  });

  it("omits minutes when the runtime is a whole number of hours", () => {
    expect(formatRuntime(120)).toBe("2h");
  });

  it("formats sub-hour runtimes as minutes only", () => {
    expect(formatRuntime(45)).toBe("45m");
  });
});

describe("stripMarkdown", () => {
  it("strips the '#' header marker, bold and link syntax, collapsing newlines to spaces", () => {
    const input = "# Heads up\n**Bring snacks!** Voting closes " +
      "[Friday](https://example.com).";
    expect(stripMarkdown(input)).toBe(
        "Heads up Bring snacks! Voting closes Friday."
    );
  });
});

describe("injectMeta", () => {
  it("splices title/description/url into the template", () => {
    const html = injectMeta(template, {
      title: "Friday Movie Night | Poll-A-Lot",
      description: "Vote on 3 options: A, B, C",
      url: "https://poll-a-lot.web.app/poll/abc123",
    });

    expect(html).toContain(
        "<title>Friday Movie Night | Poll-A-Lot</title>"
    );
    expect(html).toContain(
        "<meta name=\"title\" content=\"Friday Movie Night | Poll-A-Lot\">"
    );
    expect(html).toContain(
        "<meta property=\"og:title\" content=\"Friday Movie Night | Poll-A-Lot\">"
    );
    expect(html).toContain(
        "<meta property=\"og:description\" content=\"Vote on 3 options: A, B, C\">"
    );
    expect(html).toContain(
        "<meta property=\"og:url\" content=\"https://poll-a-lot.web.app/poll/abc123\">"
    );
  });

  it("HTML-escapes attacker-controlled values", () => {
    const html = injectMeta(template, {
      title: "\"><script>alert(1)</script>",
      description: "plain",
      url: "https://poll-a-lot.web.app/poll/abc123",
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("does not interpret \"$\"-sequences from user input as replacement patterns", () => {
    // String.prototype.replace treats $1/$&/$' specially in a replacement
    // *string* — a poll named "$2" or "$'" must not be able to corrupt the
    // surrounding tag or splice in unrelated template content.
    const html = injectMeta(template, {
      title: "$2$&$` Evil Poll",
      description: "Pay me $1 or $' will leak $&",
      url: "https://poll-a-lot.web.app/poll/abc123",
    });

    expect(html).toContain(
        "<title>$2$&amp;$` Evil Poll</title>"
    );
    expect(html).toContain(
        "<meta property=\"og:description\" content=\"Pay me $1 or $&#39; " +
        "will leak $&amp;\">"
    );
    // No duplicated/leaked template content, and both closing quotes
    // survived intact (a corrupted $2 substitution would eat the closing
    // quote of the attribute).
    expect((html.match(/<title>/g) || []).length).toBe(1);
    expect(html).toContain("content=\"https://poll-a-lot.web.app/poll/abc123\">");
  });

  it("updates the image tag and its dimensions only when an image is given", () => {
    const withImage = injectMeta(template, {
      title: "t",
      description: "d",
      url: "https://poll-a-lot.web.app/poll/abc123",
      image: "https://example.com/collage.jpg",
      imageWidth: 800,
      imageHeight: 800,
    });
    expect(withImage).toContain(
        "<meta property=\"og:image\" content=\"https://example.com/collage.jpg\">"
    );
    expect(withImage).toContain("<meta property=\"og:image:width\" content=\"800\">");
    expect(withImage).toContain("<meta property=\"og:image:height\" content=\"800\">");

    const withoutImage = injectMeta(template, {
      title: "t",
      description: "d",
      url: "https://poll-a-lot.web.app/poll/abc123",
    });
    expect(withoutImage).toContain(
        "<meta property=\"og:image\" content=\"https://poll-a-lot.firebaseapp.com/assets/img/poll-a-lot-meta-share.webp\">"
    );
  });

  it("preserves emojis in the title and description", () => {
    const html = injectMeta(template, {
      title: "🎬 Friday Movie Night | Poll-A-Lot",
      description: "Vote for your favorite! 🍿🎉",
      url: "https://poll-a-lot.web.app/poll/abc123",
    });

    expect(html).toContain(
        "<title>🎬 Friday Movie Night | Poll-A-Lot</title>"
    );
    expect(html).toContain(
        "<meta property=\"og:title\" content=\"🎬 Friday Movie Night | Poll-A-Lot\">"
    );
    expect(html).toContain(
        "<meta property=\"og:description\" content=\"Vote for your favorite! 🍿🎉\">"
    );
  });
});

describe("countPollVoters", () => {
  it("dedupes a voter appearing on multiple items, keyed by id", () => {
    const items = [
      {voters: [{id: "u1"}, {id: "u2"}]},
      {voters: [{id: "u1"}]},
    ];
    expect(countPollVoters(items, false)).toBe(2);
  });

  it("dedupes anonymous voters by name+localUserId when no id is set", () => {
    const items = [
      {voters: [{name: "Alex", localUserId: "abc"}]},
      {voters: [{name: "Alex", localUserId: "abc"}]},
      {voters: [{name: "Alex", localUserId: "xyz"}]},
    ];
    expect(countPollVoters(items, false)).toBe(2);
  });

  it("in point-voting mode, only counts voters with points > 0", () => {
    const items = [
      {voters: [{id: "u1", points: 2}, {id: "u2", points: 0}]},
    ];
    expect(countPollVoters(items, true)).toBe(1);
  });
});

describe("buildPollDescription", () => {
  const items = [
    {name: "Dune: Part Two", voters: [{id: "u1"}, {id: "u2"}]},
    {name: "Oppenheimer", voters: [{id: "u1"}]},
    {name: "Poor Things", voters: []},
    {name: "The Zone of Interest", voters: [{id: "u3"}]},
    {name: "Item 5", voters: []},
    {name: "Item 6", voters: []},
    {name: "Item 7", voters: []},
    {name: "Item 8", voters: []},
  ];

  it("prefers the poll's own description, markdown-stripped, with an option count appended", () => {
    const result = buildPollDescription({
      description: "**Bring snacks!** Voting closes [Friday](https://x.com).",
    }, items);
    expect(result).toBe(
        "Bring snacks! Voting closes Friday. · 8 options · 3 votes so far"
    );
  });

  it("omits the option-count suffix for a custom description when the poll has no items", () => {
    const result = buildPollDescription({description: "Bring snacks!"}, []);
    expect(result).toBe("Bring snacks!");
  });

  it("preserves emojis in a custom poll description", () => {
    const result = buildPollDescription(
        {description: "🎬 Bring popcorn! 🍿"},
        [{name: "A", voters: []}]
    );
    expect(result).toBe("🎬 Bring popcorn! 🍿 · 1 option");
  });

  it("falls back to an item-list summary, truncated at 3 + remainder count, when no description is set", () => {
    const result = buildPollDescription({description: undefined}, items);
    expect(result).toBe(
        "Vote on 8 options: Dune: Part Two, Oppenheimer, Poor Things & " +
        "5 more · 3 votes so far"
    );
  });

  it("lists every item with no \"& more\" suffix when there are 4 or fewer", () => {
    const result = buildPollDescription(
        {description: undefined}, items.slice(0, 3)
    );
    expect(result).toBe(
        "Vote on 3 options: Dune: Part Two, Oppenheimer, Poor Things · " +
        "2 votes so far"
    );
  });

  it("uses singular option/vote wording for exactly one of each", () => {
    const result = buildPollDescription(
        {description: undefined},
        [{name: "A", voters: [{id: "u1"}]}]
    );
    expect(result).toBe("Vote on 1 option: A · 1 vote so far");
  });

  it("omits the vote-count suffix entirely when nobody has voted yet", () => {
    const result = buildPollDescription(
        {description: undefined},
        [{name: "A", voters: []}]
    );
    expect(result).toBe("Vote on 1 option: A");
  });

  it("respects pointVoting when counting votes", () => {
    const result = buildPollDescription(
        {description: undefined, pointVoting: {pointVoting: true}},
        [{name: "A", voters: [{id: "u1", points: 2}, {id: "u2", points: 0}]}]
    );
    expect(result).toBe("Vote on 1 option: A · 1 vote so far");
  });

  it("falls back to a generic invitation when the poll has no items", () => {
    const result = buildPollDescription({description: undefined}, []);
    expect(result).toBe("Vote now on Poll-A-Lot!");
  });
});

describe("computeCollageLayout", () => {
  const size = 800;

  it("fills the whole canvas for a single poster", () => {
    expect(computeCollageLayout(1, size)).toEqual([
      {width: 800, height: 800, left: 0, top: 0},
    ]);
  });

  it("splits into two equal-height columns for two posters", () => {
    const layout = computeCollageLayout(2, size);
    expect(layout.length).toBe(2);
    expect(layout.every((slot) => slot.height === size)).toBe(true);
    expect(layout[0].left).toBe(0);
    expect(layout[1].left).toBe(400);
  });

  it("splits into three equal-width columns for three posters", () => {
    const layout = computeCollageLayout(3, size);
    expect(layout.length).toBe(3);
    expect(layout.every((slot) => slot.height === size)).toBe(true);
    const totalWidth = layout.reduce((sum, slot) => sum + slot.width, 0);
    expect(totalWidth).toBeCloseTo(size, 5);
  });

  it("arranges four posters in a 2x2 grid", () => {
    const layout = computeCollageLayout(4, size);
    expect(layout).toEqual([
      {width: 400, height: 400, left: 0, top: 0},
      {width: 400, height: 400, left: 400, top: 0},
      {width: 400, height: 400, left: 0, top: 400},
      {width: 400, height: 400, left: 400, top: 400},
    ]);
  });

  it("caps at four slots even if a caller passes a larger count", () => {
    expect(computeCollageLayout(7, size).length).toBe(4);
  });
});

describe("selectCollagePosterPaths", () => {
  /**
   * Builds a fake poll item with a poster, for these tests.
   * @param {any} overrides Properties to override on the base item.
   * @return {any} A poll item with a poster.
   */
  function pollItem(overrides: any = {}): any {
    return {
      moviePollItemData: {posterPath: "/poster.jpg"},
      ...overrides,
    };
  }

  it("prefers visible, not-seen items over seen ones, keeping input order within each group", () => {
    const items = [
      pollItem({moviePollItemData: {posterPath: "/seen.jpg"}, reactions: [{label: "visibility", users: [{name: "A"}]}]}),
      pollItem({moviePollItemData: {posterPath: "/not-seen-1.jpg"}}),
      pollItem({moviePollItemData: {posterPath: "/not-seen-2.jpg"}}),
    ];
    expect(selectCollagePosterPaths(items, 4)).toEqual([
      "/not-seen-1.jpg", "/not-seen-2.jpg", "/seen.jpg",
    ]);
  });

  it("excludes hidden (visible: false) items in favor of visible ones", () => {
    const items = [
      pollItem({moviePollItemData: {posterPath: "/hidden.jpg"}, visible: false}),
      pollItem({moviePollItemData: {posterPath: "/visible.jpg"}}),
    ];
    expect(selectCollagePosterPaths(items, 4)).toEqual(["/visible.jpg", "/hidden.jpg"]);
  });

  it("does not treat an empty-users SEEN reaction as seen", () => {
    const items = [
      pollItem({moviePollItemData: {posterPath: "/a.jpg"}, reactions: [{label: "visibility", users: []}]}),
    ];
    expect(selectCollagePosterPaths(items, 4)).toEqual(["/a.jpg"]);
  });

  it("still fills the collage from seen/hidden items when there aren't enough others", () => {
    const items = [
      pollItem({moviePollItemData: {posterPath: "/seen.jpg"}, reactions: [{label: "visibility", users: [{name: "A"}]}]}),
    ];
    expect(selectCollagePosterPaths(items, 4)).toEqual(["/seen.jpg"]);
  });

  it("skips items without a poster and caps at the requested limit", () => {
    const items = [
      pollItem({moviePollItemData: {}}),
      pollItem({moviePollItemData: {posterPath: "/1.jpg"}}),
      pollItem({moviePollItemData: {posterPath: "/2.jpg"}}),
      pollItem({moviePollItemData: {posterPath: "/3.jpg"}}),
      pollItem({moviePollItemData: {posterPath: "/4.jpg"}}),
      pollItem({moviePollItemData: {posterPath: "/5.jpg"}}),
    ];
    expect(selectCollagePosterPaths(items, 4)).toEqual([
      "/1.jpg", "/2.jpg", "/3.jpg", "/4.jpg",
    ]);
  });
});
