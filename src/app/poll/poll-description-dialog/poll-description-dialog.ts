import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  inject,
  OnInit,
  ViewChild,
  DOCUMENT
} from "@angular/core";
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from "@angular/material/bottom-sheet";
import { MatIconModule } from "@angular/material/icon";
import { HyphenatePipe } from "../../hyphen.pipe";
import { MarkdownPipe } from "ngx-markdown";
import { AsyncPipe } from "@angular/common";
import { MatButton } from "@angular/material/button";
import { GeminiService } from "../../gemini.service";
import { BehaviorSubject, interval, takeWhile, timer } from "rxjs";
import { fadeInOut, smoothHeight } from "../../shared/animations";
import { PollItem, PollSuggestion } from "../../../model/poll";
import { PollItemService } from "../../poll-item.service";
import { SmoothHeightAnimDirective } from "../../../app/smooth-height.directive";
import { SEEN } from "../../movie-poll-item/movie-helpers";

export interface PollDescriptionData {
  description: string;
  pollId: string;
  pollName: string;
  pollItems: PollItem[];
  suggestions?: PollSuggestion[];
  simple: boolean;
  generated?: boolean;
}

@Component({
    selector: "poll-description-dialog",
    templateUrl: "poll-description-dialog.html",
    styleUrls: ["./poll-description-dialog.scss"],
    imports: [
        MatIconModule,
        HyphenatePipe,
        MarkdownPipe,
        AsyncPipe,
        MatButton,
        SmoothHeightAnimDirective,
    ],
    animations: [fadeInOut, smoothHeight]
})
export class PollDescriptionSheet implements OnInit, AfterViewInit {
  @ViewChild("container") containerElement: ElementRef;
  @ViewChild("bottomElement") bottomElement: ElementRef;
  private scrollContainer = null;

  private bottomSheetRef =
    inject<MatBottomSheetRef<PollDescriptionSheet>>(MatBottomSheetRef);

  constructor(
    @Inject(MAT_BOTTOM_SHEET_DATA) public data: PollDescriptionData,
    private geminiService: GeminiService,
    private pollItemService: PollItemService,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngAfterViewInit() {
    this.scrollContainer = document.getElementsByClassName(
      "mat-bottom-sheet-container"
    )[0];
  }

  loadingResponse$ = new BehaviorSubject<boolean>(false);
  showFinalSuggestion$ = new BehaviorSubject<boolean>(false);
  suggestedMovies: string[] = [];
  userPromptOptions = [
    "I'm still undecided. Please help me to pick?",
    "I'm still torn between the options. Any ideas?",
    "I'm still on the fence. Any help?",
    "I'm still wavering. Please help me choose?",
    "I'm still conflicted. What do you suggest?",
    "I'm still puzzled. Any help?",
    "I'm still perplexed. What would you choose?",
    "I'm still at a loss. Can you help me?",
    "I'm still in a dilemma. Please help me to pick?",
    "I'm still in a quandary. Can you help me?",
    "I'm still having trouble deciding. What would you choose?",
    "I'm still struggling to choose. Can you help?",
    "I'm still not sure what to do. Which I should pick?",
    "I'm still not certain about my choice. What would you choose?",
    "I'm still feeling uncertain. Which should I choose?",
    "I'm still feeling unsure. Please help me choose?",
    "I'm still feeling hesitant. Can you help me?",
    "I'm still feeling doubtful. What would you choose?",
    "I'm still feeling confused. Which would you pick?",
    "I'm still feeling overwhelmed. Can you help?",
  ];
  suggestions$ = new BehaviorSubject<PollSuggestion[]>([
    {
      order: 0,
      prompt: "I can't choose. Which movie I should pick?",
      suggestion: undefined,
    },
  ]);

  ngOnInit() {
    if (this.data.suggestions) {
      this.suggestions$.next(this.data.suggestions);
      this.scrollToBottom();
    }
  }

  close() {
    this.bottomSheetRef.dismiss(this.suggestions$.getValue());
  }

  async suggestMovie() {
    this.loadingResponse$.next(true);
    const filteredPollItems = this.data.pollItems
      .filter((pollItem) => !this.suggestedMovies.includes(pollItem.name))
      .filter((pollItem) =>
        !pollItem.reactions?.some((r) => r.label === SEEN && r.users.length > 0)
      )
      .filter((pollItem) => pollItem.visible !== false);
    const filteredMovies = filteredPollItems.map((pollItem) => pollItem.name);

    // Pick random movie
    const selectedPollItem =
      filteredPollItems[Math.floor(Math.random() * filteredPollItems.length)];
    let suggestion: string;

    if (selectedPollItem.suggestionAI) {
      suggestion = selectedPollItem.suggestionAI.text;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } else {
      suggestion = await this.geminiService.generateVoteSuggestionDescription(
        filteredMovies,
        selectedPollItem.name
      );
    }

    if (selectedPollItem) {
      this.suggestedMovies.push(selectedPollItem.name);
      const suggestions = this.suggestions$.getValue();
      suggestions[suggestions.length - 1].suggestion = suggestion;

      // Save suggestion to poll item
      this.pollItemService.saveSuggestion(
        this.data.pollId,
        selectedPollItem,
        suggestion,
        this.suggestions$.getValue().length - 1
      );

      this.suggestions$.next(suggestions);
      this.loadingResponse$.next(false);

      const freq = 10;
      const duration = 2000;

      // Animate scroll to bottom
      interval(freq)
        .pipe(takeWhile((value) => value * freq < duration))
        .subscribe(() => this.scrollToBottom(false));

      if (filteredPollItems.length > suggestions.length) {
        setTimeout(() => {
          suggestions.push({
            prompt: this.pickRandomSuggestion(),
            suggestion: undefined,
            order: suggestions.length,
          });
          this.suggestions$.next(suggestions);

          setTimeout(() => {
            this.scrollToBottom();
          });
        }, duration + 500);
      } else {
        setTimeout(() => {
          this.showFinalSuggestion$.next(true);
          setTimeout(() => this.scrollToBottom(), 50);
        }, duration + 1000);
      }
    }
  }

  scrollToBottom(smooth: boolean = true): void {
    this.bottomElement.nativeElement.scrollIntoView({
      behavior: smooth ? "smooth" : "instant",
      block: "start",
      inline: "end",
    });
  }

  private pickRandomSuggestion(): string {
    return this.userPromptOptions[
      Math.floor(Math.random() * this.userPromptOptions.length)
    ];
  }
}
