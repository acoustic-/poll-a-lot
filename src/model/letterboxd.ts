export interface LetterboxdItem {
  id: string;
  name: string;
  sortingName: string;
  alternativeNames: string[];
  releaseYear: number;
  runTime: number;
  rating: number;
  poster: {
    sizes: { width: number; height: number; url: string }[];
  };
  adult: boolean;
  reviewsHidden: boolean;
  posterCustomisable: boolean;
  links: { type: string; id: string; url: string }[];
  genres: { id: string; name: string };
  tagline: string;
  description: string;
  top250Position: number | null;
  filmCollectionId: string;
  backdrop: { sizes: { width: number; height: number; url: string }[] };
  backdropFocalPoint: number;
  trailer: { type: string; id: string; url: string };
  countries: { code: string; name: string; flagUrl: string }[];
  originalLanguage: { code: string; name: string };
  productionLanguage: { code: string; name: string };
  primaryLanguage: { code: string; name: string };
  languages: { code: string; name: string }[];
  releases: {
    type: string;
    country: {
      code: string;
      name: string;
      flagUrl: string;
      certification: string;
      note: string;
      releaseDate: string;
    };
  }[];
  contributions: {
    type: string;
    contributors: {
      id: string;
      name: string;
      characterName?: string;
      tmdbid: number;
    }[];
  }[];
  news: {
    title: string;
    image: { sizes: { width: number; height: number; url: string }[] };
    url: string;
    shortDescription: string;
    longDescription: string;
  }[];
  recentStories: {
    id: string;
    name: string;
    author: {
      id: string;
      username: string;
      givenname: string;
      displayName: string;
      shortName: string;
      pronoun: {
        id: string;
        label: string;
        subjectPronoun: string;
        objectPronoun: string;
        possessiveAdjective: string;
        reflexive: string;
      };
      avatar: { sizes: { width: number; height: number; url: string }[] };
      memberStatus: string;
      hideAdsInContent: boolean;
      accountStatus: string;
      hideAds;
    }[];
    videoUrl: string;
    bodyHtml: string;
    bodyLbml: string;
    whenUpdated: string;
    whenCreated: string;
    pinned: boolean;
    image: { sizes: { width: number; height: number; url: string }[] };
  }[];
}

export interface LogEntries {
  next: string;
  items: LogEntry[];
  itemCount: number;
}

export interface LogEntry {
  id: string;
  name: string;
  owner: MemberSummary;
  film: FilmSummary;
  review?: Review;
  diaryDetails?: DiaryDetails;
  tags2: Tag[];
  whenCreated: string;
  whenUpdated: string;
  rating?: number;
  like: boolean;
  commentable: boolean;
  links: Link[];
}

export interface Review {
  lbml: string; // The review text in LBML. May contain the following HTML tags: <br> <strong> <em> <b> <i> <a href=""> <blockquote>.
  containsSpoilers: boolean;
  spoilersLocked: boolean;
  moderated: boolean;
  whenReviewed: string;
  text: string; // HTML
}

export interface MemberSummary {
  id: string;
  username: string;
  givenName: string;
  displayName: string;
  shortName: string;
  pronoun: Pronoun;
  avatar: { sizes: ImageSize[] };
  memberStatus: string;
  hideAdsInContent: boolean;
  accountStatus: string;
  hideAds: boolean;
}

export interface Pronoun {
  id: string;
  label: string;
  subjectPronoun: string;
  objectPronoun: string;
  possessiveAdjective: string;
  possessivePronoun: string;
  reflexive: string;
}

export interface FilmSummary {
  id: string;
  name: string;
  sortingName: string;
  releaseYear: number;
  runTime: number;
  rating: number;
  directors: Director[];
  poster: { sizes: ImageSize[] };
  adult: boolean;
  reviewsHidden: boolean;
  posterCustomisable: boolean;
  backdropCustomisable: boolean;
  filmCollectionId: string;
  links: Link[];
  relationships: Relationship[];
  genres: Genre[];
}

export interface Director {
  id: string;
  name: string;
  tmdbid: string;
  customPoster?: ImageSize[];
}

export interface ImageSize {
  width: number;
  height: number;
  url: string;
}

export interface Link {
  type: string;
  id: string;
  url: string;
}

export interface Relationship {
  member: MemberSummary;
  relationship: MemberRelationship;
}

export interface MemberRelationship {
  watched: boolean;
  whenWatched: string;
  liked: boolean;
  favorited: boolean;
  inWatchlist: boolean;
  rating: number;
  reviews: string[];
  diaryEntries: string[];
  rewatched: boolean;
  privacyPolicy: string;
}

export interface Genre {
  id: string;
  name: string;
}

export interface DiaryDetails {
  diaryDate: string;
  rewatch: boolean;
}

export interface Tag {
  tag: string;
  code: string;
  displayTag: string;
}
