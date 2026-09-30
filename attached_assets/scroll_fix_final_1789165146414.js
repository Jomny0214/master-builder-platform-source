/*
SCROLL-TO-TOP FIX — FINAL, TARGETED VERSION

CONFIRMED: the page content scrolls inside a specific div with
id="course-top" (also has the attribute data-course-scroll-container).
This div has "overflow-y-auto" — meaning IT scrolls internally, not
the browser window. This is exactly why previous fixes using
window.scrollTo() did nothing — the window was never the thing
scrolling in the first place.
*/

function scrollCourseToTop() {
  requestAnimationFrame(() => {
    const scrollContainer = document.getElementById('course-top');
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }
  });
}

/*
HOW TO WIRE THIS IN:

Find the `next` function — the one called by the "Next"/"Continue"
button (onClick={next}). Add a single line calling
scrollCourseToTop() at the very end of that function, after whatever
code updates which module/quiz/section is currently being shown.

Example — if `next` looks something like this:

function next() {
  // ...existing logic that changes module/section state...
  setCurrentModuleIndex(currentModuleIndex + 1);
  setIsQuiz(false);
}

Add the new line at the end, like this:

function next() {
  // ...existing logic that changes module/section state...
  setCurrentModuleIndex(currentModuleIndex + 1);
  setIsQuiz(false);

  scrollCourseToTop();   // <-- ADD THIS LINE, at the very end
}

This targets the exact confirmed scroll container (#course-top)
directly by its real ID, instead of guessing at possible container
classes — this should now actually work.
*/
