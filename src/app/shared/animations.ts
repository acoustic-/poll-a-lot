import { query, trigger, transition, style, state, group, animate } from '@angular/animations';

export const fadeInOut = trigger('fadeInOut', [
    state('void', style({
        opacity: 0,
      })),
    state('true', style({
      opacity: 1,
    })),
    state('false', style({
      opacity: 0,
    })),
    transition('* => true', animate('800ms ease-in')),
    transition('* => void', animate('500ms ease-in')),
    transition('true => false', animate('900ms ease-in'))
  ]);

  export const smoothHeight = trigger('grow', [
    transition('void <=> *', [style({ height: 0, opacity: 1 })], {
      params: { startHeight: 0 }
    }),
    transition('* <=> *', [style({ height: '{{startHeight}}px', opacity: 0 }), animate('2s ease-in')], {
      params: { startHeight: 0 }
    })
  ]);
