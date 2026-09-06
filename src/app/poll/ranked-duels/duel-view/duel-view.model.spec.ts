import { PollItem } from "../../../../model/poll";
import { Movie, MoviePollItemData } from "../../../../model/tmdb";
import { buildDuelBand } from "./duel-view.model";

function pollItem(over: Partial<PollItem> = {}): PollItem {
  return {
    id: "i1",
    pollId: "p",
    name: "Fallback Name",
    created: "0",
    voters: [],
    order: 0,
    movieId: 42,
    ...over,
  } as PollItem;
}

const SNAPSHOT: MoviePollItemData = {
  id: 42,
  title: "Dune",
  originalTitle: "Dune",
  tagline: "Dreams are messages from the deep.",
  overview: "Paul Atreides arrives on Arrakis.",
  director: "Denis Villeneuve",
  productionCountry: "United States of America",
  runtime: 155,
  releaseDate: "2021-09-15",
  posterPath: "/poster.jpg",
  backdropPath: "/backdrop.jpg",
  tmdbRating: 7.8,
};

describe("buildDuelBand", () => {
  it("renders fully from the poll item's own snapshot, no movie fetch needed", () => {
    const band = buildDuelBand(pollItem({ moviePollItemData: SNAPSHOT }), undefined);
    expect(band.itemId).toBe("i1");
    expect(band.movieId).toBe(42);
    expect(band.title).toBe("Dune");
    expect(band.year).toBe("2021");
    expect(band.runtimeLabel).toBe("155 min");
    expect(band.director).toBe("Denis Villeneuve");
    expect(band.country).toBe("United States of America");
    expect(band.tagline).toBe("Dreams are messages from the deep.");
    expect(band.posterPath).toBe("/poster.jpg");
    expect(band.backdropPath).toBe("/backdrop.jpg");
    expect(band.rating).toBe(7.8);
    // Genres + cast aren't in the snapshot — they stay empty until a fetch lands.
    expect(band.genres).toEqual([]);
    expect(band.cast).toEqual([]);
  });

  it("layers billed cast + genres in from the full Movie, keeping the snapshot's other fields", () => {
    const movie = {
      genres: ["Science Fiction", "Adventure"],
      credits: {
        cast: [
          { name: "Zendaya", order: 2 },
          { name: "Timothée Chalamet", order: 0 },
          { name: "Rebecca Ferguson", order: 1 },
          { name: "Fourth Billed", order: 3 },
        ],
        crew: [{ name: "Denis Villeneuve", department: "Directing", job: "Director" }],
      },
    } as unknown as Movie;

    const band = buildDuelBand(pollItem({ moviePollItemData: SNAPSHOT }), movie);
    expect(band.cast).toEqual(["Timothée Chalamet", "Rebecca Ferguson", "Zendaya"]); // order-sorted, top 3
    expect(band.genres).toEqual(["Science Fiction", "Adventure"]);
    expect(band.director).toBe("Denis Villeneuve");
  });

  it("falls back to Movie fields (and the poll item name) when there is no snapshot", () => {
    const movie = {
      releaseDate: "1999-03-31",
      runtime: 136,
      tagline: "Free your mind.",
      overview: "A hacker learns the truth.",
      posterPath: "/m.jpg",
      backdropPath: "/mb.jpg",
      tmdbRating: 8.2,
      genres: ["Action"],
      productionCountries: [{ name: "United States of America" }],
      credits: { cast: [{ name: "Keanu Reeves", order: 0 }], crew: [{ name: "The Wachowskis", department: "Directing", job: "Director" }] },
    } as unknown as Movie;

    const band = buildDuelBand(pollItem({ name: "The Matrix", moviePollItemData: undefined }), movie);
    expect(band.title).toBe("The Matrix");
    expect(band.year).toBe("1999");
    expect(band.runtimeLabel).toBe("136 min");
    expect(band.director).toBe("The Wachowskis");
    expect(band.country).toBe("United States of America");
    expect(band.cast).toEqual(["Keanu Reeves"]);
  });

  it("tolerates a missing poll item and empty data", () => {
    const band = buildDuelBand(undefined, undefined);
    expect(band.title).toBe("Unknown");
    expect(band.year).toBe("");
    expect(band.runtimeLabel).toBe("");
    expect(band.genres).toEqual([]);
  });

  it("surfaces the original title only when it differs from the display title", () => {
    const same = buildDuelBand(pollItem({ moviePollItemData: SNAPSHOT }), undefined);
    expect(same.originalTitle).toBe(""); // SNAPSHOT.title === SNAPSHOT.originalTitle

    const differs = buildDuelBand(
      pollItem({ moviePollItemData: { ...SNAPSHOT, title: "Spirited Away", originalTitle: "千と千尋の神隠し" } }),
      undefined
    );
    expect(differs.originalTitle).toBe("千と千尋の神隠し");
  });

  it("formats the external rating strings off the full Movie, blank until it lands", () => {
    const bare = buildDuelBand(pollItem({ moviePollItemData: SNAPSHOT }), undefined);
    expect([bare.imdbRating, bare.metaRating, bare.rottenRating, bare.letterboxdRating])
      .toEqual(["", "", "", ""]);

    const rated = buildDuelBand(pollItem({ moviePollItemData: SNAPSHOT }), {
      imdbRating: "8.1/10",
      metaRating: "83",
      rottenRating: "83%",
      letterboxdRating: 3.94,
    } as unknown as Movie);
    expect(rated.imdbRating).toBe("8.1"); // number part only, like movie-dialog
    expect(rated.metaRating).toBe("83");
    expect(rated.rottenRating).toBe("83%");
    expect(rated.letterboxdRating).toBe("3.9");
  });

  it("defaults oscar to 'none' and passes through the caller's extras", () => {
    const plain = buildDuelBand(pollItem({ moviePollItemData: SNAPSHOT }), undefined);
    expect(plain.oscar).toBe("none");
    expect(plain.letterboxdSeen).toBeUndefined();

    const enriched = buildDuelBand(pollItem({ moviePollItemData: SNAPSHOT }), undefined, {
      oscar: "won",
      letterboxdSeen: { watched: true, whenWatched: "2024-01-02" },
    });
    expect(enriched.oscar).toBe("won");
    expect(enriched.letterboxdSeen).toEqual({ watched: true, whenWatched: "2024-01-02" });
  });

  it("blanks a nonsense release date rather than showing '01' etc.", () => {
    const band = buildDuelBand(
      pollItem({ moviePollItemData: { ...SNAPSHOT, releaseDate: "" } }),
      undefined
    );
    expect(band.year).toBe("");
  });
});
