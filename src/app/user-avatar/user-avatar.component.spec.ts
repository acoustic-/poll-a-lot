import { sizedGooglePhotoUrl } from './user-avatar.component';

describe('sizedGooglePhotoUrl', () => {
  it('rewrites an existing =sNN suffix to roughly 2x the display size', () => {
    const url = 'https://lh3.googleusercontent.com/a/abc123=s96-c';
    expect(sizedGooglePhotoUrl(url, 20)).toBe('https://lh3.googleusercontent.com/a/abc123=s40-c');
  });

  it('appends a size suffix when none exists', () => {
    const url = 'https://lh3.googleusercontent.com/a/abc123';
    expect(sizedGooglePhotoUrl(url, 20)).toBe('https://lh3.googleusercontent.com/a/abc123=s40-c');
  });

  it('leaves non-Google URLs unchanged', () => {
    const url = 'https://example.com/photo.jpg';
    expect(sizedGooglePhotoUrl(url, 20)).toBe(url);
  });
});
