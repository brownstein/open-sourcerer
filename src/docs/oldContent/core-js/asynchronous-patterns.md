# Asynchronous Patterns

Control when work happens over time: delays, intervals, callbacks, and async flows you’ll use for cooldowns, animations, and simulated network calls.

---

## Overview

| Concept | Quick Example | When You’ll Use It |
| --- | --- | --- |
| [Event Loop Basics](#Event%20Loop%20Basics) | `setTimeout(fn, 0)` | Understand execution order |
| [Timers: setTimeout and setInterval](#Timers:%20setTimeout%20and%20setInterval) | schedule/tick | Cooldowns and delays |
| [Clearing Timers and Cancellation](#Clearing%20Timers%20and%20Cancellation) | `clearTimeout/clearInterval` | Stop work safely |
| [Callbacks and Error-First Style](#Callbacks%20and%20Error-First%20Style) | `(err, data)` | Report success/failure |
| [Sequencing: Waterfall (Series)](#Sequencing:%20Waterfall%20(Series)) | step1->step2 | Ordered async steps |
| [Parallel with Completion Barrier](#Parallel%20with%20Completion%20Barrier) | counter barrier | Wait for many tasks |
| [Debounce and Throttle](#Debounce%20and%20Throttle) | gate rapid calls | Input smoothing |
| [XMLHttpRequest (XHR) Basics](#XMLHttpRequest%20(XHR)%20Basics) | GET with onreadystatechange | Remote data |
| [Retry with Backoff](#Retry%20with%20Backoff) | retry delays | Resilient fetch |
| [Async Error Handling Limits](#Async%20Error%20Handling%20Limits) | try/catch caveat | Correct handling location |
| [Animation Loops (requestAnimationFrame or Timers)](#Animation%20Loops%20(requestAnimationFrame%20or%20Timers)) | 3 frames | Smooth updates |
| [Simple Pub/Sub (Event Emitter)](#Simple%20Pub%2FSub%20(Event%20Emitter)) | on/emit/off | Decouple events |
| [Promises (Optional, if Supported)](#Promises%20(Optional,%20if%20Supported)) | `new Promise` | Modern async API |

Clicking an item will smooth-scroll to the section and briefly highlight it (same behavior as other subtabs).

---

## Event Loop Basics

**What it is:** The queue that schedules async callbacks after current synchronous work finishes.

**Why it matters:** Explains why `setTimeout(..., 0)` still runs later—useful for deferring heavy work.

**How to use:** Log sync vs async order; schedule minimal work in timers.

**Common Mistakes:**
- Expecting setTimeout(0) to run immediately
- Doing heavy work in the timer callback
- Depending on exact millisecond precision

**Try in code editor (A): order**
```js
console.log("sync: start");
setTimeout(function(){ console.log("async: timeout"); }, 0);
console.log("sync: end");
```

---

## Timers: setTimeout and setInterval

**What it is:** Schedule one-shot or repeated callbacks.

**Why it matters:** Drive cooldowns, periodic ticks, and delayed effects.

**How to use:** Keep callbacks short; capture and clear timer IDs when done.

**Common Mistakes:**
- Forgetting to clear intervals
- Assuming exact timing
- Mutating shared state from multiple timers

**Try in code editor (A): setTimeout**
```js
console.log("before schedule");
setTimeout(function(){ console.log("fired after delay"); }, 50);
console.log("after schedule");
```

**Try in code editor (B): setInterval (3 ticks)**
```js
var count = 0;
var id = setInterval(function(){
  count = count + 1;
  console.log("tick", count);
  if (count >= 3) { clearInterval(id); console.log("stopped"); }
}, 30);
```

---

## Clearing Timers and Cancellation

**What it is:** Stop scheduled callbacks from firing.

**Why it matters:** Prevents leaks and actions after a spell is cancelled.

**How to use:** Store timer IDs, clear them when no longer needed.

**Common Mistakes:**
- Losing the handle (ID)
- Clearing too late (callback already fired)
- Forgetting to guard callbacks with a cancelled flag

**Try in code editor (A): clearTimeout**
```js
var id = setTimeout(function(){ console.log("should not print"); }, 50);
clearTimeout(id);
console.log("timeout cleared");
```

**Try in code editor (B): clearInterval after N ticks**
```js
var ticks = 0;
var id = setInterval(function(){
  ticks = ticks + 1;
  if (ticks === 2) { clearInterval(id); console.log("interval cleared"); }
}, 20);
```

---

## Callbacks and Error-First Style

**What it is:** Async functions call back with `(err, data)`—err is null on success.

**Why it matters:** Standardizes success/error paths without throwing.

**How to use:** Always check `err` first; never call the callback more than once.

**Common Mistakes:**
- Invoking the callback multiple times
- Throwing inside async instead of passing error to callback
- Forgetting to guard completion with a flag

**Try in code editor (A): success**
```js
function asyncTask(cb){ setTimeout(function(){ cb(null, 42); }, 20); }
asyncTask(function(err, result){
  if (err) { console.log("error:", err); return; }
  console.log("result:", result);
});
```

**Try in code editor (B): error**
```js
function asyncTask(cb){ setTimeout(function(){ cb(new Error("fail")); }, 20); }
asyncTask(function(err, result){
  if (err) { console.log("handled error:", err.message); return; }
  console.log("result:", result);
});
```

---

## Sequencing: Waterfall (Series)

**What it is:** Run async tasks in order; each step starts when previous finishes.

**Why it matters:** Ensure dependencies (e.g., load -> process -> save).

**How to use:** Nest callbacks or factor helpers to keep it readable.

**Common Mistakes:**
- Starting next task before previous completes
- Not passing along needed data
- Missing error handling per step

**Try in code editor (A): step1->step2->step3**
```js
function step1(cb){ setTimeout(function(){ cb(null, 1); }, 10); }
function step2(x, cb){ setTimeout(function(){ cb(null, x + 1); }, 10); }
function step3(x, cb){ setTimeout(function(){ cb(null, x * 2); }, 10); }
step1(function(e, a){ if (e) return console.log(e);
  step2(a, function(e, b){ if (e) return console.log(e);
    step3(b, function(e, c){ if (e) return console.log(e);
      console.log("final:", c);
    });
  });
});
```

---

## Parallel with Completion Barrier

**What it is:** Launch multiple async tasks and continue when all are done.

**Why it matters:** Improves responsiveness when tasks are independent.

**How to use:** Use a counter or collector to detect when all callbacks fired.

**Common Mistakes:**
- Forgetting to handle errors from any task
- Double-decrementing the counter
- Mutating shared output unsafely

**Try in code editor (A): two tasks + barrier**
```js
var remaining = 2, a = null, b = null;
function done(){ remaining = remaining - 1; if (remaining === 0) console.log("all done:", {a:a,b:b}); }
setTimeout(function(){ a = "A"; console.log("task A done"); done(); }, 15);
setTimeout(function(){ b = "B"; console.log("task B done"); done(); }, 25);
```

---

## Debounce and Throttle

**What it is:** Debounce delays execution until calls stop; throttle limits calls per interval.

**Why it matters:** Smooths rapid inputs and protects performance.

**How to use:** Implement with timers and timestamps/flags.

**Common Mistakes:**
- Not clearing previous debounce timer
- Throttle that never fires trailing call
- Losing `this`/args (keep examples simple)

**Try in code editor (A): debounce**
```js
function debounce(fn, delay){
  var id = null;
  return function(){
    if (id) clearTimeout(id);
    id = setTimeout(function(){ fn(); }, delay);
  };
}
var d = debounce(function(){ console.log("debounced fired"); }, 20);
d(); d(); d(); // only last should fire
```

**Try in code editor (B): throttle**
```js
function throttle(fn, gap){
  var last = 0, pending = false;
  return function(){
    var now = Date.now();
    if (now - last >= gap){ last = now; fn(); }
  };
}
var t = throttle(function(){ console.log("throttled fired"); }, 30);
t(); t(); setTimeout(t, 35);
```

---

## XMLHttpRequest (XHR) Basics

**What it is:** Browser API for HTTP requests.

**Why it matters:** Fetch remote spell data or config.

**How to use:** Listen for `readystatechange`; check `readyState===4` and `status===200`.

**Common Mistakes:**
- Not handling errors/non-200 statuses
- Assuming network availability
- Parsing JSON without try/catch

**Try in code editor (A): GET (stub fallback)**
```js
if (typeof XMLHttpRequest === "function") {
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function(){
    if (xhr.readyState === 4){
      if (xhr.status === 200) { console.log("status 200, len:", xhr.responseText.length); }
      else { console.log("http error:", xhr.status); }
    }
  };
  xhr.open("GET", "/", true);
  xhr.send();
} else {
  // Fallback stub
  setTimeout(function(){ console.log("stub XHR success", { status: 200, body: "ok" }); }, 10);
}
```

---

## Retry with Backoff

**What it is:** Retry failed work with increasing delays.

**Why it matters:** Improves resilience against transient failures.

**How to use:** Track attempt count; backoff with `delay *= 2` up to a cap.

**Common Mistakes:**
- Infinite retries without a limit
- Not logging attempts
- Resetting delay incorrectly

**Try in code editor (A): exponential backoff**
```js
function attempt(max, delay){
  var tries = 0;
  function run(){
    tries = tries + 1;
    var ok = (tries === max);
    console.log("attempt", tries);
    if (ok) { console.log("success"); return; }
    setTimeout(run, delay);
    delay = delay * 2;
  }
  run();
}
attempt(3, 10);
```

---

## Async Error Handling Limits

**What it is:** try/catch does not capture errors thrown asynchronously.

**Why it matters:** You must handle errors inside callbacks.

**How to use:** Pass errors to callbacks or log inside async code.

**Common Mistakes:**
- Wrapping setTimeout in try/catch expecting to catch async throw
- Throwing instead of passing errors
- Dropping errors silently

**Try in code editor (A): try/catch caveat**
```js
try {
  setTimeout(function(){ throw new Error("async boom"); }, 10);
} catch (e) {
  console.log("will not catch async error");
}
setTimeout(function(){ console.log("handle error inside async instead"); }, 20);
```

---

## Animation Loops (requestAnimationFrame or Timers)

**What it is:** Repeated updates per frame or via timers.

**Why it matters:** Drive simple animations or periodic UI updates.

**How to use:** Use `requestAnimationFrame` if available; else timers.

**Common Mistakes:**
- Doing heavy work per frame
- Forgetting to stop loops when no longer needed
- Depending on exact intervals

**Try in code editor (A): 3 frames**
```js
var frames = 0;
function tick(){
  frames = frames + 1;
  console.log("frame", frames);
  if (frames < 3) schedule();
}
function schedule(){
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(tick);
  else setTimeout(tick, 16);
}
schedule();
```

---

## Simple Pub/Sub (Event Emitter)

**What it is:** Subscribers listen for events; emitters broadcast them.

**Why it matters:** Decouples systems (e.g., UI logs listening to combat events).

**How to use:** Implement minimal `on`, `off`, and `emit` in ES5.

**Common Mistakes:**
- Memory leaks by never unsubscribing
- Handler errors breaking other listeners
- Mutable handler lists during emit

**Try in code editor (A): minimal emitter**
```js
function Emitter(){ this._h = {}; }
Emitter.prototype.on = function(evt, fn){ (this._h[evt] = this._h[evt] || []).push(fn); };
Emitter.prototype.off = function(evt, fn){
  var a = this._h[evt] || []; for (var i=0;i<a.length;i++){ if (a[i]===fn){ a.splice(i,1); break; } }
};
Emitter.prototype.emit = function(evt){
  var a = this._h[evt] || []; for (var i=0;i<a.length;i++){ try{ a[i].apply(null, Array.prototype.slice.call(arguments,1)); } catch(e){ console.log("handler error:", e.message); } }
};
var em = new Emitter();
function onHit(d){ console.log("hit:", d); }
em.on("hit", onHit);
em.emit("hit", 10);
em.off("hit", onHit);
em.emit("hit", 5);
```

---

## Promises (Optional, if Supported)

**What it is:** A modern pattern for async results. Include only if available in runtime.

**Why it matters:** Simplifies chaining; otherwise stick to callbacks.

**How to use:** Feature-detect `Promise`; demonstrate basic resolve/reject.

**Common Mistakes:**
- Mixing callbacks and promises haphazardly
- Forgetting to handle rejections
- Assuming Promise exists in all environments

**Try in code editor (A): feature-detect**
```js
if (typeof Promise === "function") {
  new Promise(function(resolve){ setTimeout(function(){ resolve(7); }, 10); })
    .then(function(v){ console.log("promise value:", v); })
    .catch(function(e){ console.log("promise error:", e && e.message); });
} else {
  console.log("Promise not supported; skip example");
}
```

---

## Next Steps

- Revisit **Functions & Scope** for structuring async helpers.
- See **Control Flow** for composing loops and guards around timers/callbacks.

By using small, reliable async patterns, your spells will feel responsive and stable.

# asynchronous patterns

_Add documentation content here._
