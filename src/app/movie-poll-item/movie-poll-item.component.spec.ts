import { EventEmitter } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BehaviorSubject, Subject } from 'rxjs';

import { MoviePollItemComponent } from './movie-poll-item.component';
import { TMDbService } from '../tmdb.service';
import { MovieDialogService } from '../movie-dialog.service';
import { UserService } from '../user.service';
import { AwardsService } from '../awards.service';
import { PollItem } from '../../model/poll';
import { MovieDialogData } from '../../model/movie-dialog';
import { Movie, MoviePollItemData, TMDbMovie } from '../../model/tmdb';

/**
 * Class-level spec (no template is rendered), same pattern as
 * series-poll-item.component.spec.ts: the component is its own provider and the
 * five services it injects are stubbed.
 */
describe('MoviePollItemComponent', () => {
  let component: MoviePollItemComponent;
  let dialogData: MovieDialogData[];
  let fakeDialog: FakeMovieDialogRef;
  let user$: BehaviorSubject<unknown>;

  const pollItem: PollItem = {
    id: 'item-1',
    pollId: 'poll-1',
    name: 'Alien',
    created: '',
    voters: [],
    order: 0,
    movieId: 348,
  };
  const movieData = { id: 348 } as unknown as MoviePollItemData;

  /** Stand-in for MatDialogRef<MovieDialog>. `afterClosed` must be ONE shared
   *  stream (as in Material), not a fresh `of()` per call — the component's
   *  takeUntil(afterClosed()) would otherwise tear every subscription down the
   *  moment it was made. */
  class FakeMovieDialogRef {
    private closed$ = new Subject<void>();
    componentInstance = {
      data: {} as MovieDialogData,
      voteClicked: new EventEmitter<string>(),
      reactionClicked: new EventEmitter<string>(),
      updateDescription: new EventEmitter<string>(),
      addMovie: new EventEmitter<TMDbMovie | undefined>(),
      removeMovie: new EventEmitter<PollItem>(),
    };
    afterClosed() {
      return this.closed$.asObservable();
    }
    close() {
      this.closed$.next();
      this.closed$.complete();
    }
  }

  beforeEach(() => {
    dialogData = [];
    fakeDialog = new FakeMovieDialogRef();
    user$ = new BehaviorSubject<unknown>(undefined);

    TestBed.configureTestingModule({
      providers: [
        MoviePollItemComponent,
        { provide: TMDbService, useValue: {} },
        {
          provide: MovieDialogService,
          useValue: {
            openMovie: (data: MovieDialogData) => {
              dialogData.push(data);
              fakeDialog.componentInstance.data = data;
              return fakeDialog;
            },
          },
        },
        {
          provide: UserService,
          useValue: {
            user$,
            isCurrentUser: () => false,
            // Same rule as the real UserService.usersAreEqual.
            usersAreEqual: (
              a?: { id?: string; name?: string; localUserId?: string },
              b?: { id?: string; name?: string; localUserId?: string }
            ) => {
              if (!a || !b) return false;
              if (a.id && b.id) return a.id === b.id;
              return a.name === b.name && a.localUserId === b.localUserId;
            },
          },
        },
        { provide: MatSnackBar, useValue: {} },
        { provide: AwardsService, useValue: {} },
      ],
    });
    component = TestBed.inject(MoviePollItemComponent);
    component.pollItem = pollItem;
  });

  afterEach(() => component.ngOnDestroy());

  async function openDialog(): Promise<MovieDialogData> {
    await component.showMovie(movieData);
    expect(dialogData.length).toBe(1);
    return dialogData[0];
  }

  describe('showMovie() → canRemove', () => {
    // `editable` is "I added this item"; `isPollOwner` is "I own the poll".
    const cases: { editable: boolean; isPollOwner: boolean; expected: boolean }[] = [
      { editable: true, isPollOwner: true, expected: true },
      { editable: false, isPollOwner: true, expected: true },
      { editable: true, isPollOwner: false, expected: true },
      { editable: false, isPollOwner: false, expected: false },
    ];

    cases.forEach(({ editable, isPollOwner, expected }) => {
      it(`editable=${editable}, isPollOwner=${isPollOwner} → ${expected}`, async () => {
        component.editable = editable;
        component.isPollOwner = isPollOwner;
        const data = await openDialog();
        expect(data.canRemove).toBe(expected);
      });
    });
  });

  it('passes `locked` through to the dialog data', async () => {
    component.locked = true;
    expect((await openDialog()).locked).toBe(true);
  });

  it('does not clear `locked` for an unlocked poll', async () => {
    component.locked = false;
    expect((await openDialog()).locked).toBe(false);
  });

  it('hands the dialog the card\'s own poll item', async () => {
    const data = await openDialog();
    expect(data.pollItem).toBe(component.pollItem);
    expect(data.movieId).toBe(348);
  });

  describe('dialog output forwarding', () => {
    it('re-emits the dialog\'s removeMovie on the card\'s `removed` output', async () => {
      const removed: PollItem[] = [];
      component.removed.subscribe((item) => removed.push(item));
      await openDialog();

      fakeDialog.componentInstance.removeMovie.emit(pollItem);

      expect(removed.length).toBe(1);
      expect(removed[0]).toBe(pollItem);
    });

    it('forwards voteClicked → optionClicked with the card\'s poll item', async () => {
      const clicked: PollItem[] = [];
      component.optionClicked.subscribe((item) => clicked.push(item));
      await openDialog();

      fakeDialog.componentInstance.voteClicked.emit('click');

      expect(clicked.length).toBe(1);
      expect(clicked[0]).toBe(pollItem);
    });

    it('forwards reactionClicked → reaction (once reactions are enabled)', async () => {
      const reactions: string[] = [];
      component.reaction.subscribe((r) => reactions.push(r));
      component.reactionClickDisabled$.next(false);
      await openDialog();

      fakeDialog.componentInstance.reactionClicked.emit('seen');

      expect(reactions).toEqual(['seen']);
    });

    it('forwards updateDescription → setDescription', async () => {
      const descriptions: string[] = [];
      component.setDescription.subscribe((d) => descriptions.push(d));
      await openDialog();

      fakeDialog.componentInstance.updateDescription.emit('new text');

      expect(descriptions).toEqual(['new text']);
    });

    it('forwards addMovie → addMovie', async () => {
      const added: (TMDbMovie | Movie)[] = [];
      component.addMovie.subscribe((m) => added.push(m));
      await openDialog();
      const movie = { id: 1 } as unknown as TMDbMovie;

      fakeDialog.componentInstance.addMovie.emit(movie);

      expect(added.length).toBe(1);
      expect(added[0]).toBe(movie);
    });

    it('tears every subscription down once the dialog closes', async () => {
      const seen: string[] = [];
      component.removed.subscribe(() => seen.push('removed'));
      component.optionClicked.subscribe(() => seen.push('optionClicked'));
      component.reaction.subscribe(() => seen.push('reaction'));
      component.setDescription.subscribe(() => seen.push('setDescription'));
      component.addMovie.subscribe(() => seen.push('addMovie'));
      component.reactionClickDisabled$.next(false);
      await openDialog();

      fakeDialog.close();
      const instance = fakeDialog.componentInstance;
      instance.removeMovie.emit(pollItem);
      instance.voteClicked.emit('click');
      instance.reactionClicked.emit('seen');
      instance.updateDescription.emit('x');
      instance.addMovie.emit({ id: 1 } as unknown as TMDbMovie);

      expect(seen).toEqual([]);
    });

    it('forgets the open dialog once it closes', async () => {
      await openDialog();
      expect(component.openMovie).toBe(fakeDialog as unknown as typeof component.openMovie);
      fakeDialog.close();
      expect(component.openMovie).toBeUndefined();
    });
  });

  describe('pollItemOwner$ (drives the card menu)', () => {
    let isOwner: boolean | undefined;

    function ownerFor(creator: PollItem['creator'], user: unknown): boolean | undefined {
      component.pollItem = { ...pollItem, creator };
      user$.next(user);
      component.pollItemOwner$.subscribe((v) => (isOwner = v)).unsubscribe();
      return isOwner;
    }

    it('recognises a Google-signed-in creator by id', () => {
      expect(ownerFor({ id: 'g1', name: 'Ann' }, { id: 'g1', name: 'Ann' })).toBe(true);
    });

    it('recognises a local sign-in creator (no id, name + localUserId)', () => {
      const local = { name: 'Bob', localUserId: 'uuid-1' };
      expect(ownerFor(local, { ...local })).toBe(true);
    });

    it('rejects a different local user with the same name', () => {
      expect(
        ownerFor({ name: 'Bob', localUserId: 'uuid-1' }, { name: 'Bob', localUserId: 'uuid-2' })
      ).toBe(false);
    });

    it('rejects someone else, a legacy item with no creator, and no user', () => {
      expect(ownerFor({ id: 'g1', name: 'Ann' }, { id: 'g2', name: 'Cy' })).toBe(false);
      expect(ownerFor(undefined, { id: 'g2', name: 'Cy' })).toBe(false);
      expect(ownerFor({ id: 'g1', name: 'Ann' }, undefined)).toBe(false);
    });
  });

  it('remove() emits `removed` with the given poll item', () => {
    const removed: PollItem[] = [];
    component.removed.subscribe((item) => removed.push(item));

    component.remove(pollItem);

    expect(removed.length).toBe(1);
    expect(removed[0]).toBe(pollItem);
  });
});
