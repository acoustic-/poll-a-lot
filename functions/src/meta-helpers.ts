/* eslint-disable require-jsdoc */

export function escapeHtml(value: string): string {
  return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
}

export function truncateText(text: string, maxLength: number): string {
  const trimmed = text.trim();
  // Splitting via Array.from (code-point aware) rather than slicing the raw
  // string (UTF-16 code units) avoids cutting a multi-byte emoji's surrogate
  // pair in half at the truncation boundary, which would corrupt it.
  const chars = Array.from(trimmed);
  if (chars.length <= maxLength) {
    return trimmed;
  }
  return `${chars.slice(0, maxLength - 1).join("").trimEnd()}…`;
}

export function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) {
    return `${remainingMinutes}m`;
  }
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainingMinutes}m`;
}

// Poll descriptions are stored as raw markdown source (rendered client-side
// via MarkdownPipe), so a meta tag needs the syntax stripped rather than
// shown verbatim as literal asterisks/brackets.
export function stripMarkdown(text: string): string {
  return text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/^#+\s*/gm, "")
      .replace(/\r?\n+/g, " ")
      .trim();
}

// String.prototype.replace treats "$"-sequences (e.g. "$1", "$&", "$'")
// specially in a replacement *string* — and the values here come from
// attacker-writable Firestore fields (poll name/description) or
// third-party TMDB data. Using a replacement *function* instead sidesteps
// that: its return value is spliced in literally, with no special-casing.
export function replaceTagValue(
    html: string, pattern: RegExp, value: string | number
): string {
  return html.replace(
      pattern,
      (_match, openingQuote, closingQuote) =>
        `${openingQuote}${value}${closingQuote}`
  );
}

export function injectMeta(template: string, meta: {
  title: string;
  description: string;
  url: string;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
}): string {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const url = escapeHtml(meta.url);

  let html = template.replace(
      /<title>.*?<\/title>/, () => `<title>${title}</title>`
  );
  html = replaceTagValue(
      html, /(<meta name="title" content=")[^"]*(")/, title
  );
  html = replaceTagValue(
      html, /(<meta property="og:title" content=")[^"]*(")/, title
  );
  html = replaceTagValue(
      html, /(<meta name="description" content=")[^"]*(")/, description
  );
  html = replaceTagValue(
      html,
      /(<meta property="og:description" content=")[^"]*(")/,
      description
  );
  html = replaceTagValue(
      html, /(<meta property="og:url" content=")[^"]*(")/, url
  );

  if (meta.image) {
    const image = escapeHtml(meta.image);
    html = replaceTagValue(
        html, /(<meta property="og:image" content=")[^"]*(")/, image
    );
    if (meta.imageWidth) {
      html = replaceTagValue(
          html,
          /(<meta property="og:image:width" content=")[^"]*(")/,
          meta.imageWidth
      );
    }
    if (meta.imageHeight) {
      html = replaceTagValue(
          html,
          /(<meta property="og:image:height" content=")[^"]*(")/,
          meta.imageHeight
      );
    }
  }

  return html;
}

export function votedUserKey(
    voter: {id?: string; name?: string; localUserId?: string}
): string {
  return voter.id ?
    `id:${voter.id}` :
    `n:${voter.name ?? ""}:${voter.localUserId ?? ""}`;
}

// Poll voting has two shapes: point voting (a voter "counts" once they've
// put at least one point somewhere) and regular voting (appearing in an
// item's voters[] at all counts). Dedupes across items since one voter can
// appear on multiple poll items.
export function countPollVoters(items: any[], pointVoting: boolean): number {
  const voterKeys = new Set<string>();
  for (const item of items) {
    for (const voter of item.voters ?? []) {
      const hasVoted = pointVoting ? (voter.points ?? 0) > 0 : true;
      if (hasVoted) {
        voterKeys.add(votedUserKey(voter));
      }
    }
  }
  return voterKeys.size;
}

export function buildPollDescription(poll: any, items: any[]): string {
  const voteCount = countPollVoters(
      items, poll.pointVoting?.pointVoting === true
  );
  const descriptionBudget = 200;

  // The item-list fallback already states the option count inline ("Vote on
  // N options: ..."); a custom poll description doesn't, so it gets an
  // " · N options" suffix of its own further down.
  let base: string;
  let needsOptionCountSuffix = false;
  if (
    typeof poll.description === "string" &&
    poll.description.trim().length > 0
  ) {
    base = stripMarkdown(poll.description);
    needsOptionCountSuffix = true;
  } else {
    const names: string[] = items
        .map((item: any) => item.name)
        .filter((name: string | undefined) => !!name);
    if (names.length === 0) {
      base = "Vote now on Poll-A-Lot!";
    } else if (names.length <= 4) {
      base = `Vote on ${names.length} option${
        names.length === 1 ? "" : "s"
      }: ${names.join(", ")}`;
    } else {
      base = `Vote on ${names.length} options: ${
        names.slice(0, 3).join(", ")
      } & ${names.length - 3} more`;
    }
  }

  let description = truncateText(base, descriptionBudget);
  if (needsOptionCountSuffix && items.length > 0) {
    const suffix = ` · ${items.length} option${items.length === 1 ? "" : "s"}`;
    if (description.length + suffix.length <= descriptionBudget) {
      description += suffix;
    }
  }
  if (voteCount > 0) {
    const suffix = ` · ${voteCount} vote${voteCount === 1 ? "" : "s"} so far`;
    if (description.length + suffix.length <= descriptionBudget) {
      description += suffix;
    }
  }
  return description;
}

// Mirrors src/app/movie-poll-item/movie-helpers.ts' SEEN constant — this is
// a separate compilation unit (functions/tsconfig.json only includes
// functions/src) so it can't import that file directly.
const SEEN_REACTION_LABEL = "visibility";

function hasSeenReaction(item: any): boolean {
  return !!item.reactions?.some(
      (r: any) => r.label === SEEN_REACTION_LABEL && (r.users?.length ?? 0) > 0
  );
}

// The public share-image collage shouldn't spoil which movies a poll's
// voters have already marked watched, or surface items the poll owner
// explicitly hid (visible: false) — but a poll where every remaining item
// happens to be seen should still get a collage rather than falling back to
// the generic placeholder, so seen/hidden items are a lower-priority source
// of posters rather than an outright exclusion.
export function selectCollagePosterPaths(
    items: any[], limit: number
): string[] {
  const withPoster = items.filter(
      (item: any) => !!item.moviePollItemData?.posterPath
  );
  const preferred = withPoster.filter(
      (item: any) => item.visible !== false && !hasSeenReaction(item)
  );
  const rest = withPoster.filter((item: any) => !preferred.includes(item));
  return [...preferred, ...rest]
      .map((item: any) => item.moviePollItemData.posterPath as string)
      .slice(0, limit);
}

export function computeCollageLayout(count: number, size: number): {
  width: number; height: number; left: number; top: number;
}[] {
  if (count === 1) {
    return [{width: size, height: size, left: 0, top: 0}];
  }
  if (count === 2) {
    const w = size / 2;
    return [
      {width: w, height: size, left: 0, top: 0},
      {width: w, height: size, left: w, top: 0},
    ];
  }
  if (count === 3) {
    const w = size / 3;
    return [0, 1, 2].map((i) => (
      {width: w, height: size, left: i * w, top: 0}
    ));
  }
  const half = size / 2;
  return [
    {width: half, height: half, left: 0, top: 0},
    {width: half, height: half, left: half, top: 0},
    {width: half, height: half, left: 0, top: half},
    {width: half, height: half, left: half, top: half},
  ];
}
