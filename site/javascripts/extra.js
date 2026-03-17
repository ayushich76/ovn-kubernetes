/**
 * Copy heading anchor URL to clipboard when the permalink is clicked.
 * The full page URL (including hash) is copied so the link is shareable.
 */

(function () {
  function getFullUrl(anchor) {
    var href = anchor.getAttribute("href");
    if (!href || href.charAt(0) !== "#") return null;
    return window.location.origin + window.location.pathname + href;
  }

  function copyToClipboard(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    var sel = document.getSelection();
    var range = document.createRange();
    var el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "absolute";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand("copy");
      done();
    } catch (e) {}
    document.body.removeChild(el);
    if (sel && sel.rangeCount) sel.removeAllRanges();
  }

  function showCopiedTip(anchor) {
    var msg = "Link copied!";
    var tip = document.createElement("span");
    tip.setAttribute("class", "ok-copy-tip");
    tip.setAttribute("aria-live", "polite");
    tip.textContent = msg;
    anchor.style.position = "relative";
    anchor.appendChild(tip);
    setTimeout(function () {
      if (tip.parentNode) tip.parentNode.removeChild(tip);
    }, 1600);
  }

  function handleClick(ev) {
    var anchor = ev.target.closest && ev.target.closest(".headerlink");
    if (!anchor) {
      var inHeading = ev.target.closest && ev.target.closest(".md-typeset h1, .md-typeset h2, .md-typeset h3, .md-typeset h4, .md-typeset h5, .md-typeset h6");
      if (inHeading && ev.target.tagName === "A" && ev.target.getAttribute("href") && ev.target.getAttribute("href").charAt(0) === "#") {
        anchor = ev.target;
      }
    }
    if (!anchor) return;
    ev.preventDefault();
    ev.stopPropagation();
    var url = getFullUrl(anchor);
    if (!url) return;
    copyToClipboard(url, function () {
      showCopiedTip(anchor);
    });
  }

  document.addEventListener("click", handleClick, true);
})();
