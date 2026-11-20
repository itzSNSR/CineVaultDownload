/* CineVault landing page: static-hosting friendly, no dependencies. */
(function () {
  'use strict';

  var REPO = 'https://github.com/itzSNSR/CineVault';
  var APK_URL = REPO + '/releases/latest/download/CineVault.apk';
  /* version.json is the app's own update manifest and stays authoritative. */
  var VERSION_SOURCES = [
    'https://raw.githubusercontent.com/itzSNSR/CineVault/main/version.json',
    'https://cdn.jsdelivr.net/gh/itzSNSR/CineVault@main/version.json'
  ];
  var VERSION_PATTERN = /^\d+(\.\d+){0,3}(-[0-9A-Za-z.\-]{1,16})?$/;
  var MIN_ANDROID = 'Android 7.0 or newer';

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  setText(document.getElementById('year'), String(new Date().getFullYear()));

  /* Every Android button resolves through GitHub's stable latest-release URL,
     so publishing a new release needs no change here. */
  var apkLinks = document.querySelectorAll('.apk-link');
  for (var i = 0; i < apkLinks.length; i++) {
    apkLinks[i].setAttribute('href', APK_URL);
    apkLinks[i].setAttribute('rel', 'noopener noreferrer');
  }

  /* Mobile navigation */
  var toggle = document.querySelector('.menu-button');
  var menu = document.getElementById('mobile-menu');
  if (toggle && menu) {
    var header = toggle.closest ? toggle.closest('.site-header') : null;

    var setMenu = function (open, returnFocus) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      menu.hidden = !open;
      if (!open && returnFocus) toggle.focus();
    };

    toggle.addEventListener('click', function () {
      setMenu(menu.hidden === true);
    });

    menu.addEventListener('click', function (event) {
      var link = event.target && event.target.closest ? event.target.closest('a') : null;
      if (link) setMenu(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !menu.hidden) setMenu(false, true);
    });

    document.addEventListener('click', function (event) {
      if (!menu.hidden && header && event.target && !header.contains(event.target)) setMenu(false);
    });

    var desktop = window.matchMedia('(min-width: 751px)');
    var syncViewport = function (event) { if (event.matches) setMenu(false); };
    if (desktop.addEventListener) desktop.addEventListener('change', syncViewport);
    else if (desktop.addListener) desktop.addListener(syncViewport);
  }

  /* FAQ accordion: native <details> keeps it usable without this script. */
  var faqItems = document.querySelectorAll('.faq-list details');
  for (var f = 0; f < faqItems.length; f++) {
    faqItems[f].addEventListener('toggle', function () {
      if (!this.open) return;
      for (var j = 0; j < faqItems.length; j++) {
        if (faqItems[j] !== this) faqItems[j].open = false;
      }
    });
  }

  /* Motion: premium entrance and reveal system, applied from LottieFiles
     motion-design-skill. Content is only hidden once this script has opted in,
     so no-JS and reduced-motion visitors always get the static page. */
  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var revealItems = [];
  var revealQueued = false;

  function addReveal(el, delay) {
    el.classList.add('js-reveal');
    el.style.setProperty('--reveal-delay', String(delay));
    revealItems.push(el);
  }

  /* Geometry instead of IntersectionObserver: Chromium defers intersection
     notifications while the document is hidden, which could otherwise leave
     sections invisible when the page is opened in a background tab. */
  function revealInView() {
    revealQueued = false;
    if (reduceQuery.matches) return;
    var fold = (window.innerHeight || document.documentElement.clientHeight) * 0.92;
    for (var i = revealItems.length - 1; i >= 0; i--) {
      if (revealItems[i].getBoundingClientRect().top < fold) {
        revealItems[i].classList.add('is-in');
        revealItems.splice(i, 1);
      }
    }
  }

  function queueRevealCheck() {
    if (revealQueued || !revealItems.length) return;
    /* rAF is paused in background documents, so resolve immediately there. */
    if (document.hidden || !window.requestAnimationFrame) {
      revealInView();
      return;
    }
    revealQueued = true;
    window.requestAnimationFrame(revealInView);
  }

  function initMotion() {
    if (reduceQuery.matches) return;
    var stagger = window.innerWidth <= 750 ? 50 : 70;
    var groups = [
      ['.experience-grid', true],
      ['.feature-grid', true],
      ['.platform-grid', true],
      ['.faq-list', true],
      ['.section-topline', false],
      ['.section-heading-row', false],
      ['.features-heading', false],
      ['.platform-heading', false],
      ['.install-panel', false],
      ['.faq-container > div:first-child', false],
      ['.footer-upper', false],
      ['.footer-lower', false]
    ];

    groups.forEach(function (spec) {
      var nodes = document.querySelectorAll(spec[0]);
      Array.prototype.forEach.call(nodes, function (node) {
        if (!spec[1]) {
          addReveal(node, 0);
          return;
        }
        Array.prototype.forEach.call(node.children, function (child, index) {
          addReveal(child, index * stagger);
        });
      });
    });

    revealInView();
    window.addEventListener('scroll', queueRevealCheck, { passive: true });
    window.addEventListener('resize', queueRevealCheck);
    window.addEventListener('pageshow', revealInView);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) revealInView();
    });
  }

  initMotion();

  if (reduceQuery.addEventListener) {
    reduceQuery.addEventListener('change', function (event) {
      if (!event.matches) return;
      while (revealItems.length) revealItems.pop().classList.add('is-in');
    });
  }

  /* Latest version from version.json; the static markup stays accurate if the
     network, CORS or the manifest itself is unavailable. */
  var versionPill = document.getElementById('hero-version');
  var versionMeta = document.getElementById('latest-version');

  function applyVersion(manifest) {
    if (!manifest || typeof manifest.versionName !== 'string') return false;
    var version = manifest.versionName.trim().replace(/^v/i, '');
    if (!VERSION_PATTERN.test(version)) return false;
    setText(versionPill, 'v' + version);
    setText(versionMeta, 'Latest release: v' + version + ' · ' + MIN_ANDROID);
    for (var k = 0; k < apkLinks.length; k++) {
      apkLinks[k].setAttribute('data-version', version);
    }
    return true;
  }

  function fetchManifest(url) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error('timeout'));
      }, 7000);

      fetch(url, { cache: 'no-store' })
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        })
        .then(function (data) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(data);
        })
        .catch(function (error) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  if (window.fetch && window.Promise) {
    var trySource = function (index) {
      if (index >= VERSION_SOURCES.length) return;
      fetchManifest(VERSION_SOURCES[index])
        .then(function (manifest) {
          if (!applyVersion(manifest)) trySource(index + 1);
        })
        .catch(function () {
          trySource(index + 1);
        });
    };
    trySource(0);
  }
})();
