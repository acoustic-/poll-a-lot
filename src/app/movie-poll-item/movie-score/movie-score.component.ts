import { CommonModule, DecimalPipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
} from "@angular/core";

@Component({
  selector: "movie-score",
  templateUrl: "./movie-score.component.html",
  styleUrls: ["./movie-score.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [DecimalPipe, CommonModule],
})
export class MovieScoreComponent implements OnInit {
  @Input() value: number;
  @Input() size: "s" | "m" = "s";

  percent: number;
  background: string;

  ngOnInit() {
    this.percent = Number(this.value) * 10;
    this.background = `background: conic-gradient(
        ${this.getRatingColor(this.percent)} 0deg ${
      360 * (this.percent / 100)
    }deg,
        ${"#6350e9"} ${360 * (1 - this.percent / 100)}deg 360deg
      )`;
  }

  getRatingColor(percent: number): string {
    console.log("percentage is", percent, typeof percent);
    if (percent >= 61) {
      return "#6acc34";
    } else if (percent >= 40) {
      return "#facc33";
    } else {
      return "#ea3f33";
    }
  }
}
