import * as localforage from 'localforage';
import {Injectable} from "@angular/core";
import {Observable, from} from "rxjs";

@Injectable()
export class LocalStorageService {

  /**
   *
   * @param key
   * @param value
   * @returns {any}
   */
  public setItem<T>(key:string, value:T): Observable<T>{
    return from(localforage.setItem(key, value))
  }

  /**
   *
   * @param key
   * @returns {any}
   */
  public getItem<T>(key:string): Observable<any>{
    return from(localforage.getItem(key))
  }

  /**
   *
   * @param key
   * @returns {any}
   */
  public removeItem(key:string):Observable<void>{
    return from(localforage.removeItem(key))
  }
}