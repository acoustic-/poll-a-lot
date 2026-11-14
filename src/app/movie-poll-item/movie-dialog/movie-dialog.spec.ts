import { ChangeDetectorRef, EventEmitter } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { Analytics } from '@angular/fire/analytics';
import { BehaviorSubject, of } from 'rxjs';

import { MovieDialog } from './movie-dialog';
import { TMDbService } from '../../tmdb.service';
import { PollItemService } from '../../poll-item.service';
import { UserService } from '../../user.service';
import { GeminiService } from '../../gemini.service';
import { AwardsService } from '../../awards.service';
import { UserIdentityService } from '../../user-identity.service';
import { ImageColorService } from '../../shared/image-color.service';
import { MovieDialogData } from '../../../model/movie-dialog';
import { PollItem } from '../../../model/poll';

/**
 * Class-level spec: MovieDialog is its own provider and all 15 of its injected
 * dependencies are stubbed, so no template (967 lines, backdrop/awards/Gemini
 * machinery) is rendered. Only MAT_DIALOG_DATA and MatDialogRef matter to the
 * behaviour under test.
 */
describe('MovieDialog', () => {
  let dialogRef: { close: jasmine.Spy };
  let calls: string[];

  const pollItem: PollItem = {
    id: 'item-1',
    pollId: 'poll-1',
    name: 'Alien',
    created: '',
    voters: [],
    order: 0,
    movieId: 348,
  };

  function create(data: Partial<MovieDialogData>): MovieDialog {
    calls = [];
    dialogRef = { close: jasmine.createSpy('close').and.callFake(() => calls.push('close')) };

    TestBed.configureTestingModule({
      providers: [
        MovieDialog,
        { provide: MAT_DIALOG_DATA, useValue: { editable: false, movieId: 0, useNavigation: false, ...data } },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MatDialog, useValue: {} },
        { provide: TMDbService, useValue: {} },
        { provide: PollItemService, useValue: {} },
        {
          provide: UserService,
          useValue: {
            selectedRegion$: new BehaviorSubject('FI'),
            getUserData$: () => of(undefined),
            user$: of(undefined),
          },
        },
        { provide: GeminiService, useValue: {} },
        { provide: AwardsService, useValue: {} },
        { provide: ChangeDetectorRef, useValue: { detectChanges: () => undefined } },
        { provide: MatBottomSheet, useValue: {} },
        { provide: MatSnackBar, useValue: {} },
        { provide: Analytics, useValue: {} },
        { provide: Router, useValue: {} },
        { provide: ActivatedRoute, useValue: {} },
        { provide: UserIdentityService, useValue: { resolve$: () => of(new Map()) } },
        { provide: ImageColorService, useValue: {} },
      ],
    });
    return TestBed.inject(MovieDialog);
  }

  describe('clickRemoveMovie()', () => {
    it('emits removeMovie with the item and leaves the dialog open for the caller to confirm', () => {
      const dialog = create({ canRemove: true, pollItem });
      dialog.removeMovie.subscribe(() => calls.push('emit'));
      const emitted: PollItem[] = [];
      dialog.removeMovie.subscribe((item) => emitted.push(item));

      dialog.clickRemoveMovie();

      // Cancelling the confirmation must leave the user in the dialog.
      expect(calls).toEqual(['emit']);
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(emitted.length).toBe(1);
      expect(emitted[0]).toBe(pollItem);
    });

    [{ canRemove: false }, { canRemove: undefined }].forEach((perm) => {
      it(`does nothing when canRemove is ${perm.canRemove}`, () => {
        const dialog = create({ ...perm, pollItem });
        const emit = spyOn(dialog.removeMovie, 'emit');

        dialog.clickRemoveMovie();

        expect(emit).not.toHaveBeenCalled();
        expect(dialogRef.close).not.toHaveBeenCalled();
      });
    });

    it('does nothing when canRemove is true but there is no pollItem', () => {
      const dialog = create({ canRemove: true, pollItem: undefined });
      const emit = spyOn(dialog.removeMovie, 'emit');

      dialog.clickRemoveMovie();

      expect(emit).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('ngOnInit() output forwarding', () => {
    it('adopts the caller\'s removeMovie emitter when data.outputs supplies one', () => {
      // This is what lets a stacked dialog reach the original opener.
      const callers = new EventEmitter<PollItem>();
      const dialog = create({ outputs: { removeMovie: callers } });

      dialog.ngOnInit();

      expect(dialog.removeMovie).toBe(callers);
    });

    it('keeps its own removeMovie emitter when data.outputs omits it', () => {
      const dialog = create({ outputs: { addMovie: new EventEmitter() } });
      const own = dialog.removeMovie;

      dialog.ngOnInit();

      expect(dialog.removeMovie).toBe(own);
      expect(() => dialog.removeMovie.emit(pollItem)).not.toThrow();
    });

    it('keeps its own removeMovie emitter when there is no data.outputs at all', () => {
      const dialog = create({});
      const own = dialog.removeMovie;

      dialog.ngOnInit();

      expect(dialog.removeMovie).toBe(own);
    });

    it('adopts the supplied addMovie emitter (assigned unconditionally)', () => {
      const adds = new EventEmitter<never>();
      const dialog = create({ outputs: { addMovie: adds } });

      dialog.ngOnInit();

      expect(dialog.addMovie).toBe(adds);
    });
  });

  describe('clickAddMovie()', () => {
    it('emits addMovie, then closes', () => {
      const dialog = create({});
      dialog.addMovie.subscribe(() => calls.push('emit'));

      dialog.clickAddMovie({ id: 1 } as never);

      expect(calls).toEqual(['emit', 'close']);
    });
  });
});
