import { VotersPipe } from './voters.pipe';
import { User } from '../model/user';

describe('VotersPipe', () => {
  let pipe: VotersPipe;

  beforeEach(() => {
    pipe = new VotersPipe();
  });

  it('shows an encouragement message for zero voters by default', () => {
    expect(pipe.transform([])).toBe('Be the first voter! ✨');
  });

  it('suppresses the encouragement message when hideInfo is true', () => {
    expect(pipe.transform([], undefined, true)).toBe(' -');
  });

  it('comma-joins voter names', () => {
    const voters: User[] = [{ name: 'Alice' }, { name: 'Bob' }];
    expect(pipe.transform(voters)).toBe('Alice, Bob');
  });

  it('prepends the given prefix', () => {
    const voters: User[] = [{ name: 'Alice' }];
    expect(pipe.transform(voters, 'Voted by: ')).toBe('Voted by: Alice');
  });

  it('appends the anonymous-voter disambiguation suffix', () => {
    const voters: User[] = [{ name: 'Alice', useSuffix: 2 }];
    expect(pipe.transform(voters)).toBe('Alice_2');
  });
});
