import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
  name: "screenHeight",
  standalone: true,
})
export class ScreenHeightPipe implements PipeTransform {
  transform(value?: any, args?: any): any {
    return window.innerHeight;
  }
}
