import { Injectable } from "@angular/core";
import { BehaviorSubject, Observable } from "rxjs";
import { scan } from "rxjs/operators";
import { Poll } from "../model/poll";

export abstract class DataService<T> {
  protected subject: BehaviorSubject<T>;
  protected data: Observable<T>;

  protected constructor(initialValue: T) {
    this.subject = new BehaviorSubject<T>(initialValue);
    this.data = this.subject.pipe(
      scan((acc: T, curr: T) => ({ ...acc, ...curr }), initialValue)
    );
  }

  public getData(): Observable<T> {
    return this.data;
  }

  public setData(data: T): void {
    this.subject.next(data);
  }
}

@Injectable()
export class ApplicationDataService extends DataService<AppData> {
  constructor() {
    // define your default values here
    super({ polls: {} });
  }
}

interface AppData {
  polls: { [n: string]: Poll };
}
