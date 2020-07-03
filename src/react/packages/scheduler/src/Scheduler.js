/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* eslint-disable no-var */

import { enableSchedulerDebugging } from './SchedulerFeatureFlags';

// TODO: Use symbols?
var ImmediatePriority = 1;
var UserBlockingPriority = 2;
var NormalPriority = 3;
var LowPriority = 4;
var IdlePriority = 5;

// Max 31 bit integer. The max integer size in V8 for 32-bit systems.
// Math.pow(2, 30) - 1
// 0b111111111111111111111111111111
var maxSigned31BitInt = 1073741823;

// Times out immediately
var IMMEDIATE_PRIORITY_TIMEOUT = -1;
// Eventually times out
var USER_BLOCKING_PRIORITY = 250;
var NORMAL_PRIORITY_TIMEOUT = 5000;
var LOW_PRIORITY_TIMEOUT = 10000;
// Never times out
var IDLE_PRIORITY = maxSigned31BitInt;

// Callbacks are stored as a circular, doubly linked list.
var firstCallbackNode = null;

var currentDidTimeout = false;
// Pausing the scheduler is useful for debugging.
var isSchedulerPaused = false;

var currentPriorityLevel = NormalPriority;
var currentEventStartTime = -1;
var currentExpirationTime = -1;

// This is set when a callback is being executed, to prevent re-entrancy.
var isExecutingCallback = false;

var isHostCallbackScheduled = false;

var hasNativePerformanceNow =
  typeof performance === 'object' && typeof performance.now === 'function';

/*
  1、调用该方法说明callbackList中的firstCallbackNode发生了改变
     expirationTime = startTime + deprecated_options.timeout
  2、调用该方法时开始执行任务
*/
//  isExecutingCallback和isHostCallbackScheduled的区别？
function ensureHostCallbackIsScheduled() {
  /*
    如果正在执行callback，直接return，代表着已经有一个callbackNode被调用，就是传入的performAsyncWork
    自动会进入一个调度循环，不需要重新启动一个调度循环（怎么自动调度？），之前就已经有一次判断
  */
  if (isExecutingCallback) {
    // Don't schedule work yet; wait until the next time we yield.
    return;
  }
  // Schedule the host callback using the earliest expiration in the list.
  var expirationTime = firstCallbackNode.expirationTime;
  /*
    判断HostCallback是否已经开始执行
  */
  //  isHostCallbackScheduled和isExecutingCallback的区别
  if (!isHostCallbackScheduled) { // 未开始执行
    isHostCallbackScheduled = true; // 开始执行
  } else {  // 已经开始执行
    // Cancel the existing host callback.
    // 取消该任务的执行
    /*
      之前scheduleCallbackWithExpirationTime中已经取消callback执行，
      此时取消执行是取消的什么任务
    */
    cancelHostCallback();
  }
  /* 执行最新的firstCallback */
  requestHostCallback(flushWork, expirationTime);
}
// 先把当前的任务从任务队列中删除，之后再执行
function flushFirstCallback() {
  var flushedNode = firstCallbackNode;

  // Remove the node from the list before calling the callback. That way the
  // list is in a consistent state even if the callback throws.
  var next = firstCallbackNode.next;
  if (firstCallbackNode === next) {   // 说明当前任务队列中只有一个任务
    // This is the last callback in the list.
    /*
    执行该方法说明已经在执行一个firstCallback了，执行完之后需要将其置为空
     */
    firstCallbackNode = null;
    next = null;
  } else {
    // firstCallbackNode去掉
    var lastCallbackNode = firstCallbackNode.previous;
    firstCallbackNode = lastCallbackNode.next = next;
    next.previous = lastCallbackNode;
  }

  flushedNode.next = flushedNode.previous = null;

  // Now it's safe to call the callback.
  /*
    performAsyncWork
  */
  var callback = flushedNode.callback;
  var expirationTime = flushedNode.expirationTime;
  var priorityLevel = flushedNode.priorityLevel;
  var previousPriorityLevel = currentPriorityLevel;
  var previousExpirationTime = currentExpirationTime;
  currentPriorityLevel = priorityLevel;
  currentExpirationTime = expirationTime;
  var continuationCallback;
  try {
    // callback是performAsyncWork
    continuationCallback = callback();
  } finally {
    currentPriorityLevel = previousPriorityLevel;
    currentExpirationTime = previousExpirationTime;
  }

  // A callback may return a continuation. The continuation should be scheduled
  // with the same priority and expiration as the just-finished callback.
  // performAsyncWork没返回值，不用看
  if (typeof continuationCallback === 'function') {
    var continuationNode: CallbackNode = {
      callback: continuationCallback,
      priorityLevel,
      expirationTime,
      next: null,
      previous: null,
    };

    // Insert the new callback into the list, sorted by its expiration. This is
    // almost the same as the code in `scheduleCallback`, except the callback
    // is inserted into the list *before* callbacks of equal expiration instead
    // of after.
    if (firstCallbackNode === null) {
      // This is the first callback in the list.
      firstCallbackNode = continuationNode.next = continuationNode.previous = continuationNode;
    } else {
      var nextAfterContinuation = null;
      var node = firstCallbackNode;
      do {
        if (node.expirationTime >= expirationTime) {
          // This callback expires at or after the continuation. We will insert
          // the continuation *before* this callback.
          nextAfterContinuation = node;
          break;
        }
        node = node.next;
      } while (node !== firstCallbackNode);

      if (nextAfterContinuation === null) {
        // No equal or lower priority callback was found, which means the new
        // callback is the lowest priority callback in the list.
        nextAfterContinuation = firstCallbackNode;
      } else if (nextAfterContinuation === firstCallbackNode) {
        // The new callback is the highest priority callback in the list.
        firstCallbackNode = continuationNode;
        ensureHostCallbackIsScheduled();
      }

      var previous = nextAfterContinuation.previous;
      previous.next = nextAfterContinuation.previous = continuationNode;
      continuationNode.next = nextAfterContinuation;
      continuationNode.previous = previous;
    }
  }
}

function flushImmediateWork() {
  if (
    // Confirm we've exited the outer most event handler
    currentEventStartTime === -1 &&
    firstCallbackNode !== null &&
    firstCallbackNode.priorityLevel === ImmediatePriority
  ) {
    isExecutingCallback = true;
    try {
      do {
        flushFirstCallback();
      } while (
        // Keep flushing until there are no more immediate callbacks
        firstCallbackNode !== null &&
        firstCallbackNode.priorityLevel === ImmediatePriority
      );
    } finally {
      isExecutingCallback = false;
      if (firstCallbackNode !== null) {
        // There's still work remaining. Request another callback.
        ensureHostCallbackIsScheduled();
      } else {
        isHostCallbackScheduled = false;
      }
    }
  }
}
/*
  didTimeout是firstCallbackNode的expirationtime是否超时的判断
  为true说明任务已经过期了
*/
function flushWork(didTimeout) {
  // Exit right away if we're currently paused

  if (enableSchedulerDebugging && isSchedulerPaused) {
    return;
  }
  /*
   当真正开始调用firstCallbackNode的callback时候设置isExecutingCallback为true
  */
  isExecutingCallback = true;
  const previousDidTimeout = currentDidTimeout;
  currentDidTimeout = didTimeout;
  try {
    if (didTimeout) {
      // Flush all the expired callbacks without yielding.
      while (
        firstCallbackNode !== null &&
        !(enableSchedulerDebugging && isSchedulerPaused)
      ) {
        // TODO Wrap in feature flag
        // Read the current time. Flush all the callbacks that expire at or
        // earlier than that time. Then read the current time again and repeat.
        // This optimizes for as few performance.now calls as possible.
        var currentTime = getCurrentTime();
        if (firstCallbackNode.expirationTime <= currentTime) { //第一个任务的expirationtime肯定小于当前时间
          /*
            该循环会重复执行队列中过期的任务，直到遇到第一个不是过期的任务，退出当前循环
          */
          do {
            flushFirstCallback();
          } while (
            firstCallbackNode !== null &&
            firstCallbackNode.expirationTime <= currentTime &&
            !(enableSchedulerDebugging && isSchedulerPaused)
          );
          continue;
        }
        break;
      }
    } else {  // 没有任务是过期的
      // Keep flushing callbacks until we run out of time in the frame.
      if (firstCallbackNode !== null) {
        // 该循环重复执行队列中的任务，直到时间片用完
        do {
          if (enableSchedulerDebugging && isSchedulerPaused) {
            break;
          }
          flushFirstCallback();
          /*
            shouldYieldToHost = frameDeadline <= getCurrentTime();
          */
        } while (firstCallbackNode !== null && !shouldYieldToHost());
      }
    }
  } finally {
    isExecutingCallback = false;
    currentDidTimeout = previousDidTimeout;
    if (firstCallbackNode !== null) {
      // There's still work remaining. Request another callback.
      // 为什么还要再执行该方法一次？
      ensureHostCallbackIsScheduled();
    } else {
      isHostCallbackScheduled = false;
    }
    // Before exiting, flush all the immediate work that was scheduled.
    // 不用管
    flushImmediateWork();
  }
}

function unstable_runWithPriority(priorityLevel, eventHandler) {
  switch (priorityLevel) {
    case ImmediatePriority:
    case UserBlockingPriority:
    case NormalPriority:
    case LowPriority:
    case IdlePriority:
      break;
    default:
      priorityLevel = NormalPriority;
  }

  var previousPriorityLevel = currentPriorityLevel;
  var previousEventStartTime = currentEventStartTime;
  currentPriorityLevel = priorityLevel;
  currentEventStartTime = getCurrentTime();

  try {
    return eventHandler();
  } finally {
    currentPriorityLevel = previousPriorityLevel;
    currentEventStartTime = previousEventStartTime;

    // Before exiting, flush all the immediate work that was scheduled.
    flushImmediateWork();
  }
}

function unstable_next(eventHandler) {
  let priorityLevel;
  switch (currentPriorityLevel) {
    case ImmediatePriority:
    case UserBlockingPriority:
    case NormalPriority:
      // Shift down to normal priority
      priorityLevel = NormalPriority;
      break;
    default:
      // Anything lower than normal priority should remain at the current level.
      priorityLevel = currentPriorityLevel;
      break;
  }

  var previousPriorityLevel = currentPriorityLevel;
  var previousEventStartTime = currentEventStartTime;
  currentPriorityLevel = priorityLevel;
  currentEventStartTime = getCurrentTime();

  try {
    return eventHandler();
  } finally {
    currentPriorityLevel = previousPriorityLevel;
    currentEventStartTime = previousEventStartTime;

    // Before exiting, flush all the immediate work that was scheduled.
    flushImmediateWork();
  }
}

function unstable_wrapCallback(callback) {
  var parentPriorityLevel = currentPriorityLevel;
  return function () {
    // This is a fork of runWithPriority, inlined for performance.
    var previousPriorityLevel = currentPriorityLevel;
    var previousEventStartTime = currentEventStartTime;
    currentPriorityLevel = parentPriorityLevel;
    currentEventStartTime = getCurrentTime();

    try {
      return callback.apply(this, arguments);
    } finally {
      currentPriorityLevel = previousPriorityLevel;
      currentEventStartTime = previousEventStartTime;
      flushImmediateWork();
    }
  };
}
/*
  功能：
    1、把callback插入到callbackList链表中
    2、返回callback的callbackId
   调用该方法的时候已经取消了之前正在执行的任务了
   callback：performAsyncWork
*/
function unstable_scheduleCallback(callback, deprecated_options) { //callback传入的是performAsyncWork，
  var startTime =
    currentEventStartTime !== -1 ? currentEventStartTime : getCurrentTime(); // 获取当前时间
  var expirationTime;
  if (
    typeof deprecated_options === 'object' &&
    deprecated_options !== null &&
    typeof deprecated_options.timeout === 'number'
  ) {
    // FIXME: Remove this branch once we lift expiration times out of React.
    //过期时间 = 当前时间 + 超时的时间戳
    expirationTime = startTime + deprecated_options.timeout;
  } else {
    switch (currentPriorityLevel) { // 更新模式，比如同步、Async、interactive
      case ImmediatePriority:
        expirationTime = startTime + IMMEDIATE_PRIORITY_TIMEOUT;
        break;
      case UserBlockingPriority:
        expirationTime = startTime + USER_BLOCKING_PRIORITY;
        break;
      case IdlePriority:
        expirationTime = startTime + IDLE_PRIORITY;
        break;
      case LowPriority:
        expirationTime = startTime + LOW_PRIORITY_TIMEOUT;
        break;
      case NormalPriority:
      default:
        expirationTime = startTime + NORMAL_PRIORITY_TIMEOUT;
    }
  }

  var newNode = {
    callback,
    priorityLevel: currentPriorityLevel,
    expirationTime,
    next: null,
    previous: null,
  };

  // Insert the new callback into the list, ordered first by expiration, then
  // by insertion. So the new callback is inserted any other callback with
  // equal expiration.
  // firstCallbackNode是callbackList单向链表的头部
  // 传进来的callback是callbackList的第一个callback，直接赋值给firstCallbackNode
  if (firstCallbackNode === null) {
    // This is the first callback in the list.
    // 将callback赋值给firstCallbackNode
    firstCallbackNode = newNode.next = newNode.previous = newNode;
    ensureHostCallbackIsScheduled();
  } else {
    // 将新产生的任务插入到任务队列中
    var next = null;
    var node = firstCallbackNode;
    // 找出当前任务在callbackList中的位置
    do {
      // 此时的expirationtime是重新生成的expirationTime，和之前计算的expirationtime不一样
      if (node.expirationTime > expirationTime) {
        // The new callback expires before this one.
        next = node;
        break;
      }
      node = node.next;
    } while (node !== firstCallbackNode);
    /*
      这里列出了两种特殊情况，因为需要重新赋值：
      1、当前任务的expirationtime大于任务链表中所有任务的expirationtime，插在链表尾部
      2、当前任务的expirationtime小于任务链表中第一个任务的expirationtime，插在链表头部
    */
    if (next === null) { //  当前任务优先级最低，在链表的末尾
      // No callback with a later expiration was found, which means the new
      // callback has the latest expiration in the list.
      next = firstCallbackNode;
    } else if (next === firstCallbackNode) { // 当前任务的优先级最高，在链表的开头
      // The new callback has the earliest expiration in the entire list.
      firstCallbackNode = newNode;
      /*
        如果firstCallbackNode变了就需要调用该方法
        猜测：
          1、每次更新任务都是从callbackList中取第一个任务进行更新
           （但是之前正在执行的任务可能位于队列的开头、中间、结尾，这不就冲突了吗）
          2、
      */
      ensureHostCallbackIsScheduled();
    }
    // 形成一个环状的双向链表结构
    var previous = next.previous;
    previous.next = next.previous = newNode;
    newNode.next = next;
    newNode.previous = previous;
  }

  return newNode;
}

function unstable_pauseExecution() {
  isSchedulerPaused = true;
}

function unstable_continueExecution() {
  isSchedulerPaused = false;
  if (firstCallbackNode !== null) {
    ensureHostCallbackIsScheduled();
  }
}

function unstable_getFirstCallbackNode() {
  return firstCallbackNode;
}

function unstable_cancelCallback(callbackNode) {
  var next = callbackNode.next;
  if (next === null) {
    // Already cancelled.
    return;
  }

  if (next === callbackNode) {
    // This is the only scheduled callback. Clear the list.
    firstCallbackNode = null;
  } else {
    // Remove the callback from its position in the list.
    if (callbackNode === firstCallbackNode) {
      firstCallbackNode = next;
    }
    var previous = callbackNode.previous;
    previous.next = next;
    next.previous = previous;
  }

  callbackNode.next = callbackNode.previous = null;
}

function unstable_getCurrentPriorityLevel() {
  return currentPriorityLevel;
}

function unstable_shouldYield() {
  return (
    !currentDidTimeout &&
    ((firstCallbackNode !== null &&
      firstCallbackNode.expirationTime < currentExpirationTime) ||
      shouldYieldToHost())
  );
}

// The remaining code is essentially a polyfill for requestIdleCallback. It
// works by scheduling a requestAnimationFrame, storing the time for the start
// of the frame, then scheduling a postMessage which gets scheduled after paint.
// Within the postMessage handler do as much work as possible until time + frame
// rate. By separating the idle call into a separate event tick we ensure that
// layout, paint and other browser work is counted against the available time.
// The frame rate is dynamically adjusted.

// We capture a local reference to any global, in case it gets polyfilled after
// this module is initially evaluated. We want to be using a
// consistent implementation.
var localDate = Date;

// This initialization code may run even on server environments if a component
// just imports ReactDOM (e.g. for findDOMNode). Some environments might not
// have setTimeout or clearTimeout. However, we always expect them to be defined
// on the client. https://github.com/facebook/react/pull/13088
var localSetTimeout = typeof setTimeout === 'function' ? setTimeout : undefined;
var localClearTimeout =
  typeof clearTimeout === 'function' ? clearTimeout : undefined;

// We don't expect either of these to necessarily be defined, but we will error
// later if they are missing on the client.
var localRequestAnimationFrame =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : undefined;
var localCancelAnimationFrame =
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : undefined;

var getCurrentTime;

// requestAnimationFrame does not run when the tab is in the background. If
// we're backgrounded we prefer for that work to happen so that the page
// continues to load in the background. So we also schedule a 'setTimeout' as
// a fallback.
// TODO: Need a better heuristic for backgrounded work.
var ANIMATION_FRAME_TIMEOUT = 100;
var rAFID;
var rAFTimeoutID;
/*
  callback是animationTick
*/
// 请求浏览器的下帧时间执行当前任务
var requestAnimationFrameWithTimeout = function (callback) {
  // schedule rAF and also a setTimeout
  /*
    localRequestAnimationFrame是window.requestAnimationFrame，
    浏览器在某一帧有空了，取消定时器的执行，执行callback
  */
  rAFID = localRequestAnimationFrame(function (timestamp) {
    // cancel the setTimeout
    localClearTimeout(rAFTimeoutID);
    // 传进来的是animationTick
    callback(timestamp);
  });
  /*
    如果在100ms内localRequestAnimationFrame都没请求到时间，
    那么取消之前的localCancelAnimationFrame，直接执行callback
  */
  rAFTimeoutID = localSetTimeout(function () {
    // cancel the requestAnimationFrame
    // 如果在100ms内没有得到requestAnimationFrame响应，直接调用callback
    localCancelAnimationFrame(rAFID);
    callback(getCurrentTime());
  }, ANIMATION_FRAME_TIMEOUT);
};

if (hasNativePerformanceNow) {
  var Performance = performance;
  getCurrentTime = function () {
    return Performance.now();
  };
} else {
  getCurrentTime = function () {
    return localDate.now();
  };
}

var requestHostCallback;
var cancelHostCallback;
var shouldYieldToHost;

var globalValue = null;
if (typeof window !== 'undefined') {
  globalValue = window;
} else if (typeof global !== 'undefined') {
  globalValue = global;
}

if (globalValue && globalValue._schedMock) {
  // Dynamic injection, only for testing purposes.
  var globalImpl = globalValue._schedMock;
  requestHostCallback = globalImpl[0];
  cancelHostCallback = globalImpl[1];
  shouldYieldToHost = globalImpl[2];
  getCurrentTime = globalImpl[3];
} else if (  //当前不处于浏览器环境
  // If Scheduler runs in a non-DOM environment, it falls back to a naive
  // implementation using setTimeout.
  typeof window === 'undefined' ||
  // Check if MessageChannel is supported, too.
  typeof MessageChannel !== 'function'
) {
  // If this accidentally gets imported in a non-browser environment, e.g. JavaScriptCore,
  // fallback to a naive implementation.
  var _callback = null;
  var _flushCallback = function (didTimeout) {
    if (_callback !== null) {
      try {
        _callback(didTimeout);
      } finally {
        _callback = null;
      }
    }
  };
  requestHostCallback = function (cb, ms) {
    if (_callback !== null) {
      // Protect against re-entrancy.
      setTimeout(requestHostCallback, 0, cb);
    } else {
      _callback = cb;
      setTimeout(_flushCallback, 0, false);
    }
  };
  cancelHostCallback = function () {
    _callback = null;
  };
  shouldYieldToHost = function () {
    return false;
  };
} else {
  if (typeof console !== 'undefined') {
    // TODO: Remove fb.me link
    if (typeof localRequestAnimationFrame !== 'function') {
      console.error(
        "This browser doesn't support requestAnimationFrame. " +
        'Make sure that you load a ' +
        'polyfill in older browsers. https://fb.me/react-polyfills',
      );
    }
    if (typeof localCancelAnimationFrame !== 'function') {
      console.error(
        "This browser doesn't support cancelAnimationFrame. " +
        'Make sure that you load a ' +
        'polyfill in older browsers. https://fb.me/react-polyfills',
      );
    }
  }

  var scheduledHostCallback = null;
  var isMessageEventScheduled = false;
  var timeoutTime = -1;

  var isAnimationFrameScheduled = false;

  var isFlushingHostCallback = false;

  var frameDeadline = 0;
  // We start out assuming that we run at 30fps but then the heuristic tracking
  // will adjust this value to a faster fps if we get more frequent animation
  // frames.
  var previousFrameTime = 33;
  var activeFrameTime = 33;

  shouldYieldToHost = function () {
    return frameDeadline <= getCurrentTime();
  };

  // We use the postMessage trick to defer idle work until after the repaint.
  var channel = new MessageChannel();
  var port = channel.port2;
  channel.port1.onmessage = function (event) {
    isMessageEventScheduled = false;

    var prevScheduledCallback = scheduledHostCallback;
    var prevTimeoutTime = timeoutTime;
    scheduledHostCallback = null;
    timeoutTime = -1;

    var currentTime = getCurrentTime();

    var didTimeout = false;
    if (frameDeadline - currentTime <= 0) { // 说明在一帧当中浏览器渲染动画用光了整个帧时长
      // There's no time left in this idle period. Check if the callback has
      // a timeout and whether it's been exceeded.
      // 说明在请求的下一帧中有任务已经过期，强制更新
      if (prevTimeoutTime !== -1 && prevTimeoutTime <= currentTime) {
        // Exceeded the timeout. Invoke the callback even though there's no
        // time left.
        didTimeout = true; // 设为true说明有任务过期
      } else {
        // No timeout.
        if (!isAnimationFrameScheduled) {
          // Schedule another animation callback so we retry later.
          isAnimationFrameScheduled = true;
          requestAnimationFrameWithTimeout(animationTick);
        }
        // Exit without invoking the callback.
        // 为什么重新设置回去？
        scheduledHostCallback = prevScheduledCallback;
        timeoutTime = prevTimeoutTime;
        return;
      }
    }
    // 已经有任务过期必须执行
    if (prevScheduledCallback !== null) {
      /*
        正在调用该callback
      */
      isFlushingHostCallback = true;
      try {
        /*
         prevScheduledCallback为flushwork
        */
        prevScheduledCallback(didTimeout);
      } finally {
        isFlushingHostCallback = false;
      }
    }
  };
  /*
   该方法执行的时候已经获取一帧时间，开始执行一个任务了，
   （看完浏览器工作原理再看这一部分）
   scheduledHostCallback = flushwork
  */
  var animationTick = function (rafTime) {
    // 在requestHostCallback赋值
    if (scheduledHostCallback !== null) {
      // Eagerly schedule the next animation callback at the beginning of the
      // frame. If the scheduler queue is not empty at the end of the frame, it
      // will continue flushing inside that callback. If the queue *is* empty,
      // then it will exit immediately. Posting the callback at the start of the
      // frame ensures it's fired within the earliest possible frame. If we
      // waited until the end of the frame to post the callback, we risk the
      // browser skipping a frame and not firing the callback until the frame
      // after that.
      /*
        已经请求过一帧了，再次请求下一帧，
        当前的animationTick只执行一个callback，在执行该任务的时候提前申请下一帧
      */
      requestAnimationFrameWithTimeout(animationTick);
    } else {
      // 没有任务需要调度，直接return
      // No pending work. Exit.
      isAnimationFrameScheduled = false;
      return;
    }

    /*
      frameDeadline = 0
      activeFrameTime = 33
      第一次调用frameDeadline为0
      第二次调用
      frameDeadline = rafTime + activeFrameTime = rafTime + 33
      nextFrameTime = rafTime - frameDeadline + activeFrameTime
                    = rafTime2 - (rafTime1+activeFrameTime)+activeFrameTime
                    = rafTime2 - rafTime1
       previousFrameTime = nextFrameTime = rafTime - frameDeadline + activeFrameTime
                         = rafTime1 - 0 + 33
                         = rafTime1 + 33

    */
    //  下一帧的开始时间
    var nextFrameTime = rafTime - frameDeadline + activeFrameTime;
    /*
      如果当前浏览器的刷新频率高于30帧
    */
    if (
      nextFrameTime < activeFrameTime &&
      previousFrameTime < activeFrameTime
    ) {
      if (nextFrameTime < 8) { // 当前react版本不支持高于120hz的刷新频率
        // Defensive coding. We don't support higher frame rates than 120hz.
        // If the calculated frame time gets lower than 8, it is probably a bug.
        nextFrameTime = 8;
      }
      // If one frame goes long, then the next one can be short to catch up.
      // If two frames are short in a row, then that's an indication that we
      // actually have a higher frame rate than what we're currently optimizing.
      // We adjust our heuristic dynamically accordingly. For example, if we're
      // running on 120hz display or 90hz VR display.
      // Take the max of the two in case one of them was an anomaly due to
      // missed frame deadlines.
      activeFrameTime =
        nextFrameTime < previousFrameTime ? previousFrameTime : nextFrameTime; // 始终不理解
    } else {
      /*
         第一次
         previousFrameTime
                          = nextFrameTime = rafTime - frameDeadline + activeFrameTime
                          = rafTime - 0 + 33
      */
      previousFrameTime = nextFrameTime;
    }
    /*
      第一次nextFrameTime = rafTime - frameDeadline + activeFrameTime之后，给frameDeadline重新赋值，
      是一个帧完整的时间33ms，实际不对，因为一帧里边不仅要执行react，还要执行优先级更高的浏览器任务，
      详情看浏览器的任务队列
    */
    /*
      第一次：frameDeadline = rafTime + activeFrameTime = rafTime + 33
      第二次：
    */
    frameDeadline = rafTime + activeFrameTime;
    if (!isMessageEventScheduled) {
      isMessageEventScheduled = true;
      /*
        postMessage把任务推到任务队列中，
        会等到浏览器执行完动画之后执行react任务
       */
      port.postMessage(undefined);
    }
  };

  /*
    callback是flushWork
    timeoutTime = absoluteTimeout = startTime + timeout
  */
  requestHostCallback = function (callback, absoluteTimeout) {
    scheduledHostCallback = callback;
    timeoutTime = absoluteTimeout;
    // 如果已经有任务超时，不用等待requestAnimationFrameWithTimeout的下一帧，直接将当前任务加入到事件队列中，立即执行
    /*
    疑问： absoluteTimeout
    = firstCallbackNode.expirationTime
    = startTime + deprecated_options.timeout 怎么会小于0？
    */
    if (isFlushingHostCallback || absoluteTimeout < 0) {
      // Don't wait for the next frame. Continue working ASAP, in a new event.
      // 在当前帧里直接执行任务，不用等到下一帧
      port.postMessage(undefined);
    } else if (!isAnimationFrameScheduled) {  //还没有进入循环调度的过程
      // 请求下一帧执行任务
      // If rAF didn't already schedule one, we need to schedule a frame.
      // TODO: If this rAF doesn't materialize because the browser throttles, we
      // might want to still have setTimeout trigger rIC as a backup to ensure
      // that we keep performing work.
      isAnimationFrameScheduled = true;
      /*
        请求下一帧时间执行任务
      */
      requestAnimationFrameWithTimeout(animationTick);
    }
  };
  /*
    重置变量，让之前执行的任务不会被执行
  */
  cancelHostCallback = function () {
    scheduledHostCallback = null;
    isMessageEventScheduled = false;
    timeoutTime = -1;
  };
}

export {
  ImmediatePriority as unstable_ImmediatePriority,
  UserBlockingPriority as unstable_UserBlockingPriority,
  NormalPriority as unstable_NormalPriority,
  IdlePriority as unstable_IdlePriority,
  LowPriority as unstable_LowPriority,
  unstable_runWithPriority,
  unstable_next,
  unstable_scheduleCallback,
  unstable_cancelCallback,
  unstable_wrapCallback,
  unstable_getCurrentPriorityLevel,
  unstable_shouldYield,
  unstable_continueExecution,
  unstable_pauseExecution,
  unstable_getFirstCallbackNode,
  getCurrentTime as unstable_now,
};
