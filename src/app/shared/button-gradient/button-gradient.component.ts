import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatRippleModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { LazyLoadImageModule } from 'ng-lazyload-image';

@Component({
  selector: 'button-gradient',
  standalone: true,
  imports: [
    MatIconModule,
    LazyLoadImageModule,
    MatRippleModule
  ],
  templateUrl: './button-gradient.component.html',
  styleUrl: './button-gradient.component.scss'
})
export class ButtonGradientComponent {
  @Input() buttonText;
  @Input() buttonIcon: 'add_circle_outline';
  @Input() buttonImg;
  @Input() size: 's' | 'm' = 'm';

  @Output() buttonClicked = new EventEmitter<void>();

}
