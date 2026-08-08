/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
/* eslint-disable no-inner-declarations */

import {HttpsError, HttpsOptions, onCall, onRequest} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions/v2";
import {Agent} from "https";
import * as admin from "firebase-admin";
import {getFirestore} from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import {
  buildPollDescription,
  computeCollageLayout,
  formatRuntime,
  injectMeta,
  truncateText,
} from "./meta-helpers";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetch = require("node-fetch");

setGlobalOptions({region: "europe-west1"});
admin.initializeApp();

const agent = new Agent({keepAlive: true});
const baseUrl = "https://api.letterboxd.com/api/v0/";
const staticShareImage = "https://poll-a-lot.firebaseapp.com/assets/img/poll-a-lot-meta-share.webp";

// The plain (non-prerendered) SPA shell, copied in at build time from
// dist/browser/index.csr.html (see functions/package.json's build script).
// pollMeta/movieMeta serve a copy of this with a few meta tags swapped in,
// so social-media crawlers unfurl the right title/description/image for
// dynamic /poll/:id and /movie/:id links instead of the static defaults.
const htmlTemplate = fs.readFileSync(
    path.join(__dirname, "index.template.html"), "utf-8"
);

// Poll-A-Lot watermark stamped dead-center of the collage image in
// pollPreviewImage — a dark circular backing behind the white logo mark, so
// it stays legible regardless of the underlying poster colors. Centered
// (rather than in a corner) because social platforms commonly crop this
// square image to a wider landscape ratio for link previews, which cuts off
// the top and bottom bands; center is the one spot that survives any such
// crop. The logo is sized to at least 1/4 of the collage's width (800px),
// with the backing sized just enough around it for legibility. Rasterized
// once per cold start and reused across warm invocations, since the
// size/position never varies between requests.
const watermarkSize = 200;
const watermarkBackingSize = 240;

const watermarkBackingBuffer = sharp(
    Buffer.from(
        `<svg width="${watermarkBackingSize}" height="${watermarkBackingSize}">` +
        `<circle cx="${watermarkBackingSize / 2}" cy="${watermarkBackingSize / 2}" ` +
        `r="${watermarkBackingSize / 2}" fill="black" fill-opacity="0.45"/></svg>`
    )
).png().toBuffer();

const watermarkLogoBuffer = sharp(
    path.join(__dirname, "watermark.svg")
).resize(watermarkSize, watermarkSize).png().toBuffer();

interface IHttpsOptions extends HttpsOptions {
  enforceAppCheck: boolean;
}

interface LetterboxdFilmRequestData {
  tmdbId: number;
}

interface LetterboxdLogEntriesRequestData {
  memberId: string;
  query?: string;
}

interface LetterboxdSearchRequestData {
  input: string;
}

interface LetterboxdMemberCandidate {
  lid: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

interface LetterboxdRelationshipsRequestData {
  lid: string;
  tmdbIds: number[];
}

interface LetterboxdSeenInfo {
  watched: boolean;
  whenWatched?: string;
}

interface LetterboxdMemberProfileRequestData {
  lid: string;
}

let tokenCached:
  | {
      access_token: string;
      exp: number;
      updated: number;
    }
  | undefined = undefined;

exports.letterboxd = onCall(
  {
    // Reject requests with missing or invalid App Check tokens.
    enforceAppCheck: true,
    secrets: ["LETTERBOXD_KEY", "LETTERBOXD_SECRET"],
  } as IHttpsOptions,
  async (request) => {
    const data: LetterboxdFilmRequestData = request.data;

    if (typeof data.tmdbId !== "number" || !Number.isFinite(data.tmdbId)) {
      throw new HttpsError(
          "invalid-argument",
          "tmdbId must be a finite number."
      );
    }

    const token = await getToken();

    return getFilm(`tmdb:${data.tmdbId}`, token).then((response: any) => {
      return response;
    });
  }
);

exports.letterboxdLogs = onCall(
  {
    // Reject requests with missing or invalid App Check tokens.
    enforceAppCheck: true,
    // consumeAppCheckToken: true, // Consume the token after verification.
    secrets: ["LETTERBOXD_KEY", "LETTERBOXD_SECRET"],
  } as IHttpsOptions,
  async (request) => {
    const data: LetterboxdLogEntriesRequestData = request.data;

    if (typeof data.memberId !== "string" || data.memberId.length === 0) {
      throw new HttpsError(
          "invalid-argument",
          "memberId must be a non-empty string."
      );
    }

    if (data.query !== undefined && typeof data.query !== "string") {
      throw new HttpsError(
          "invalid-argument",
          "query must be a string."
      );
    }

    const token = await getToken();

    return getLogEntries(data.memberId, token, data.query).then(
        (response: any) => {
          return response;
        }
    );
  }
);

// Resolves a typed Letterboxd username to candidate accounts, so the app
// never has to ask a user for their LID directly. Returns MemberSummary-shaped
// candidates for the client to show a "which one is you?" picker over —
// searchMethod=Autocomplete does prefix matching, so the top result is not
// necessarily the right account.
exports.letterboxdSearch = onCall(
  {
    enforceAppCheck: true,
    secrets: ["LETTERBOXD_KEY", "LETTERBOXD_SECRET"],
  } as IHttpsOptions,
  async (request) => {
    const data: LetterboxdSearchRequestData = request.data;

    if (typeof data.input !== "string" || data.input.trim().length === 0) {
      throw new HttpsError(
          "invalid-argument",
          "input must be a non-empty string."
      );
    }

    const token = await getToken();
    return searchMembers(data.input.trim(), token, 5);
  }
);

// Batch "have I already seen this" lookup for a whole poll in one call,
// keyed by TMDB id. Uses memberRelationship=Watched rather than the
// cheaper-looking Ignore: Watched is the one the spec documents explicitly
// and confirms as filtering to the watched subset, whereas Ignore's
// documented purpose is narrower ("for use with sort=MemberRating*") and was
// never live-verified for this use — Watched costs nothing extra here since
// this feature only needs the watched flag, not rating/watchlist state.
exports.letterboxdRelationships = onCall(
  {
    enforceAppCheck: true,
    secrets: ["LETTERBOXD_KEY", "LETTERBOXD_SECRET"],
  } as IHttpsOptions,
  async (request) => {
    const data: LetterboxdRelationshipsRequestData = request.data;

    if (typeof data.lid !== "string" || data.lid.length === 0) {
      throw new HttpsError(
          "invalid-argument",
          "lid must be a non-empty string."
      );
    }

    if (
      !Array.isArray(data.tmdbIds) ||
      data.tmdbIds.some((id) => typeof id !== "number" || !Number.isFinite(id))
    ) {
      throw new HttpsError(
          "invalid-argument",
          "tmdbIds must be an array of finite numbers."
      );
    }

    if (data.tmdbIds.length === 0) {
      return {};
    }

    if (data.tmdbIds.length > 100) {
      throw new HttpsError(
          "invalid-argument",
          "tmdbIds accepts at most 100 ids per call."
      );
    }

    const token = await getToken();
    return getRelationships(data.lid, data.tmdbIds, token);
  }
);

// Profile panel data: one member fetch plus one statistics fetch, run in
// parallel. Both endpoints 404 with the same ambiguous message for "no such
// member" and "member opted out of the API" — since either response 404ing
// means the API surface is unavailable for this LID either way, that's
// surfaced as optedOut rather than a generic error so the client can show an
// accurate, non-alarming state instead of a broken-looking failure.
exports.letterboxdMemberProfile = onCall(
  {
    enforceAppCheck: true,
    secrets: ["LETTERBOXD_KEY", "LETTERBOXD_SECRET"],
  } as IHttpsOptions,
  async (request) => {
    const data: LetterboxdMemberProfileRequestData = request.data;

    if (typeof data.lid !== "string" || data.lid.length === 0) {
      throw new HttpsError(
          "invalid-argument",
          "lid must be a non-empty string."
      );
    }

    const token = await getToken();
    return getMemberProfile(data.lid, token);
  }
);

exports.doesTheDogDie = onCall(
  {
    // Reject requests with missing or invalid App Check tokens.
    enforceAppCheck: true,
    // consumeAppCheckToken: true, // Consume the token after verification.
    secrets: ["DDD_KEY"],
  } as IHttpsOptions,
  async (request) => {
    const data: {imdbId: string} = request.data;

    if (typeof data.imdbId !== "string" || data.imdbId.length === 0) {
      throw new HttpsError(
          "invalid-argument",
          "imdbId must be a non-empty string."
      );
    }

    const headers = {
      "Accept": "application/json",
      "X-API-KEY": process.env.DDD_KEY,
    };

    const options = {
      agent,
      headers,
    };

    try {
      const urlFetchId = `https://www.doesthedogdie.com/dddsearch?imdb=${data.imdbId}`;

      const searchResponse = await fetch(urlFetchId, options);
      if (!searchResponse.ok) {
        throw new Error(`Search request failed: ${searchResponse.status}`);
      }

      const searchData = await searchResponse.json();
      if (!searchData?.items?.length) {
        throw new HttpsError(
            "not-found",
            `No DoesTheDogDie entry found for imdbId ${data.imdbId}`
        );
      }

      const dddId = searchData.items[0].id;
      const urlFetchData = `https://www.doesthedogdie.com/media/${dddId}`;
      const mediaResponse = await fetch(urlFetchData, options);

      if (!mediaResponse.ok) {
        throw new Error(`Media request failed: ${mediaResponse.status}`);
      }
      return await mediaResponse.json();
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
          "failed-precondition",
          `DoesTheDogDie api call failed for imdbId ${data.imdbId}`,
          error
      );
    }
  }
);

exports.pollMeta = onRequest(async (req, res) => {
  res.set("Content-Type", "text/html; charset=utf-8");

  const pollId = req.path.split("/")[2];
  if (!pollId) {
    res.status(200).send(htmlTemplate);
    return;
  }

  try {
    const db = getFirestore();
    const pollSnap = await db.collection("polls").doc(pollId).get();
    if (!pollSnap.exists) {
      res.status(200).send(htmlTemplate);
      return;
    }
    const poll = pollSnap.data() as any;

    const itemsSnap = await db
        .collection("polls").doc(pollId).collection("pollItems").get();
    const items = itemsSnap.docs
        .map((doc) => doc.data())
        .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

    const posterCount = items
        .filter((item: any) => !!item.moviePollItemData?.posterPath).length;

    const html = injectMeta(htmlTemplate, {
      title: `${poll.name} | Poll-A-Lot`,
      description: buildPollDescription(poll, items),
      url: `https://${req.hostname}/poll/${pollId}`,
      ...(posterCount > 0 ? {
        image: `https://europe-west1-poll-a-lot.cloudfunctions.net/pollPreviewImage?pollId=${pollId}`,
        imageWidth: 800,
        imageHeight: 800,
      } : {}),
    });

    res.status(200).send(html);
  } catch (err) {
    res.status(200).send(htmlTemplate);
  }
});

exports.pollPreviewImage = onRequest(async (req, res) => {
  const pollId = req.query.pollId as string | undefined;

  if (!pollId) {
    res.redirect(302, staticShareImage);
    return;
  }

  try {
    const db = getFirestore();
    const itemsSnap = await db
        .collection("polls").doc(pollId).collection("pollItems").get();
    const items = itemsSnap.docs
        .map((doc) => doc.data())
        .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

    const posterPaths: string[] = items
        .map((item: any) => item.moviePollItemData?.posterPath)
        .filter((posterPath: string | undefined): posterPath is string =>
          !!posterPath)
        .slice(0, 4);

    if (posterPaths.length === 0) {
      res.redirect(302, staticShareImage);
      return;
    }

    const size = 800;
    const layout = computeCollageLayout(posterPaths.length, size);

    const tiles = await Promise.all(posterPaths.map(async (posterPath, i) => {
      const response = await fetch(
          `https://image.tmdb.org/t/p/w342${posterPath}`
      );
      if (!response.ok) {
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      const slot = layout[i];
      const buffer = await sharp(Buffer.from(arrayBuffer))
          .resize(Math.round(slot.width), Math.round(slot.height), {fit: "cover"})
          .toBuffer();
      return {input: buffer, left: Math.round(slot.left), top: Math.round(slot.top)};
    }));

    const composite = tiles.filter((tile) => tile !== null) as
      {input: Buffer; left: number; top: number}[];

    if (composite.length === 0) {
      res.redirect(302, staticShareImage);
      return;
    }

    const [watermarkBacking, watermarkLogo] = await Promise.all([
      watermarkBackingBuffer, watermarkLogoBuffer,
    ]);
    const backingOffset = Math.round((size - watermarkBackingSize) / 2);
    const logoOffset = Math.round(
        backingOffset + (watermarkBackingSize - watermarkSize) / 2
    );
    composite.push(
        {input: watermarkBacking, left: backingOffset, top: backingOffset},
        {input: watermarkLogo, left: logoOffset, top: logoOffset}
    );

    const output = await sharp({
      create: {
        width: size,
        height: size,
        channels: 3,
        background: {r: 20, g: 20, b: 20},
      },
    })
        .composite(composite)
        .jpeg({quality: 85})
        .toBuffer();

    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "public, max-age=3600");
    res.status(200).send(output);
  } catch (err) {
    res.redirect(302, staticShareImage);
  }
});

exports.movieMeta = onRequest({secrets: ["TMDB_KEY"]}, async (req, res) => {
  res.set("Content-Type", "text/html; charset=utf-8");

  const movieId = req.path.split("/")[2];
  if (!movieId || !/^\d+$/.test(movieId)) {
    res.status(200).send(htmlTemplate);
    return;
  }

  try {
    const response = await fetch(
        `https://api.themoviedb.org/3/movie/${movieId}?api_key=${process.env.TMDB_KEY}`
    );
    if (!response.ok) {
      res.status(200).send(htmlTemplate);
      return;
    }
    const movie = await response.json();

    const year = typeof movie.release_date === "string" &&
      movie.release_date.length >= 4 ?
      movie.release_date.slice(0, 4) :
      undefined;
    const title = `${movie.title}${year ? ` (${year})` : ""} | Poll-A-Lot`;

    const ratingAndRuntime = [
      typeof movie.vote_average === "number" && movie.vote_average > 0 ?
        `⭐ ${movie.vote_average.toFixed(1)}/10` :
        undefined,
      typeof movie.runtime === "number" && movie.runtime > 0 ?
        formatRuntime(movie.runtime) :
        undefined,
    ].filter((part): part is string => !!part);

    const descriptionParts = [
      movie.tagline ? `"${movie.tagline}"` : undefined,
      movie.overview ? truncateText(movie.overview, 150) : undefined,
      ratingAndRuntime.length > 0 ?
        `${ratingAndRuntime.join(" · ")} on TMDb.` :
        undefined,
    ].filter((part): part is string => !!part);

    const backdropOrPoster = movie.backdrop_path || movie.poster_path;
    const usingBackdrop = !!movie.backdrop_path;

    const html = injectMeta(htmlTemplate, {
      title,
      description: descriptionParts.join(" "),
      url: `https://${req.hostname}/movie/${movieId}`,
      ...(backdropOrPoster ? {
        image: `https://image.tmdb.org/t/p/w1280${backdropOrPoster}`,
        ...(usingBackdrop ? {imageWidth: 1280, imageHeight: 720} : {}),
      } : {}),
    });

    res.status(200).send(html);
  } catch (err) {
    res.status(200).send(htmlTemplate);
  }
});

function authenticate(): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
}> {
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json",
  };

  const options = {
    agent,
    method: "POST",
    headers,
    body: `grant_type=client_credentials&client_id=${process.env.LETTERBOXD_KEY}&client_secret=${process.env.LETTERBOXD_SECRET}`,
    params: {
      grant_type: "client_credentials",
      client_id: process.env.LETTERBOXD_KEY,
      client_secret: process.env.LETTERBOXD_SECRET,
    },
  };

  const url = `${baseUrl}auth/token`;

  return fetch(url, options)
      .then((response: any) => {
        if (!response.ok) {
          throw new Error(`Authenticate request failed: ${response.status}`);
        }
        return response.json();
      });
}

async function getToken(): Promise<string> {
  let token: string | undefined = undefined;
  const now = Date.now();

  if (tokenCached !== undefined && now < tokenCached.exp) {
    token = tokenCached.access_token;
  } else {
    const document = getFirestore().collection("tokens").doc("letterboxd");
    const tokenEntry = await document.get();
    const tokenData = tokenEntry.data();

    if (now < tokenData?.exp) {
      token = tokenData?.access_token;
      tokenCached = tokenData as {
        access_token: string;
        exp: number;
        updated: number;
      };
    }
  }

  if (!token) {
    async function newToken() {
      try {
        await authenticate()
            .then(async (data) => {
              const accessToken = `${data.token_type} ${data.access_token}`;
              const updated = new Date();

              const expires = new Date(
                  updated.getTime() + data.expires_in * 1000
              );

              const entry = {
                access_token: accessToken,
                exp: expires.getTime(),
                updated: updated.getTime(),
              };

              tokenCached = entry;
              const document = getFirestore()
                  .collection("tokens")
                  .doc("letterboxd");
              await document.update(entry);
              token = accessToken;
            })
            .catch((error) => {
              throw new HttpsError(
                  "failed-precondition",
                  "Error with authenticate http request.",
                  error
              );
            });
      } catch (err) {
        throw new HttpsError("failed-precondition", "Updating token failed.");
      }
    }
    await newToken();
  }

  // TODO: Make actual api request
  if (!token) {
    throw new HttpsError(
        "failed-precondition",
        "Token renewal failed. " +
        "Check the correct credentials or contact admnins."
    );
  }

  return token;
}

function getFilm(letterboxId: string, token: string) {
  const headers = {Authorization: token};

  const options = {
    agent,
    headers,
  };
  const url = `${baseUrl}film/${letterboxId}`;

  return fetch(url, options)
      .then((response: any) => {
        if (!response.ok) {
          throw new Error(`Film request failed: ${response.status}`);
        }
        return response.json();
      })
      .catch((error: any) => {
        throw new HttpsError(
            "failed-precondition",
            `Letterboxd film api call (${letterboxId}) failed with error:`,
            error
        );
      });
}

async function getLogEntries(memberId: string, token: string, query?: string) {
  const response = await fetchLogEntries(memberId, token, query);

  // settings.component.html's "Letterboxd usernames" field has always taken
  // usernames, but member-scoped endpoints key on LID only, so a username
  // saved there silently returns zero entries. Rather than migrate stored
  // preferences, resolve on read: an already-correct LID succeeds on the
  // first try above and never reaches here. Only an *exact* (case
  // insensitive) username match is accepted — this list has no
  // pick-your-account confirmation step, unlike the account-linking flow, so
  // a fuzzy top-search-result here could silently show a stranger's reviews.
  if (response.itemCount === 0) {
    try {
      const candidates = await searchMembers(memberId, token, 5);
      const exactMatch = candidates.find(
          (c) => c.username.toLowerCase() === memberId.toLowerCase()
      );
      if (exactMatch) {
        return await fetchLogEntries(exactMatch.lid, token, query);
      }
    } catch (error) {
      // The username-resolution fallback is a best-effort convenience — an
      // already-correct LID never reaches it, so a failure here just leaves
      // the original (possibly genuinely empty) log-entries response intact
      // rather than turning it into a harder failure.
      console.error(`Letterboxd username fallback failed for ${memberId}:`, error);
    }
  }

  return response;
}

function fetchLogEntries(memberId: string, token: string, query?: string) {
  const headers = {Authorization: token};

  const options = {
    agent,
    headers,
  };
  const url = `${baseUrl}log-entries?member=${memberId}${ query ? `&${ query }`: ""}`;

  return fetch(url, options)
      .then((response: any) => {
        if (!response.ok) {
          throw new Error(`Log-entries request failed: ${response.status}`);
        }
        return response.json();
      })
      .catch((error: any) => {
        throw new HttpsError(
            "failed-precondition",
            `Letterboxd log-entries api call (${memberId}) failed with error:`,
            error
        );
      });
}

async function getMemberProfile(
    lid: string, token: string
): Promise<{optedOut: boolean; member?: any; statistics?: any}> {
  const headers = {Authorization: token};
  const options = {agent, headers};

  let memberRes;
  let statsRes;
  try {
    [memberRes, statsRes] = await Promise.all([
      fetch(`${baseUrl}member/${lid}`, options),
      fetch(`${baseUrl}member/${lid}/statistics`, options),
    ]);
  } catch (error) {
    throw new HttpsError(
        "failed-precondition",
        `Letterboxd member api call (${lid}) failed with error:`,
        error
    );
  }

  if (memberRes.status === 404 || statsRes.status === 404) {
    return {optedOut: true};
  }

  if (!memberRes.ok || !statsRes.ok) {
    throw new HttpsError(
        "failed-precondition",
        `Letterboxd member api call (${lid}) failed with status ` +
        `${memberRes.status}/${statsRes.status}`
    );
  }

  const [member, statistics] = await Promise.all([
    memberRes.json(),
    statsRes.json(),
  ]);

  return {optedOut: false, member, statistics};
}

function getRelationships(
    lid: string, tmdbIds: number[], token: string
): Promise<Record<number, LetterboxdSeenInfo>> {
  const headers = {Authorization: token};

  const options = {
    agent,
    headers,
  };
  const filmIdParams = tmdbIds.map((id) => `filmId=tmdb:${id}`).join("&");
  const url = `${baseUrl}films?member=${lid}&memberRelationship=Watched` +
    `&perPage=100&${filmIdParams}`;

  return fetch(url, options)
      .then((response: any) => {
        if (!response.ok) {
          throw new Error(`Films request failed: ${response.status}`);
        }
        return response.json();
      })
      .then((data: any) => {
        const result: Record<number, LetterboxdSeenInfo> = {};
        (data.items ?? []).forEach((film: any) => {
          const tmdbLink = (film.links ?? [])
              .find((l: any) => l.type === "tmdb");
          const tmdbId = tmdbLink ? Number(tmdbLink.id) : undefined;
          if (!tmdbId || Number.isNaN(tmdbId)) {
            return;
          }
          const memberRelationship = (film.relationships ?? [])
              .find((r: any) => r.member?.id === lid)?.relationship;
          if (memberRelationship?.watched) {
            result[tmdbId] = {
              watched: true,
              whenWatched: memberRelationship.whenWatched,
            };
          }
        });
        return result;
      })
      .catch((error: any) => {
        throw new HttpsError(
            "failed-precondition",
            `Letterboxd films api call (${lid}) failed with error:`,
            error
        );
      });
}

function searchMembers(
    input: string, token: string, perPage: number
): Promise<LetterboxdMemberCandidate[]> {
  const headers = {Authorization: token};

  const options = {
    agent,
    headers,
  };
  const url = `${baseUrl}search?input=${encodeURIComponent(input)}` +
    `&searchMethod=Autocomplete&include=MemberSearchItem&perPage=${perPage}`;

  return fetch(url, options)
      .then((response: any) => {
        if (!response.ok) {
          throw new Error(`Search request failed: ${response.status}`);
        }
        return response.json();
      })
      .then((data: any) => (data.items ?? [])
          .filter((item: any) => item.type === "MemberSearchItem" && item.member)
          .slice(0, perPage)
          .map((item: any) => ({
            lid: item.member.id,
            username: item.member.username,
            displayName: item.member.displayName,
            avatarUrl: item.member.avatar?.sizes?.[0]?.url,
          } as LetterboxdMemberCandidate)))
      .catch((error: any) => {
        throw new HttpsError(
            "failed-precondition",
            `Letterboxd search api call (${input}) failed with error:`,
            error
        );
      });
}
