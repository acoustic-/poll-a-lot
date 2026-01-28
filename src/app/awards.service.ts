import { Injectable } from '@angular/core';
import movieAwards from '../assets/data/oscar-winners.json';
import movieAwards2 from '../assets/data/oscar-winners-v2.json';
import { OscarAward } from '../model/award';

@Injectable({
  providedIn: 'root',
})
export class AwardsService {
  readonly oscarAwards = [...movieAwards as OscarAward[], ...movieAwards2 as OscarAward[]];

  oscarAwardsMap: Map<number, OscarAward[]> = new Map();

  constructor() { 
    this.oscarAwards.forEach(award => {
      award.movies.forEach(movie => {
        const awardsForMovie = this.oscarAwardsMap.get(movie.tmdb_id) || [];
        awardsForMovie.push(award);
        this.oscarAwardsMap.set(movie.tmdb_id, awardsForMovie);
      });
    });
  }

  getOscarAwardsForMovie(tmdbId: number): OscarAward[] {
    return this.oscarAwardsMap.get(tmdbId) || [];
  }

  getOscardAwardCountForMovie(tmdbId: number, type: 'win' | 'nominee'): number {
    if (type === 'win') {
      return this.getOscarAwardsForMovie(tmdbId).filter(award => award.won).length;
    } else {
      return this.getOscarAwardsForMovie(tmdbId).length;
    }
  }
}
