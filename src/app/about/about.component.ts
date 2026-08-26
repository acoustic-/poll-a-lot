import { Component } from '@angular/core';
import packageJson from '../../../package.json';
import { MatCard } from '@angular/material/card';

@Component({
    selector: 'app-about',
    templateUrl: './about.component.html',
    styleUrls: ['./about.component.scss'],
    imports: [MatCard]
})
export class AboutComponent {
  public version: string = packageJson.version;
}
