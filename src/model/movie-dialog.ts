import { DialogRef } from "@angular/cdk/dialog";
import { Observable } from "rxjs";
import { PollItem } from "./poll";
import { MoviePollItemData, TMDbMovie } from "./tmdb";
import { User } from "./user";
import { EventEmitter } from "@angular/core";

export interface Reaction {
    label: string;
    tooltip: string;
    count: number;
    reacted: boolean;
}

export interface MovieReaction extends Reaction {
    color: string;
}

export interface MovieDialogData {
    addMovie?: boolean;
    movie?: TMDbMovie | MoviePollItemData;
    editable: boolean;
    description?: string;
    pollItem?: PollItem;
    movieId: number;
    isVoteable?: boolean;
    // When true, isVoteable's plain vote/unvote button is suppressed — ranked
    // point-budget voting is handled by <point-vote-stepper> on the card instead,
    // and routing the dialog's button through PollItemService.vote() would bypass
    // the point budget entirely (can add a free vote or erase allocated points).
    pointVoting?: boolean;
    isReactable?: boolean;
    movieReactions$?: Observable<MovieReaction[]>;
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