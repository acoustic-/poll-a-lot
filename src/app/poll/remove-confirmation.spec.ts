import { removeConfirmationFor } from './remove-confirmation';

describe('removeConfirmationFor', () => {
  const bob = { id: 'u2', name: 'Bob' };
  const me = { id: 'u1', name: 'Me' };
  const localBob = { name: 'Bob', localUserId: 'l2' };

  it('asks with a dialog naming the creator when someone else added the item', () => {
    const result = removeConfirmationFor({ name: 'Alien', creator: bob }, me);
    expect(result.kind).toBe('dialog');
    if (result.kind === 'dialog') {
      expect(result.title).toBe('Remove Alien?');
      expect(result.message).toContain("'Bob'");
    }
  });

  it('uses a snackbar for the current user\'s own item', () => {
    const result = removeConfirmationFor({ name: 'Alien', creator: bob }, bob);
    expect(result).toEqual({ kind: 'snackbar', message: 'Do you want to remove Alien?' });
  });

  it('uses a snackbar for a legacy item with no creator', () => {
    expect(removeConfirmationFor({ name: 'Alien' }, me).kind).toBe('snackbar');
  });

  it('uses a snackbar for a legacy item and an anonymous viewer', () => {
    expect(removeConfirmationFor({ name: 'Alien' }, undefined).kind).toBe('snackbar');
  });

  it('treats a creator with an empty id as unattributed', () => {
    expect(removeConfirmationFor({ name: 'Alien', creator: { id: '', name: 'X' } }, me).kind).toBe('snackbar');
  });

  it('takes the cautious dialog route for an anonymous viewer against a creator', () => {
    expect(removeConfirmationFor({ name: 'Alien', creator: bob }, undefined).kind).toBe('dialog');
  });

  it('falls back to "the chosen option" when the item has no name (both branches)', () => {
    const dialog = removeConfirmationFor({ name: '', creator: bob }, me);
    const snack = removeConfirmationFor({ name: '' }, me);
    expect(dialog.kind === 'dialog' && dialog.title).toBe('Remove the chosen option?');
    expect(snack.kind === 'snackbar' && snack.message).toBe('Do you want to remove the chosen option?');
  });

  it('asks with a dialog when a local sign-in user\'s item is removed by someone else', () => {
    expect(removeConfirmationFor({ name: 'Alien', creator: localBob }, me).kind).toBe('dialog');
    expect(removeConfirmationFor({ name: 'Alien', creator: localBob }, undefined).kind).toBe('dialog');
  });

  it('uses a snackbar for a local sign-in user\'s own item', () => {
    expect(removeConfirmationFor({ name: 'Alien', creator: localBob }, { ...localBob }).kind).toBe('snackbar');
  });

  it('treats a name-only creator as unattributed', () => {
    expect(removeConfirmationFor({ name: 'Alien', creator: { name: 'Sam' } }, me).kind).toBe('snackbar');
  });
});
