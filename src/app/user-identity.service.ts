import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { isPlatformServer } from "@angular/common";
import { Observable, concat, from, of } from "rxjs";
import { catchError, map, mergeMap, tap, toArray } from "rxjs/operators";
import { Firestore, doc, getDoc } from "@angular/fire/firestore";
import { PublicProfile } from "../model/user";
import { UserRef, voterKey } from "./user-identity";

export interface ResolvedIdentity {
  key: string; // voterKey — stable, usable as an *ngFor track and color seed
  displayName: string;
  photoURL: string | null; // live profile only; never from the vote snapshot
  initials: string;
  color: string;
  isLive: boolean; // resolved from a publicProfile vs. the vote's own snapshot
}

// publicProfiles only allows `get` (single doc by known id), not `list` — see
// firestore.rules — so this is a concurrency cap on parallel individual
// getDoc() calls, not a query batch size.
export const CHUNK_SIZE = 30;

export function initialsFor(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  const first = parts[0][0];
  const second = parts.length > 1 ? parts[1][0] : "";
  return (first + second).toUpperCase();
}

// A simple, stable string hash (not cryptographic — just needs to be
// deterministic per key so the same voter always gets the same color).
export function colorFor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

function fallbackIdentity(ref: UserRef, key: string): ResolvedIdentity {
  const displayName = ref.name || "Anonymous";
  return {
    key,
    displayName,
    photoURL: null,
    initials: initialsFor(displayName),
    color: colorFor(key),
    isLive: false,
  };
}

/** One fallback identity per distinct voterKey, derived only from the frozen vote
 *  snapshot — never touches Firestore. */
export function buildFallbackMap(refs: readonly UserRef[]): Map<string, ResolvedIdentity> {
  const map = new Map<string, ResolvedIdentity>();
  refs.forEach((ref) => {
    const key = voterKey(ref);
    if (!map.has(key)) {
      map.set(key, fallbackIdentity(ref, key));
    }
  });
  return map;
}

/** Anonymous voters' keys (localUserId/name) never appear in `cache` (only real
 *  uids do, keyed the same way since voterKey(ref) === ref.id for signed-in
 *  voters), so this naturally leaves them on their fallback identity untouched. */
export function mergeWithCache(
  fallback: ReadonlyMap<string, ResolvedIdentity>,
  cache: ReadonlyMap<string, ResolvedIdentity>
): Map<string, ResolvedIdentity> {
  const merged = new Map<string, ResolvedIdentity>();
  fallback.forEach((identity, key) => merged.set(key, cache.get(key) ?? identity));
  return merged;
}

/** Only real uids are ever fetched/cached — anonymous voters (id-less) are
 *  filtered out here before anything reaches Firestore, and both already-cached
 *  uids AND uids already confirmed to have no publicProfiles doc (`noProfile`)
 *  are skipped, so a repeat resolve$() for the same poll costs nothing either
 *  way — a uid with no profile would otherwise be re-queried on every call
 *  forever, since a "not found" result never gets into `cache` on its own. */
export function idsNeedingFetch(
  refs: readonly UserRef[],
  cache: ReadonlyMap<string, ResolvedIdentity>,
  noProfile: ReadonlySet<string> = new Set()
): string[] {
  return Array.from(
    new Set(
      refs
        .map((ref) => ref.id)
        .filter((id): id is string => !!id && !cache.has(id) && !noProfile.has(id))
    )
  );
}

export function toResolvedIdentity(profile: PublicProfile): ResolvedIdentity {
  return {
    key: profile.uid,
    displayName: profile.displayName,
    photoURL: profile.photoURL,
    initials: initialsFor(profile.displayName),
    color: colorFor(profile.uid),
    isLive: true,
  };
}

@Injectable({ providedIn: "root" })
export class UserIdentityService {
  private readonly firestore = inject(Firestore);
  private readonly platformId = inject(PLATFORM_ID);

  // Session-lifetime only — profiles change rarely, and this is deliberately
  // simple rather than persisted (see §6.6 in the plan: one `in` query per poll
  // load is already negligible against the app's existing per-item subscriptions).
  private readonly cache = new Map<string, ResolvedIdentity>();
  // Uids confirmed to have no publicProfiles doc — without this, an id that
  // never gets a hit is indistinguishable from one nobody's asked about yet,
  // and idsNeedingFetch would re-request it on every single resolve$() call.
  private readonly noProfile = new Set<string>();

  /** Remove a uid from the cache so the next resolve$() re-fetches from Firestore. */
  invalidate(uid: string): void {
    this.cache.delete(uid);
    this.noProfile.delete(uid);
  }

  /** Resolves a batch of voters in as few Firestore reads as possible. Emits the
   *  snapshot-derived fallback identities immediately, then a second, upgraded
   *  emission once any live publicProfiles are fetched — the avatar row must
   *  never flash empty, and must work with no network at all. */
  resolve$(refs: readonly UserRef[]): Observable<Map<string, ResolvedIdentity>> {
    const fallback = mergeWithCache(buildFallbackMap(refs), this.cache);

    if (isPlatformServer(this.platformId)) {
      return of(fallback);
    }

    const idsToFetch = idsNeedingFetch(refs, this.cache, this.noProfile);
    if (idsToFetch.length === 0) {
      return of(fallback);
    }

    return concat(
      of(fallback),
      this.fetchProfiles$(idsToFetch).pipe(
        tap((profiles) => {
          profiles.forEach((profile) => this.cache.set(profile.uid, toResolvedIdentity(profile)));
          const foundIds = new Set(profiles.map((profile) => profile.uid));
          idsToFetch.filter((id) => !foundIds.has(id)).forEach((id) => this.noProfile.add(id));
        }),
        map(() => mergeWithCache(buildFallbackMap(refs), this.cache)),
        // publicProfiles unreachable → stay on the fallback already emitted above,
        // matching every other document read in this app degrading gracefully.
        catchError(() => of(fallback))
      )
    );
  }

  private fetchProfiles$(ids: readonly string[]): Observable<PublicProfile[]> {
    return from(ids).pipe(
      // A `get` per id, not a `where(documentId(), "in", ids)` query — the
      // latter is a `list` under firestore.rules, which is denied. Bounded
      // to CHUNK_SIZE concurrent requests so a large voter list doesn't fire
      // them all in one burst.
      mergeMap((id) => from(getDoc(doc(this.firestore, "publicProfiles", id))), CHUNK_SIZE),
      map((snap) => (snap.exists() ? (snap.data() as PublicProfile) : undefined)),
      toArray(),
      map((profiles) => profiles.filter((profile): profile is PublicProfile => !!profile))
    );
  }
}
