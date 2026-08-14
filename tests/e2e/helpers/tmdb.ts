import { Page } from "@playwright/test";
import configuration from "../fixtures/tmdb/configuration.json";
import genres from "../fixtures/tmdb/genres.json";
import movies from "../fixtures/tmdb/movies.json";

// A real, tiny 1x1 PNG (same one fixtures.ts uses for LIVE_PROFILE.photoURL) rather
// than an empty body — some <img> handling treats a 0-byte response as a load error.
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

type FixtureMovie = (typeof movies)[keyof typeof movies];

// Without this, every add-movie/point-voting test would hit the real TMDb API
// (slow, rate-limit-prone, non-deterministic) and OMDb (fails outright — CORS).
// Also stubs every europe-west1-poll-a-lot Cloud Function (Letterboxd, Does the
// Dog Die, ...): they're AppCheck-gated and e2e doesn't have a valid AppCheck
// token (app.module.ts), so left unstubbed they'd still "work" (the app catches
// the failure) but log a console.error — or, in a sandboxed/offline runner, fail
// the request outright — on every movie dialog open, tripping
// failOnConsoleErrors() for reasons unrelated to the feature under test. All of
// them degrade gracefully on an empty/null result, so one blanket stub is safe.
export async function stubMovieApis(page: Page): Promise<void> {
  await page.route("https://api.themoviedb.org/**", (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/3/configuration") {
      return route.fulfill({ json: configuration });
    }
    if (url.pathname === "/3/genre/movie/list") {
      return route.fulfill({ json: genres });
    }
    if (url.pathname === "/3/search/movie") {
      const query = (url.searchParams.get("query") ?? "").replace(/\+/g, " ").toLowerCase();
      const results = Object.values(movies).filter((movie: FixtureMovie) =>
        movie.title.toLowerCase().includes(query)
      );
      return route.fulfill({ json: { page: 1, results, total_pages: 1, total_results: results.length } });
    }
    const movieMatch = url.pathname.match(/^\/3\/movie\/(\d+)$/);
    if (movieMatch) {
      const movie = movies[movieMatch[1] as keyof typeof movies];
      return movie
        ? route.fulfill({ json: movie })
        : route.fulfill({ status: 404, json: { status_message: "The resource you requested could not be found." } });
    }
    if (/^\/3\/movie\/\d+\/watch\/providers$/.test(url.pathname)) {
      return route.fulfill({ json: { id: 0, results: {} } });
    }
    if (url.pathname === "/3/watch/providers/movie") {
      return route.fulfill({ json: { results: [] } });
    }
    if (url.pathname.startsWith("/3/movie/popular") || url.pathname.startsWith("/3/movie/top_rated") ||
        url.pathname.startsWith("/3/discover/movie") || url.pathname.startsWith("/3/movie/now_playing")) {
      return route.fulfill({ json: { page: 1, results: Object.values(movies), total_pages: 1, total_results: 2 } });
    }
    return route.fulfill({ status: 404, json: { status_message: "Not stubbed for e2e — add a case in tests/e2e/helpers/tmdb.ts" } });
  });

  await page.route("https://image.tmdb.org/**", (route) =>
    route.fulfill({ body: TRANSPARENT_PNG, contentType: "image/png" })
  );

  await page.route("https://www.omdbapi.com/**", (route) => route.fulfill({ json: {} }));

  await page.route("https://europe-west1-poll-a-lot.cloudfunctions.net/**", (route) => {
    const url = new URL(route.request().url());
    // doesTheDogDie's response is read as response.data.topicItemStats.map(...)
    // with no null guard (ddd-info.component.ts) — a bare `null` would crash it,
    // so it gets a well-formed empty shape rather than the generic stub below.
    if (url.pathname === "/doesTheDogDie") {
      return route.fulfill({ json: { data: { topicItemStats: [] } } });
    }
    return route.fulfill({ json: { data: null } });
  });
}
