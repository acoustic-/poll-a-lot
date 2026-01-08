import { Pipe, PipeTransform } from '@angular/core';

export type DateDiffUnit = 'years' | 'months' | 'days';

@Pipe({
  name: 'dateDiff',
  standalone: true,
  pure: true
})
export class DateDiffPipe implements PipeTransform {

  transform(
    from: Date | string | number,
    to?: Date | string | number,
    unit: DateDiffUnit = 'years'
  ): number {
    if (!from) return 0;

    const start = new Date(from);
    const end = to ? new Date(to) : new Date();


    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

    switch (unit) {
      case 'days':
        return this.diffInDays(start, end);
      case 'months':
        return this.diffInMonths(start, end);
      case 'years':
      default:
        return this.diffInYears(start, end);
    }
  }

  private diffInYears(start: Date, end: Date): number {
    let years = end.getFullYear() - start.getFullYear();

    const hasHadBirthdayThisYear =
      end.getMonth() > start.getMonth() ||
      (end.getMonth() === start.getMonth() && end.getDate() >= start.getDate());

    if (!hasHadBirthdayThisYear) {
      years--;
    }

    return Math.max(years, 0);
  }

  private diffInMonths(start: Date, end: Date): number {
    let months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());

    if (end.getDate() < start.getDate()) {
      months--;
    }

    return Math.max(months, 0);
  }

  private diffInDays(start: Date, end: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.floor((end.getTime() - start.getTime()) / msPerDay);
  }
}