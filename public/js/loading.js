// Mathfall loading screen. A plain script (not a module), loaded first thing in <body> so the screen is up before
// the game's modules start downloading art. It counts every image and art/sound file the page asks for, so the bar
// shows real files, not a guess.
//
//   <script src="/js/loading.js" data-mode="host"></script>   teacher page: hides once host.js is running
//   <script src="/js/loading.js" data-mode="play"></script>   student page: shown only in the solo test game
//                                                             (?test=1), and waits until every file has loaded
// The page calls MF_Loading.ready() when its own code is set up.
(function () {
  const script = document.currentScript;
  const mode = (script && script.dataset.mode) || 'host';
  const params = new URLSearchParams(location.search);
  const isTest = !!params.get('test');
  const show = mode === 'host' || (mode === 'play' && isTest);
  const waitAll = mode === 'play';     // the test game jumps straight into battle, so it needs every sheet and sound
  const SLOW_MS = 15000, GIVE_UP_MS = 60000, QUIET_MS = 400;

  const GEM = '<svg viewBox="0 0 32 32" aria-hidden="true"><g class="spin"><path d="M16 2 L28 16 L16 30 L4 16 Z" fill="#e8b85a"/>' +
    '<path d="M16 2 L28 16 L16 16 Z" fill="#ffe2a0"/><path d="M16 8 L22 16 L16 24 L10 16 Z" fill="#1d2c5e"/></g></svg>';
  const TIPS = [
    'Every Attack, Defend and skill fires only on a correct answer.',
    'A wrong answer is a miss: the hero swings and whiffs.',
    'Tap a teammate to guard or heal them.',
    'Elites and bosses telegraph quick-time attacks. Answer fast to dodge.',
    'Focus questions make your next attack 30% stronger.',
    'Break the crystals before the boss charges its storm.'
  ];
  function markup(sub) {
    return '<div class="ml-box" role="status" aria-live="polite">' +
      '<div class="ml-gem">' + GEM + '</div>' +
      '<div class="ml-logo">Mathfall</div>' +
      '<div class="ml-sub">' + sub + '</div>' +
      '<div class="ml-bar"><div class="ml-fill"></div></div>' +
      '<div class="ml-row"><span class="ml-what">Getting ready…</span><span class="ml-num"></span></div>' +
      '<div class="ml-tip"></div>' +
      '<button type="button" class="ml-skip">Continue anyway</button>' +
      '</div>';
  }

  // ---------------- what is loading: images and fetched art/sound files
  let total = 0, done = 0, lastChange = 0, lastLabel = 'Getting ready…';
  const kindOf = url => {
    const u = String(url);
    if (/\/sfx\//.test(u)) return 'Sound effects';
    if (/\/art\/fx\//.test(u)) return 'Spell effects';
    if (/\/art\/bg\//.test(u)) return 'The dungeon';
    if (/\/art\/events\//.test(u)) return 'Event pictures';
    if (/_(slash|smite|shoot|cast|chant|defend|pray|power|combo|meteor|quake|resolve|leap|victory|guard|ward|rally|channel|evade|volley)\b/.test(u)) return 'Hero moves';
    if (/\/art\//.test(u)) return 'Heroes and monsters';
    return 'Getting ready…';
  };
  const tracked = url => url && !/^(data|blob):/.test(String(url));
  function begin(url) { total++; lastChange = performance.now(); lastLabel = kindOf(url); paint(); }
  function finish() { done++; lastChange = performance.now(); paint(); check(); }

  if (show) {
    // every `new Image()` on the page: count it from the moment its src is set until it loads or fails
    const NativeImage = window.Image;
    const srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    const TrackedImage = function (w, hgt) {
      const im = arguments.length ? new NativeImage(w, hgt) : new NativeImage();
      let counted = false;
      Object.defineProperty(im, 'src', {
        configurable: true,
        get() { return srcDesc.get.call(im); },
        set(v) {
          if (!counted && tracked(v)) {
            counted = true; begin(v);
            const end = () => { im.removeEventListener('load', end); im.removeEventListener('error', end); finish(); };
            im.addEventListener('load', end); im.addEventListener('error', end);
          }
          srcDesc.set.call(im, v);
        }
      });
      return im;
    };
    TrackedImage.prototype = NativeImage.prototype;
    window.Image = TrackedImage;
    // fetched art and sounds (manifests, .wav files): count until the whole body has arrived
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input && input.url;
      const p = nativeFetch(input, init);
      if (!stopped && tracked(url) && /\/(art|sfx)\//.test(url)) {
        begin(url);
        p.then(r => r.clone().arrayBuffer()).catch(() => {}).then(finish);
      }
      return p;
    };
  }

  // ---------------- the screen
  let el = null, fill = null, what = null, num = null, shown = 0, ready = false, stopped = !show, fontsOk = false;
  const t0 = performance.now();
  function mount() {
    if (!show || el) return;
    el = document.createElement('div');
    el.id = 'mfLoad';
    el.innerHTML = markup(mode === 'host' ? 'Teacher' : 'Test game');
    document.body.appendChild(el);
    fill = el.querySelector('.ml-fill'); what = el.querySelector('.ml-what'); num = el.querySelector('.ml-num');
    el.querySelector('.ml-skip').addEventListener('click', hide);
    let tip = Math.floor(Math.random() * TIPS.length);
    const tipEl = el.querySelector('.ml-tip');
    const nextTip = () => { tipEl.textContent = TIPS[tip++ % TIPS.length]; };
    nextTip(); el._tips = setInterval(nextTip, 4500);
    paint();
  }
  function paint() {
    if (!el || stopped) return;
    // never runs backwards when more files are found; the last few percent wait for the page itself
    const frac = total ? done / total : 0;
    const target = Math.min(ready ? 1 : 0.94, frac * (ready || waitAll ? 1 : 0.94));
    shown = Math.max(shown, target);
    fill.style.width = (shown * 100).toFixed(1) + '%';
    what.textContent = done >= total && ready ? 'Ready!' : lastLabel;
    num.textContent = total ? `${Math.round(shown * 100)}% · ${done}/${total} files` : '';
  }
  function check() {
    if (stopped || !ready) return;
    if (!waitAll) return hide();
    if (done < total || !fontsOk) return;
    // wait a moment in case loading one file starts another (e.g. a manifest, then its sheets)
    const quiet = performance.now() - lastChange;
    if (quiet < QUIET_MS) { setTimeout(check, QUIET_MS - quiet + 20); return; }
    if (done >= total) hide();
  }
  function hide() {
    if (stopped && !el) return;
    stopped = true;
    if (!el) return;
    shown = 1; fill.style.width = '100%'; what.textContent = 'Ready!';
    clearInterval(el._tips);
    const node = el; el = null;
    setTimeout(() => { node.classList.add('out'); setTimeout(() => node.remove(), 500); }, 150);
  }

  if (show) {
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => { fontsOk = true; check(); });
    setTimeout(() => { if (el) el.classList.add('slow'); }, SLOW_MS);
    setTimeout(hide, GIVE_UP_MS);
  }

  window.MF_Loading = {
    // the page's own code is set up (host: the setup screen works; test game: joined and showing the hero picker)
    ready() { if (ready) return; ready = true; paint(); check(); },
    hide,
    markup,
    get active() { return !stopped; },
    stats: () => ({ total, done, ms: Math.round(performance.now() - t0) })
  };
})();
