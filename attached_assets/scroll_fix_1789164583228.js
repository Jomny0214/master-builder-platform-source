/*
SCROLL-TO-TOP FIX — for the "Next Module" button

WHY THE PREVIOUS ATTEMPTS LIKELY FAILED:
1. If the page content sits inside a scrollable container (a <div> with its
   own overflow/scroll), calling window.scrollTo() does nothing — it needs
   to target that specific container instead.
2. If the scroll command runs immediately when the button is clicked, but
   the new module's content hasn't rendered yet, the scroll happens too
   early and gets visually overridden once the new (longer) content loads
   and pushes the page height back down.

THIS FIX HANDLES BOTH ISSUES:
- Scrolls the actual window AND checks for a scrollable container
- Waits one animation frame (after the browser has painted the new
  content) before scrolling, so it can't fire too early
*/

function scrollModuleToTop() {
  // Wait for the browser to finish rendering the new module's content
  // before attempting to scroll — this is what fixes the "fires too early" issue.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // 1. Scroll the main window (covers the most common case)
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

      // 2. ALSO check for a scrollable container and reset it directly.
      //    This covers the case where content lives inside a div with its
      //    own overflow-y: scroll / auto, which window.scrollTo() cannot reach.
      //    Try the most likely container selectors — adjust the selector
      //    below if your app uses a specific class/id for the content area.
      const possibleContainers = document.querySelectorAll(
        '[class*="content"], [class*="module"], [class*="lesson"], [class*="scroll"], main, #root, #app'
      );
      possibleContainers.forEach((el) => {
        if (el.scrollHeight > el.clientHeight) {
          el.scrollTop = 0;
        }
      });

      // 3. Also handle the <html> and <body> elements directly, since some
      //    browsers/frameworks put the actual scroll position there instead
      //    of on `window`.
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  });
}

/*
HOW TO WIRE THIS IN:

Find the function that runs when the "Next Module" (or "Next") button is
clicked — the one that loads the next module's content. Call
scrollModuleToTop() at the END of that function, AFTER the new module's
content has been set/rendered — not before.

Example pattern (adjust to match your actual code structure):

function goToNextModule() {
  // ...existing code that loads/sets the next module's content...
  setCurrentModule(nextModuleData);   // or however content gets updated

  scrollModuleToTop();  // <-- ADD THIS LINE, at the end, after content is set
}

If your app is React-based and content loads asynchronously (e.g., an API
call to fetch the next module), make sure scrollModuleToTop() is called
inside the .then() / after the async data has arrived and been rendered —
NOT immediately when the button is clicked, or it will fire before the
new content exists and get overridden.
*/
