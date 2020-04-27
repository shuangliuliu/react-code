/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import MAX_SIGNED_31_BIT_INT from './maxSigned31BitInt';

export type ExpirationTime = number;

export const NoWork = 0;
export const Never = 1;
export const Sync = MAX_SIGNED_31_BIT_INT;

const UNIT_SIZE = 10;
const MAGIC_NUMBER_OFFSET = MAX_SIGNED_31_BIT_INT - 1;

// 1 unit of expiration time represents 10ms.
/*
  目的是让时间间隔10ms以内的时间得到同一个当前时间
*/
export function msToExpirationTime(ms: number): ExpirationTime {
  // Always add an offset so that we don't clash with the magic number for NoWork.
  return MAGIC_NUMBER_OFFSET - ((ms / UNIT_SIZE) | 0);
}

export function expirationTimeToMs(expirationTime: ExpirationTime): number {
  return (MAGIC_NUMBER_OFFSET - expirationTime) * UNIT_SIZE;
}
/*
  让num相差在precision的数字得到同样的数字，当前时间相差在precision的时间得到同样的过期时间
*/
function ceiling(num: number, precision: number): number {
  return (((num / precision) | 0) + 1) * precision;
}
// 计算过期时间，当前时间越大，expirationtime越小，当前时间越小，expirationtime越大
function computeExpirationBucket(
  currentTime,
  expirationInMs,
  bucketSizeMs,
): ExpirationTime {
  return (
    MAGIC_NUMBER_OFFSET -
    ceiling(
      /*
        之前在计算currenttime时候
        MAGIC_NUMBER_OFFSET - (date.now() - originalStartTimeMs) = MAGIC_NUMBER_OFFSET - date.now() + originalStartTimeMs,
        现在就是
        MAGIC_NUMBER_OFFSET - (MAGIC_NUMBER_OFFSET - date.now() + originalStartTimeMs) = date.now() + originalStartTimeMs
      */
      MAGIC_NUMBER_OFFSET - currentTime + expirationInMs / UNIT_SIZE,  //expirationInMs代表的是expirationInMs / UNIT_SIZE之后才过期
      bucketSizeMs / UNIT_SIZE,
    )
  );
}

export const LOW_PRIORITY_EXPIRATION = 5000;
export const LOW_PRIORITY_BATCH_SIZE = 250;

/*
返回低优先级的expirationTime时间,
低优先级的两个更新操作的时间间隔25ms时，会得到同一个过期时间，这样可以做到批量合并setstate，做到批量更新 */
export function computeAsyncExpiration(
  currentTime: ExpirationTime,
): ExpirationTime {
  return computeExpirationBucket(
    currentTime,
    LOW_PRIORITY_EXPIRATION,
    LOW_PRIORITY_BATCH_SIZE,
  );
}

// We intentionally set a higher expiration time for interactive updates in
// dev than in production.
//
// If the main thread is being blocked so long that you hit the expiration,
// it's a problem that could be solved with better scheduling.
//
// People will be more likely to notice this and fix it with the long
// expiration time in development.
//
// In production we opt for better UX at the risk of masking scheduling
// problems, by expiring fast.
export const HIGH_PRIORITY_EXPIRATION = __DEV__ ? 500 : 150;
export const HIGH_PRIORITY_BATCH_SIZE = 100;
// 返回高优先级的expirationTime时间,高优先级的过期时间间隔是10ms
/*
  当前时间相差在10ms会获得同样的过期时间
*/
export function computeInteractiveExpiration(currentTime: ExpirationTime) {
  return computeExpirationBucket(
    currentTime,
    HIGH_PRIORITY_EXPIRATION,
    HIGH_PRIORITY_BATCH_SIZE,
  );
}
