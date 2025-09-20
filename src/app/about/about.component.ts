import { Component, OnInit } from '@angular/core';
import packageJson from '../../../package.json';

@Component({
    selector: 'app-about',
    templateUrl: './about.component.html',
    styleUrls: ['./about.component.scss'],
    standalone: false
})
export class AboutComponent implements OnInit {
  public version: string = packageJson.version;

  constructor() { }

  ngOnInit() {
  }

}
