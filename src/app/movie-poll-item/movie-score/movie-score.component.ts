import { CommonModule, DecimalPipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, Input } from "@angular/core";

@Component({
  selector: "movie-score",
  templateUrl: "./movie-score.component.html",
  styleUrls: ["./movie-score.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [DecimalPipe, CommonModule],
})
export class MovieScoreComponent {
  @Input() set value(inputVal: number | undefined) {
    this.score = inputVal;

    this.percent = Number(this.score) * 10;
    this.background = `background: conic-gradient(
        ${this.getRatingColor(this.percent)} 0deg ${
      360 * (this.percent / 100)
    }deg,
        ${"#6350e9"} ${360 * (1 - this.percent / 100)}deg 360deg
      )`;
  }
  @Input() size: "xxs" | "xs" | "s" | "m" = "s";

  score: number = 8;
  percent: number;
  background: string;

  getRatingColor(percent: number | undefined): string {
    if (percent >= 61) {
      return "#6acc34";
    } else if (percent >= 40) {
      return "#facc33";
    } else if (percent === 0) {
      return "#fff";
    } else {
      return "#ea3f33";
    }
  }
}
