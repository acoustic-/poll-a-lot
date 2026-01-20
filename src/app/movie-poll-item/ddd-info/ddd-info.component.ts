import { Component, Input, OnInit, Output } from '@angular/core';
import { BehaviorSubject, distinctUntilChanged, filter, map, Observable, switchMap, tap } from 'rxjs';
import { AsyncPipe, CommonModule } from '@angular/common';
import { isDefined } from '../../helpers';
import { DoesTheDogDieService } from '../../does-the-dog-die.service';
import { MatTooltip } from "@angular/material/tooltip";
import { MatIcon } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

export interface DddTrigger {
  id: number;
  name: string;
  question: string;
  verdict: 'yes' | 'no' | 'unknown';
  category: string;
  isSensitive: boolean;
  isSpoiler: boolean;
  yesVotes: number;
  noVotes: number;
  comments: string[];
}

@Component({
  selector: 'does-the-dog-die-info',
  imports: [
    CommonModule,
    AsyncPipe,
    MatTooltip,
    MatIcon,
    MatButtonModule
],
  templateUrl: './ddd-info.component.html',
  styleUrl: './ddd-info.component.scss',
  standalone: true
})
export class DddInfoComponent implements OnInit {

  @Input() set imdbId(input: string) {
    this.imdbId$.next(input);
  }

  imdbId$ = new BehaviorSubject<string | undefined>(undefined);
  triggers$: Observable<DddTrigger[]>;
  topTriggerCategories$ = new BehaviorSubject<string[]>([]);
  triggerTitlesNoSppoilers$ = new BehaviorSubject<string[]>([]);
  showTriggersCount$ = new BehaviorSubject<number>(5);
  showTriggerWarnings$ = new BehaviorSubject<boolean>(false);
  showSpoilers$ = new BehaviorSubject<Set<number>>(new Set<number>);

  constructor(
    private dddService: DoesTheDogDieService
  ) {

  }

  ngOnInit(): void {
    this.triggers$ = this.imdbId$.pipe(
      filter(isDefined), 
      switchMap((imdbId) => this.dddService.loadDoesTheDogDieInfo(imdbId)),
      map(response => response.topicItemStats.map(t => ({
        id: t.topic.id,
        question: t.topic.doesName,
        name: t.topic.name,
        verdict:
          t.yesSum > t.noSum ? 'yes' :
          t.noSum > t.yesSum ? 'no' :
          'unknown',
        category: t.topic.TopicCategory.name,
        isSensitive: t.topic.isSensitive,
        isSpoiler: t.topic.isSpoiler,
        yesVotes: t.yesSum,
        noVotes: t.noSum,
        comments: t.comments?.map(c => c.comment) ?? []
      }))),
      map((triggers: DddTrigger[]) => triggers.filter(t => t.verdict === 'yes')
        .sort((a, b) => b.yesVotes - a.yesVotes)
      ),
      tap((triggers) => {
        const categories = new Set<string>();
        const noSpoilers = new Set<string>();

        triggers.forEach(trigger => {
          categories.add(trigger.category);
          if (!trigger.isSpoiler) {
            noSpoilers.add(trigger.name);
          }
        });
        this.topTriggerCategories$.next(Array.from(categories.keys()));
        this.triggerTitlesNoSppoilers$.next(Array.from(noSpoilers.keys()));
      }),
      distinctUntilChanged()
    );
  }

  showSpoiler(triggerId: number) {
    const spoilers = this.showSpoilers$.getValue();
    spoilers.add(triggerId);
    this.showSpoilers$.next(spoilers);
  }
}
