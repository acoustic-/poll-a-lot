import {Injectable} from "@angular/core";
import {LocalStorageService} from "./local-storage.service";
import {Observable, of} from "rxjs";
import {map, mergeMap} from "rxjs/operators";
import {isEmpty, isString, isNumber, isDate} from 'lodash';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/mergeMap';

@Injectable()
export class LocalCacheService {

  defaultExpires: number = 86400; //24Hrs
  constructor(private localstorage: LocalStorageService) {}

  public observable<T>(key: string, observable: Observable<T>, expires:number = this.defaultExpires): Observable<T> {
    //First fetch the item from localstorage (even though it may not exist)
    return this.localstorage.getItem(key)
      //If the cached value has expired, nullify it, otherwise pass it through
      .map((val: CacheStorageRecord<T>) => {
        if(val){
          return (new Date(val.expires)).getTime() > Date.now() ? val : null;
        }
        return null;
      })
      //At this point, if we encounter a null value, either it doesnt exist in the cache or it has expired.
      //If it doesnt exist, simply return the observable that has been passed in, caching its value as it passes through
      .flatMap((val: CacheStorageRecord<T> | null) => {
        if (!isEmpty(val)) {
          return of(val.value);
        } else {
          return observable.pipe(mergeMap((val:any) => this.value(key, val, expires))); //The result may have 'expires' explicitly set
        }
      })
  }

  public requestFromCache<T>(key: string): Observable<CacheStorageRecord<T> | null> {
    return this.localstorage.getItem(key).pipe(map((val: CacheStorageRecord<T>) => {
      if(val){
        return (new Date(val.expires)).getTime() > Date.now() ? val : null;
      }
      return null;
    }));
  }

  value<T>(key:string, value:T, expires:number|string|Date = this.defaultExpires):Observable<T>{
    let _expires:Date = this.sanitizeAndGenerateDateExpiry(expires);

    return this.localstorage.setItem(key, {
      expires: _expires,
      value: value
    }).map(val => val.value);
  }

  expire(key:string): Observable<void>{
    return this.localstorage.removeItem(key);
  }

  private sanitizeAndGenerateDateExpiry(expires:string|number|Date):Date{
    let expiryDate:Date = this.expiryToDate(expires);

    //Dont allow expiry dates in the past
    if(expiryDate.getTime() <= Date.now()){
      return new Date(Date.now() + this.defaultExpires);
    }

    return expiryDate;
  }

  /**
   *
   * @param expires
   * @returns {Date}
   */
  private expiryToDate(expires: number|string|Date):Date{
    if(isNumber(expires)){
      return new Date(Date.now() + Math.abs(expires as number)*1000);
    }
    if(isString(expires)){
      return new Date(expires as string);
    }
    if(isDate(expires)){
      return expires as Date;
    }

    return new Date();
  }
}

/**
 * Cache storage record interface
 */
interface CacheStorageRecord<T> {
  expires: Date,
  value: T
}
