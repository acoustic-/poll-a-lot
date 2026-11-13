import { removeConfirmationFor } from './remove-confirmation';

describe('removeConfirmationFor', () => {
  const bob = { id: 'u2', name: 'Bob' };

  it('asks with a dialog naming the creator when someone else added the item', () => {
    const result = removeConfirmationFor({ name: 'Alien', creator: bob }, 'u1');
    expect(result.kind).toBe('dialog');
    if (result.kind === 'dialog') {
      expect(result.title).toBe('Remove Alien?');
      expect(result.message).toContain("'Bob'");
    }
  });

  it('uses a snackbar for the current user\'s own item', () => {
    const result = removeConfirmationFor({ name: 'Alien', creator: bob }, 'u2');
    expect(result).toEqual({ kind: 'snackbar', message: 'Do you want to remove Alien?' });
  });

  it('uses a snackbar for a legacy item with no creator', () => {
    expect(removeConfirmationFor({ name: 'Alien' }, 'u1').kind).toBe('snackbar');
  });

  it('uses a snackbar for a legacy item and an anonymous viewer', () => {
    expect(removeConfirmationFor({ name: 'Alien' }, undefined).kind).toBe('snackbar');
  });

  it('treats a creator with an empty id as unattributed', () => {
    expect(removeConfirmationFor({ name: 'Alien', creator: { id: '', name: 'X' } }, 'u1').kind).toBe('snackbar');
  });

  it('takes the cautious dialog route for an anonymous viewer against a creator', () => {
    expect(removeConfirmationFor({ name: 'Alien', creator: bob }, undefined).kind).toBe('dialog');
  });

  it('falls back to "the chosen option" when the item has no name (both branches)', () => {
    const dialog = removeConfirmationFor({ name: '', creator: bob }, 'u1');
    const snack = removeConfirmationFor({ name: '' }, 'u1');
    expect(dialog.kind === 'dialog' && dialog.title).toBe('Remove the chosen option?');
    expect(snack.kind === 'snackbar' && snack.message).toBe('Do you want to remove the chosen option?');
  });
});
