import {
  Component,
  OnInit,
  Input,
  ChangeDetectionStrategy,
  Output,
  EventEmitter,
  OnDestroy,
} from "@angular/core";
import { PollItem } from "../../model/poll";
import { Movie } from "../../model/tmdb";
import { TMDbService } from "../tmdb.service";
import { BehaviorSubject, NEVER, Observable } from "rxjs";
import { UserService } from "../user.service";
import {
  delay,
  filter,
  map,
  switchMap,
  tap,
  distinctUntilChanged,
} from "rxjs/operators";
import { isEqual } from "lodash";

interface Reaction {
  label: string;
  tooltip: string;
  count: number;
  reacted: boolean;
}

interface MovieReaction extends Reaction {
  color: string;
}

@Component({
  selector: "movie-poll-item",
  templateUrl: "./movie-poll-item.component.html",
  styleUrls: ["./movie-poll-item.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoviePollItemComponent implements OnInit, OnDestroy {
  @Input() set pollItem(pollItem: PollItem) {
    if (!isEqual(pollItem, this.pollItem$.getValue())) {
      this.pollItem$.next(pollItem);
    }
  }
  @Input() hasVoted: boolean = false;
  @Input() showCreator: boolean = false;

  @Input() removable: boolean = false;
  @Input() voteable: boolean = false;
  @Input() progressBarWidth: number; // %
  @Input() editable: boolean = false;
  @Input() creating = false;

  @Output() onRemoved = new EventEmitter<PollItem>();
  @Output() optionClicked = new EventEmitter<PollItem>();
  @Output() reaction = new EventEmitter<{
    pollItem: PollItem;
    reaction: string;
    removeReactions: string[];
  }>();
  @Output() setDescription = new EventEmitter<{
    pollItem: PollItem;
    description: string;
  }>();
  pollItem$ = new BehaviorSubject<PollItem | undefined>(undefined);
  movie$: Observable<Readonly<Movie>>;
  editPollItem$ = new BehaviorSubject<string | undefined>(undefined);
  editReactionsPollItem$ = new BehaviorSubject<string | undefined>(undefined);
  movieReactionsOpened$ = new BehaviorSubject<boolean>(false);
  editDescription$ = new BehaviorSubject<string | undefined>(undefined);
  shortened = true;

  availableReactions$: Observable<string[]>;
  hasReactions$: Observable<boolean>;
  description$: Observable<string>;
  defaultReactions$: Observable<Reaction[]>;
  movieReactions$: Observable<MovieReaction[]>;

  reactionClickDisabled$ = new BehaviorSubject<boolean>(true);

  readonly defaultReactions: string[] = [
    "🔥",
    "😂",
    "💩",
    "🙈",
    "🎉",
    "😍",
    "😅",
    "🤦",
  ];
  readonly movieReactions: { label: string; tooltip: string; color: string }[] =
    [
      { label: "fa-eye", tooltip: "Seen", color: "#FF8500" },
      { label: "fa-heart", tooltip: "Favorite", color: "#6cd577" },
      { label: "fa-ban", tooltip: "Not this", color: "red" },
    ];

  private subs = NEVER.subscribe();

  constructor(
    public movieService: TMDbService,
    private userService: UserService
  ) {
    this.availableReactions$ = this.pollItem$.pipe(
      filter((pollItem) => pollItem !== undefined),
      map((pollItem) =>
        this.defaultReactions.filter(
          (reaction) =>
            !(pollItem.reactions || [])
              .find((r) => r.label === reaction)
              ?.users.some((user) => this.userService.isCurrentUser(user))
        )
      )
    );

    this.hasReactions$ = this.pollItem$.pipe(
      filter((pollItem) => pollItem !== undefined),
      map((pollItem) =>
        (pollItem.reactions || [])
          .filter((r) => this.defaultReactions.includes(r.label))
          .some((r) => r.users.length > 0)
      )
    );

    this.description$ = this.pollItem$.pipe(
      filter((pollItem) => pollItem !== undefined),
      map((pollItem) => pollItem.description),
      distinctUntilChanged(),
      map((description) => this.urlify(description || ""))
    );

    this.defaultReactions$ = this.pollItem$.pipe(
      filter((pollItem) => pollItem !== undefined),
      map((pollItem) => pollItem.reactions),
      distinctUntilChanged(isEqual),
      map((reactions) =>
        this.defaultReactions.map((reaction) => ({
          label: reaction,
          tooltip: this.getReactionText(reactions, reaction),
          count: this.getReactedCount(reactions, reaction) || undefined,
          reacted: this.userHasReacted(reactions, reaction),
        }))
      )
    );

    this.movieReactions$ = this.pollItem$.pipe(
      filter((pollItem) => pollItem !== undefined),
      map((pollItem) => pollItem.reactions),
      distinctUntilChanged(isEqual),
      map((reactions) =>
        this.movieReactions.map((reaction) => {
          const count = this.getReactedCount(reactions, reaction.label);
          return {
            ...reaction,
            tooltip:
              count > 0
                ? reaction.tooltip +
                  ": " +
                  this.getReactionText(reactions, reaction.label)
                : undefined,
            count,
            reacted: this.userHasReacted(reactions, reaction.label),
          };
        })
      )
    );

    this.subs.add(
      this.editReactionsPollItem$
        .pipe(
          distinctUntilChanged(),
          tap(() => this.reactionClickDisabled$.next(true)),
          delay(0.7)
        )
        .subscribe(() => this.reactionClickDisabled$.next(false))
    );
  }

  ngOnInit() {
    this.movie$ = this.pollItem$.pipe(
      filter((pollItem) => pollItem !== undefined),
      switchMap((pollItem) =>
        this.movieService
          .loadMovie(pollItem.movieId)
          .pipe(filter((movie) => !!movie))
      )
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  getMetaBgColor(rating: string) {
    const ratingNumber = parseInt(rating);
    if (ratingNumber >= 61) {
      return "green";
    } else if (ratingNumber >= 40 && ratingNumber <= 60) {
      return "yellow";
    } else {
      return "red";
    }
  }

  clicked(pollItem: PollItem): void {
    this.optionClicked.emit(pollItem);
  }

  remove(pollItem: PollItem): void {
    this.onRemoved.emit(pollItem);
  }

  openImdb(imdbId: string): void {
    window.open("https://www.imdb.com/title/" + imdbId, "_blank");
  }

  openTmdb(tmdbId: any): void {
    window.open("https://www.themoviedb.org/movie/" + tmdbId, "_blank");
  }

  clickReaction(pollItem: PollItem, reaction: string) {
    if (this.reactionClickDisabled$.getValue() === true) {
      return;
    }
    const removeReactions: string[] = (pollItem.reactions || [])
      .filter((r) => r.users.some((u) => this.userService.isCurrentUser(u)))
      .filter((r) => this.movieReactions.map((x) => x.label).includes(r.label))
      .map((r) => r.label);
    this.reaction.emit({ pollItem, reaction, removeReactions });
  }

  descriptionButtonClick(pollItem: PollItem) {
    const id = this.editPollItem$.getValue();

    if (id) {
      this.changeDescription(pollItem, this.editDescription$.getValue());
      this.editDescription$.next(undefined);
      this.editPollItem$.next(undefined);
    } else {
      this.editPollItem$.next(pollItem.id);
    }
  }

  changeDescription(pollItem: PollItem, description: string) {
    this.setDescription.emit({ pollItem, description });
  }

  private urlify(text) {
    var urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(
      urlRegex,
      (url) =>
        `<span class="with-launch-icon"><a class="outside-link" target="_blank" href="${url}">${url}</a></span>`
    );
  }

  private getReactedCount(
    reactions: PollItem["reactions"],
    reaction: string
  ): number {
    return (reactions?.find((r) => r.label === reaction)?.users || []).length;
  }

  private userHasReacted(
    reactions: PollItem["reactions"],
    reaction: string
  ): boolean {
    return (reactions || [])
      .find((r) => r.label === reaction)
      ?.users.some((user) => this.userService.isCurrentUser(user));
  }

  private getReactionText(
    reactions: PollItem["reactions"],
    reaction: string
  ): string {
    return `${(reactions?.find((r) => r.label === reaction)?.users || [])
      .map((u) => u.name)
      .join(", ")}`;
  }
}
