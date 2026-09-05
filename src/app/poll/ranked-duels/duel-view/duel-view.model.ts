import { LetterboxdSeenInfo } from "../../../../model/letterboxd";
import { PollItem } from "../../../../model/poll";
import { Movie, MoviePollItemData } from "../../../../model/tmdb";

/** Oscar standing, same three states movie-poll-item's badge uses. */
export type OscarStanding = "won" | "nominated" | "none";

/** Everything one duel band shows — the complete movie-poll-item set plus
 *  billed cast. Built from the poll item's own `moviePollItemData` (always
 *  present, no fetch) and, when it has resolved, the full `Movie` for the two
 *  fields that snapshot doesn't carry: genres and cast. `oscar` and
 *  `letterboxdSeen` are supplied by the caller (a sync service lookup and the
 *  poll's viewer-scoped Letterboxd map, neither of which belongs in here). */
export interface DuelBand {
  itemId: string;
  movieId?: number;
  title: string;
  /** Original-language title — empty unless it actually differs from `title`
   *  (movie-poll-item shows it in parens under the title on that condition). */
  originalTitle: string;
  year: string;
  runtimeLabel: string;
  director: string;
  country: string;
  tagline: string;
  overview: string;
  posterPath?: string;
  backdropPath?: string;
  rating?: number;
  genres: string[];
  cast: string[];
  oscar: OscarStanding;
  letterboxdSeen?: LetterboxdSeenInfo;
  /** External scores for the band's `.movie-ratings` row — same shapes the
   *  movie-dialog pills consume, each `""` until the full `Movie` (with its
   *  OMDb / Letterboxd data) has resolved. `imdbRating` is the bare number
   *  ("8.1"); `rottenRating` keeps its "%"; `letterboxdRating` is to 1 dp. */
  imdbRating: string;
  metaRating: string;
  rottenRating: string;
  letterboxdRating: string;
}

export interface BuildDuelBandOptions {
  castLimit?: number;
  oscar?: OscarStanding;
  letterboxdSeen?: LetterboxdSeenInfo;
}

function yearOf(date: string | undefined): string {
  const y = (date ?? "").slice(0, 4);
  return /^\d{4}$/.test(y) ? y : "";
}

export function buildDuelBand(
  pollItem: PollItem | undefined,
  movie: Movie | undefined,
  opts: BuildDuelBandOptions = {}
): DuelBand {
  const data: Partial<MoviePollItemData> = pollItem?.moviePollItemData ?? {};

  const runtime = movie?.runtime ?? data.runtime ?? 0;
  const cast = (movie?.credits?.cast ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .slice(0, opts.castLimit ?? 3)
    .map((c) => c.name);
  const directors = (movie?.credits?.crew ?? [])
    .filter((c) => c.department === "Directing" && c.job === "Director")
    .map((c) => c.name);

  const title = data.title ?? pollItem?.name ?? "Unknown";
  const originalTitle = data.originalTitle || movie?.originalTitle || "";

  return {
    itemId: pollItem?.id ?? "",
    movieId: pollItem?.movieId,
    title,
    originalTitle: originalTitle && originalTitle !== title ? originalTitle : "",
    year: yearOf(data.releaseDate ?? movie?.releaseDate),
    runtimeLabel: runtime > 0 ? `${runtime} min` : "",
    director: data.director || directors.join(", ") || "",
    country: data.productionCountry || movie?.productionCountries?.[0]?.name || "",
    tagline: data.tagline || movie?.tagline || "",
    overview: data.overview || movie?.overview || "",
    posterPath: data.posterPath || movie?.posterPath || undefined,
    backdropPath: data.backdropPath || movie?.backdropPath || undefined,
    rating: data.tmdbRating ?? movie?.tmdbRating,
    genres: movie?.genres ?? [],
    cast,
    oscar: opts.oscar ?? "none",
    letterboxdSeen: opts.letterboxdSeen,
    // OMDb hands `imdbRating` back as "8.5/10"; keep just the number, like
    // movie-dialog's `imdbRating?.split("/")[0]`.
    imdbRating: movie?.imdbRating ? movie.imdbRating.split("/")[0] : "",
    metaRating: movie?.metaRating || "",
    rottenRating: movie?.rottenRating || "",
    letterboxdRating:
      typeof movie?.letterboxdRating === "number" ? movie.letterboxdRating.toFixed(1) : "",
  };
}
