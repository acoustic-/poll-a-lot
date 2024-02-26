import { Injectable } from "@angular/core";
import { Observable, from } from "rxjs";
import { Functions, httpsCallable } from '@angular/fire/functions';
import { LetterboxdItem } from "../model/tmdb";

@Injectable()
export class LetterboxdService {
  constructor(private functions: Functions) {}

  getFilm(tmdbId: number): Observable<LetterboxdItem> {
    const letterboxd = httpsCallable(this.functions, "letterboxd", {
      // limitedUseAppCheckTokens: true,
    });
    return from(
      letterboxd({ tmdbId }).then(
        (response: {data: LetterboxdItem}) => 
         response.data
      )
    );
  }
}
