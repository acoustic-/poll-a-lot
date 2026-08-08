import { UserAvatarComponent, sizedGooglePhotoUrl } from './user-avatar.component';

describe('UserAvatarComponent', () => {
  it('resets imageFailed when the identity input changes', () => {
    const component = new UserAvatarComponent();
    component.identity = { key: 'a', displayName: 'Alice', photoURL: 'https://example.com/a.jpg' } as any;

    component.onImageError();
    expect(component.imageFailed).toBeTrue();

    component.identity = { key: 'b', displayName: 'Bob', photoURL: 'https://example.com/b.jpg' } as any;
    component.ngOnChanges({ identity: {} as any });

    expect(component.imageFailed).toBeFalse();
  });

  it('leaves imageFailed alone when an unrelated input changes', () => {
    const component = new UserAvatarComponent();
    component.onImageError();

    component.ngOnChanges({ size: {} as any });

    expect(component.imageFailed).toBeTrue();
  });
});

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
