import { DialogRef } from "@angular/cdk/dialog";
import { Observable } from "rxjs";
import { PollItem } from "./poll";
import { MoviePollItemData, TMDbMovie } from "./tmdb";
import { User } from "./user";
import { EventEmitter } from "@angular/core";

export interface MovieDialogData {
    addMovie?: boolean;
    movie?: TMDbMovie | MoviePollItemData;
    editable: boolean;
    description?: string;
    pollItem?: PollItem;
    movieId: number;
    isVoteable?: boolean;
    isReactable?: boolean;
    movieReactions$?: Observable<any[]>;
    hasVoted?: boolean;
    voteCount?: number;
    voters?: User[];
    currentMovieOpen?: boolean;
    parentStr?: string;
    showRecentPollAdder?: boolean;
    filterMovies?: number[];
    previouslyOpenedDialog?: DialogRef;
    parent?: boolean;
    useNavigation?: boolean;
    outputs?: {
      addMovie?: EventEmitter<TMDbMovie>;
    };
    locked?: boolean;
    landing?: boolean;
    parentMovieId?: number;
    parentScrollPosition?: [number, number];
}