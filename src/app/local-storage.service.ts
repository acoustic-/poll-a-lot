import * as localforage from 'localforage';
import {Injectable} from "@angular/core";
import {Observable} from "rxjs/Observable";

@Injectable()
export class LocalStorageService {

  /**
   *
   * @param key
   * @param value
   * @returns {any}
   */
  public setItem<T>(key:string, value:T):Observable<T>{
    return Observable.fromPromise(localforage.setItem(key, value))
  }

  /**
   *
   * @param key
   * @returns {any}
   */
  public getItem<T>(key:string):Observable<T>{
    return Observable.fromPromise(localforage.getItem(key))
  }

  /**
   *
   * @param key
   * @returns {any}
   */
  public removeItem(key:string):Observable<void>{
    return Observable.fromPromise(localforage.removeItem(key))
  }
}