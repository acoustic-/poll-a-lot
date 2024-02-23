import { Injectable } from "@angular/core";
import { Observable, from } from "rxjs";
import { getFunctions, httpsCallable } from "firebase/functions";
import { LetterboxdItem } from "../model/tmdb";

@Injectable()
export class LetterboxdService {
  constructor() {}

  getFilm(tmdbId: number): Observable<LetterboxdItem> {
    const functions = getFunctions();
    const letterboxd = httpsCallable(functions, "letterboxd", {
      limitedUseAppCheckTokens: true,
    });
    return from(
      letterboxd({ tmdbId }).then(
        (response: {data: LetterboxdItem}) => 
         response.data
      )
    );
  }
}
