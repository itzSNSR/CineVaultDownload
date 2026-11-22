/* ═══════════════════════════════════════════════════════════════════════════════
   WebGL Liquid Glass Cursor
   Adapted from StarKnightt/liquid-glass (https://github.com/StarKnightt/liquid-glass)
   for CineVault's live website.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Guards ────────────────────────────────────────────────────────────────
  var IS_TOUCH = !!(
    'ontouchstart' in window ||
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
    (window.DocumentTouch && document instanceof DocumentTouch)
  );
  var REDUCE = !!(
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  if (IS_TOUCH || REDUCE) {
    document.documentElement.classList.add('no-custom-cursor');
    return;
  }

  // ── Shaders from StarKnightt/liquid-glass ──────────────────────────────────
  var VERT = `#version 300 es
  void main() {
    // Fullscreen triangle covering viewport — no buffer uploads needed
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

  var FRAG = `#version 300 es
  precision highp float;
  precision highp int;

  uniform sampler2D uTex;         // page content texture
  uniform vec2      uRes;         // drawing buffer size in device px
  uniform float     uTime;        // elapsed time in seconds
  uniform float     uDpr;         // device pixel ratio
  uniform vec4      uLens;        // xy: lens center (device px), z: radius, w: press scale
  uniform vec4      uMotion;      // xy: velocity direction, z: stretch, w: wobble amplitude
  uniform float     uMag;         // magnification factor inside the lens
  uniform float     uRefract;     // refraction strength 0..1
  uniform float     uFrost;       // frosted blur 0..1
  uniform float     uHover;       // hover state 0..1
  uniform int       uRippleCount;
  uniform vec4      uRipples[8];  // xy: origin (device px), z: age s, w: amplitude

  out vec4 outColor;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Click ripples: travelling wave packet that displaces the sampling coordinate
  vec2 rippleOffset(vec2 frag) {
    vec2 off = vec2(0.0);
    for (int i = 0; i < 8; i++) {
      if (i >= uRippleCount) break;
      vec4 rp = uRipples[i];
      vec2 d = frag - rp.xy;
      float dist = max(length(d), 1.0);
      float front = rp.z * 520.0 * uDpr;            // wavefront distance
      float x = (dist - front) / (90.0 * uDpr);     // position inside packet
      float wave = sin(x * 6.2831) * exp(-x * x * 3.0);
      float atten = exp(-rp.z * 2.2) * exp(-dist / (900.0 * uDpr));
      off += (d / dist) * wave * atten * rp.w * 14.0 * uDpr;
    }
    return off;
  }

  vec3 bgAt(vec2 frag, vec2 roff) {
    vec2 uv = clamp((frag + roff) / uRes, 0.0, 1.0);
    return texture(uTex, uv).rgb;
  }

  void main() {
    vec2 frag = gl_FragCoord.xy;
    vec2 roff = rippleOffset(frag);
    float rlen = length(roff);

    vec2 lensC = uLens.xy;
    float R = uLens.z * uLens.w;

    // Lens-local coordinates, squashed along velocity direction so droplet stretches
    vec2 q = frag - lensC;
    vec2 dir = uMotion.xy;
    float stretch = uMotion.z;
    if (stretch > 0.001) {
      vec2 tangent = vec2(dir.y, -dir.x);
      float a = dot(q, dir) / (1.0 + stretch);
      float b = dot(q, tangent) * (1.0 + stretch * 0.5);
      q = dir * a + tangent * b;
    }

    // Organic rim wobble: low-order harmonic sines
    float ang = atan(q.y, q.x);
    float wob = uMotion.w * (
        0.030 * sin(ang * 3.0 + uTime * 2.1)
      + 0.022 * sin(ang * 5.0 - uTime * 3.3)
      + 0.014 * sin(ang * 7.0 + uTime * 4.7)
    ) + 0.006 * sin(ang * 2.0 + uTime * 0.8);

    float r = length(q);
    float Rw = R * (1.0 + wob);
    float d = r - Rw;
    float aa = 1.5 * uDpr;
    float inside = smoothstep(aa, -aa, d);

    // Soft drop shadow under the lens
    vec2 shq = frag - (lensC - vec2(0.0, R * 0.22));
    float shadow = smoothstep(R * 1.35, R * 0.55, length(shq)) * 0.22 * (1.0 - inside);

    // Outside the lens: shadow or ripple caustics, else 100% transparent
    if (inside <= 0.0) {
      if (shadow > 0.002) {
        outColor = vec4(0.0, 0.0, 0.0, shadow);
        return;
      }
      if (rlen > 0.25) {
        float waveH = smoothstep(0.0, 10.0 * uDpr, rlen);
        vec3 rippleCol = vec3(0.76, 0.68, 0.98) * waveH * 0.24;
        outColor = vec4(rippleCol, waveH * 0.18);
        return;
      }
      outColor = vec4(0.0);
      return;
    }

    // Glass dome 3D normal from SDF
    float r01 = clamp(r / Rw, 0.0, 1.0);
    float h = sqrt(max(1.0 - r01 * r01, 0.0));
    vec3 N = normalize(vec3(q / Rw, h * 1.15));

    // Optical magnification + ray bending toward rim
    vec2 mfrag = lensC + (frag - lensC) / uMag;
    float bend = 1.0 - h;
    vec2 refr = -N.xy * bend * uRefract * R * 0.88;
    float ca = 0.16 * uRefract; // chromatic aberration spread

    // 5-tap frosted blur kernel
    float frostR = uFrost * (0.25 + 0.75 * bend) * 8.0 * uDpr;
    vec2 taps[5] = vec2[5](
      vec2(0.0, 0.0), vec2(1.0, 0.3), vec2(-0.6, 0.9),
      vec2(-0.9, -0.5), vec2(0.5, -0.9)
    );

    vec3 acc = vec3(0.0);
    for (int i = 0; i < 5; i++) {
      vec2 o = taps[i] * frostR;
      acc.r += bgAt(mfrag + refr * (1.0 + ca) + o, roff).r;
      acc.g += bgAt(mfrag + refr + o, roff).g;
      acc.b += bgAt(mfrag + refr * (1.0 - ca) + o, roff).b;
    }
    vec3 glass = acc / 5.0;

    // Glass clarity & saturation pop
    float lum = dot(glass, vec3(0.299, 0.587, 0.114));
    glass = mix(vec3(lum), glass, 1.16);

    // Subtle amethyst glass body tint
    glass += vec3(0.02, 0.015, 0.04) * bend;

    // Lighting: key light glint from top-left
    vec3 L = normalize(vec3(-0.40, 0.55, 0.75));
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float ndh = max(dot(N, H), 0.0);
    float spec = pow(ndh, 85.0) * 0.68 + pow(ndh, 16.0) * 0.15;
    vec3 specCol = vec3(1.0, 0.98, 1.0) * spec;

    // Fresnel reflection: glowing rim at grazing angles
    float fres = pow(1.0 - max(N.z, 0.0), 2.2);
    vec3 fresnelCol = vec3(0.70, 0.60, 0.98) * fres * (0.35 + uHover * 0.20);

    // Meniscus boundary rim line
    float rimLine = smoothstep(aa * 2.2, 0.0, abs(d)) * (0.32 + uHover * 0.15);
    vec3 rimCol = vec3(0.95, 0.90, 1.0) * rimLine;

    // Combine glass optics
    vec3 glassRGB = glass + specCol + fresnelCol + rimCol;

    // Alpha blending: cleanly replaces unrefracted background inside lens
    float glassAlpha = inside * min(1.0, 0.96 + fres * 0.04);
    outColor = vec4(clamp(glassRGB, 0.0, 1.0) * glassAlpha, glassAlpha);
  }`;

  // ── Shader Helpers ────────────────────────────────────────────────────────
  function compileShader(gl, type, src) {
    var s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('LiquidGlass shader error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    var vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    var fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;

    var prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('LiquidGlass program link failed:', gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function isInteractive(el) {
    if (!el) return false;
    var t = el.tagName ? el.tagName.toLowerCase() : '';
    var cls = el.className ? String(el.className) : '';
    var role = el.getAttribute ? el.getAttribute('role') : '';
    return (
      t === 'a' ||
      t === 'button' ||
      t === 'summary' ||
      t === 'input' ||
      t === 'select' ||
      t === 'textarea' ||
      role === 'button' ||
      role === 'link' ||
      cls.indexOf('btn') !== -1 ||
      cls.indexOf('apk-link') !== -1 ||
      cls.indexOf('platform-link') !== -1 ||
      cls.indexOf('menu-button') !== -1
    );
  }

  // ── Precision DOM Page Rasterizer (with exact multiline text wrapping) ────
  function paintPageToCanvas(canvas, w, h, dpr) {
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. CineVault base midnight amethyst background
    ctx.fillStyle = '#090a10';
    ctx.fillRect(0, 0, w, h);

    // 2. Ambient hero glow radial blobs
    var g1 = ctx.createRadialGradient(
      w * 0.82, h * 0.18, 10,
      w * 0.82, h * 0.18, Math.max(w * 0.55, 450)
    );
    g1.addColorStop(0, 'rgba(105, 54, 175, 0.32)');
    g1.addColorStop(0.55, 'rgba(76, 19, 125, 0.08)');
    g1.addColorStop(1, 'rgba(9, 10, 16, 0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, w, h);

    var g2 = ctx.createRadialGradient(
      w * 0.12, h * 0.42, 10,
      w * 0.12, h * 0.42, Math.max(w * 0.45, 380)
    );
    g2.addColorStop(0, 'rgba(71, 30, 111, 0.16)');
    g2.addColorStop(1, 'rgba(9, 10, 16, 0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);

    // 3. Dot grid pattern
    ctx.fillStyle = 'rgba(173, 145, 235, 0.07)';
    for (var gx = 23; gx < w; gx += 46) {
      for (var gy = 23; gy < h; gy += 46) {
        ctx.beginPath();
        ctx.arc(gx, gy, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    var vh = window.innerHeight;
    var vw = window.innerWidth;

    // 4. Containers and Cards
    var containers = document.querySelectorAll(
      '.site-header, .experience-card, .feature, .platform-card, .install-panel, .floating-panel, .faq-list details'
    );
    for (var c = 0; c < containers.length; c++) {
      var cEl = containers[c];
      var cRect = cEl.getBoundingClientRect();
      if (cRect.bottom < 0 || cRect.top > vh || cRect.right < 0 || cRect.left > vw) continue;
      var cCs = window.getComputedStyle(cEl);
      if (cCs.display === 'none' || cCs.visibility === 'hidden') continue;

      ctx.save();
      ctx.fillStyle = 'rgba(24, 20, 34, 0.72)';
      ctx.strokeStyle = 'rgba(196, 181, 253, 0.20)';
      ctx.lineWidth = 1;
      var cr = parseFloat(cCs.borderRadius) || 16;
      roundRect(ctx, cRect.left, cRect.top, cRect.width, cRect.height, cr);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 5. Buttons
    var buttons = document.querySelectorAll('.btn, .platform-link, .apk-link');
    for (var b = 0; b < buttons.length; b++) {
      var bEl = buttons[b];
      var bRect = bEl.getBoundingClientRect();
      if (bRect.bottom < 0 || bRect.top > vh || bRect.right < 0 || bRect.left > vw) continue;
      var bCs = window.getComputedStyle(bEl);
      if (bCs.display === 'none' || bCs.visibility === 'hidden') continue;

      ctx.save();
      var bRadius = parseFloat(bCs.borderRadius) || 13;
      if (bEl.classList.contains('btn-primary')) {
        var bgGrad = ctx.createLinearGradient(bRect.left, bRect.top, bRect.right, bRect.bottom);
        bgGrad.addColorStop(0, '#9266ef');
        bgGrad.addColorStop(1, '#7548d8');
        ctx.fillStyle = bgGrad;
      } else {
        ctx.fillStyle = 'rgba(36, 28, 51, 0.85)';
        ctx.strokeStyle = 'rgba(196, 181, 253, 0.24)';
        ctx.lineWidth = 1;
      }
      roundRect(ctx, bRect.left, bRect.top, bRect.width, bRect.height, bRadius);
      ctx.fill();
      if (!bEl.classList.contains('btn-primary')) ctx.stroke();
      ctx.restore();
    }

    // 6. Text nodes with line-by-line wrapping accuracy
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var range = document.createRange();
    var node;

    while ((node = walker.nextNode())) {
      var fullStr = node.textContent ? node.textContent.trim() : '';
      if (!fullStr) continue;

      var parent = node.parentElement;
      if (!parent || parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') continue;
      if (parent.id === 'cv-liquid-glass-cursor') continue;

      var pcs = window.getComputedStyle(parent);
      if (pcs.display === 'none' || pcs.visibility === 'hidden' || parseFloat(pcs.opacity) < 0.05) continue;

      try {
        range.selectNodeContents(node);
        var rects = range.getClientRects();
        if (!rects || rects.length === 0) continue;

        ctx.save();
        var weight = pcs.fontWeight || '600';
        var size = pcs.fontSize || '15px';
        var fontFam = pcs.fontFamily || 'sans-serif';
        ctx.font = weight + ' ' + size + ' ' + fontFam;
        ctx.textBaseline = 'top';

        var fontPx = parseFloat(size) || 15;
        var yOff = Math.max(0, (rects[0].height - fontPx) * 0.35);
        var isGradient = parent.classList.contains('gradient-text') || (pcs.backgroundImage && pcs.backgroundImage.indexOf('gradient') !== -1);

        // Single line: direct render
        if (rects.length === 1) {
          var r0 = rects[0];
          if (r0.bottom >= 0 && r0.top <= vh && r0.right >= 0 && r0.left <= vw) {
            if (isGradient) {
              var tGrad = ctx.createLinearGradient(r0.left, r0.top, r0.left + r0.width, r0.top + r0.height);
              tGrad.addColorStop(0, '#eee4ff');
              tGrad.addColorStop(0.42, '#b899ff');
              tGrad.addColorStop(0.75, '#8b5cf6');
              tGrad.addColorStop(1.0, '#d1a8ff');
              ctx.fillStyle = tGrad;
            } else {
              ctx.fillStyle = pcs.color || '#f5f5f7';
            }
            ctx.fillText(fullStr, r0.left, r0.top + yOff);
          }
        } else {
          // Multiline text: measure words into exact wrapped lines
          var regex = /\S+/g;
          var match;
          var lineWords = [];
          var lineTop = -9999;
          var lineLeft = 0;

          if (isGradient) {
            ctx.fillStyle = '#b899ff';
          } else {
            ctx.fillStyle = pcs.color || '#f5f5f7';
          }

          while ((match = regex.exec(fullStr)) !== null) {
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            var wRect = range.getBoundingClientRect();
            if (Math.abs(wRect.top - lineTop) > 4) {
              if (lineWords.length > 0 && lineTop >= -50 && lineTop <= vh + 50) {
                ctx.fillText(lineWords.join(' '), lineLeft, lineTop + yOff);
              }
              lineTop = wRect.top;
              lineLeft = wRect.left;
              lineWords = [match[0]];
            } else {
              lineWords.push(match[0]);
            }
          }
          if (lineWords.length > 0 && lineTop >= -50 && lineTop <= vh + 50) {
            ctx.fillText(lineWords.join(' '), lineLeft, lineTop + yOff);
          }
        }

        ctx.restore();
      } catch (e) {}
    }

    ctx.restore();
  }

  // ── Main Initialization ───────────────────────────────────────────────────
  function start() {
    var DPR = Math.min(window.devicePixelRatio || 1, 2);

    // Fullscreen fixed overlay canvas
    var canvas = document.createElement('canvas');
    canvas.id = 'cv-liquid-glass-cursor';
    canvas.style.cssText =
      'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
      'pointer-events:none;z-index:2147483647;will-change:transform;';
    document.documentElement.appendChild(canvas);

    var gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      console.warn('LiquidGlass: WebGL2 not supported, falling back to default cursor.');
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      document.documentElement.classList.add('no-custom-cursor');
      return;
    }

    document.documentElement.classList.add('has-webgl2-cursor');

    var program = createProgram(gl, VERT, FRAG);
    if (!program) {
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      document.documentElement.classList.add('no-custom-cursor');
      return;
    }

    gl.useProgram(program);

    // Uniform locations
    var loc = function (name) { return gl.getUniformLocation(program, name); };
    var uTexLoc = loc('uTex');
    var uResLoc = loc('uRes');
    var uTimeLoc = loc('uTime');
    var uDprLoc = loc('uDpr');
    var uLensLoc = loc('uLens');
    var uMotionLoc = loc('uMotion');
    var uMagLoc = loc('uMag');
    var uRefractLoc = loc('uRefract');
    var uFrostLoc = loc('uFrost');
    var uHoverLoc = loc('uHover');
    var uRippleCountLoc = loc('uRippleCount');
    var uRipplesLoc = loc('uRipples[0]');

    // Page capture texture setup
    var texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(uTexLoc, 0);

    // Optical parameters from StarKnightt (tuned for high magnification & zoom)
    var LENS_RADIUS = 38;          // cursor droplet radius in CSS px
    var MAGNIFICATION = 1.25;      // 1.25x magnification zoom inside the lens!
    var REFRACTION = 0.58;         // Snell's law refraction strength
    var FROST = 0.10;              // clear glass with crisp boundary

    gl.uniform1f(uMagLoc, MAGNIFICATION);
    gl.uniform1f(uRefractLoc, REFRACTION);
    gl.uniform1f(uFrostLoc, FROST);

    // Alpha blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Offscreen canvas for page capture
    var pageCanvas = document.createElement('canvas');
    var textureDirty = true;

    function uploadPageTexture() {
      if (!textureDirty) return;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pageCanvas);
      textureDirty = false;
    }

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      var w = window.innerWidth || 1;
      var h = window.innerHeight || 1;
      canvas.width = Math.max(1, Math.round(w * DPR));
      canvas.height = Math.max(1, Math.round(h * DPR));
      gl.viewport(0, 0, canvas.width, canvas.height);
      paintPageToCanvas(pageCanvas, w, h, DPR);
      textureDirty = true;
      uploadPageTexture();
    }

    resize();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('scroll', function () {
      paintPageToCanvas(pageCanvas, window.innerWidth, window.innerHeight, DPR);
      textureDirty = true;
    }, { passive: true });

    // ── Simulation State (StarKnightt spring physics) ───────────────────────
    var px = canvas.width / 2;
    var py = canvas.height / 2;
    var vx = 0;
    var vy = 0;
    var tx = px;
    var ty = py;
    var dirX = 0;
    var dirY = 1;
    var stretch = 0;
    var wobble = 0;
    var wobbleVel = 0;
    var pressT0 = -10;
    var lastMove = -10;
    var pointerActive = false;
    var hover = 0;
    var hoverTarget = 0;

    var ripples = [];
    var rippleData = new Float32Array(8 * 4);

    var t0 = performance.now() / 1000;
    var prev = t0;
    var raf = 0;
    var isRunning = false;

    function toGl(clientX, clientY) {
      return [
        clientX * DPR,
        (window.innerHeight - clientY) * DPR
      ];
    }

    // ── Pointer Event Listeners ─────────────────────────────────────────────
    function onMove(e) {
      var coords = toGl(e.clientX, e.clientY);
      tx = coords[0];
      ty = coords[1];

      if (!pointerActive) {
        px = tx;
        py = ty;
      }
      pointerActive = true;
      lastMove = performance.now() / 1000;

      var el = document.elementFromPoint(e.clientX, e.clientY);
      hoverTarget = isInteractive(el) ? 1.0 : 0.0;

      if (!isRunning) wakeUp();
    }

    function onDown(e) {
      var coords = toGl(e.clientX, e.clientY);
      tx = coords[0];
      ty = coords[1];
      pointerActive = true;
      var now = performance.now() / 1000;
      lastMove = now;
      pressT0 = now;

      ripples.push({ x: coords[0], y: coords[1], t0: now, amp: 1.0 });
      if (ripples.length > 8) ripples.shift();

      if (!isRunning) wakeUp();
    }

    function onLeave() {
      pointerActive = false;
    }

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerleave', onLeave, { passive: true });

    // ── Frame Loop ──────────────────────────────────────────────────────────
    function frame() {
      var now = performance.now() / 1000;
      var dt = Math.min(Math.max(now - prev, 0.001), 0.05);
      prev = now;
      var time = now - t0;

      // Spring-follow target with liquid lag
      vx += (tx - px) * 130 * dt;
      vy += (ty - py) * 130 * dt;
      var damp = Math.exp(-14 * dt);
      vx *= damp;
      vy *= damp;
      px += vx * dt;
      py += vy * dt;

      var speed = Math.hypot(vx, vy);
      if (speed > 1) {
        dirX = vx / speed;
        dirY = vy / speed;
      }
      var stretchTarget = Math.min(speed / 4500, 0.42);
      stretch += (stretchTarget - stretch) * (1 - Math.exp(-12 * dt));

      // Underdamped wobble amplitude
      var wobbleTarget = Math.min(speed / 2200, 1);
      wobbleVel += (wobbleTarget - wobble) * 40 * dt;
      wobbleVel *= Math.exp(-4.2 * dt);
      wobble += wobbleVel * dt;
      wobble = Math.max(0, Math.min(wobble, 1.2));

      // Click press bounce
      var pressAge = now - pressT0;
      var press =
        pressAge < 1.2
          ? 1 - 0.16 * Math.exp(-pressAge * 9) * Math.cos(pressAge * 16)
          : 1;

      // Hover interpolation
      hover += (hoverTarget - hover) * 0.18;

      // Prune & pack ripples
      for (var r = ripples.length - 1; r >= 0; r--) {
        if (now - ripples[r].t0 > 3.0) ripples.splice(r, 1);
      }
      for (var k = 0; k < 8 * 4; k++) rippleData[k] = 0;
      for (var j = 0; j < ripples.length; j++) {
        var rp = ripples[j];
        rippleData[j * 4]     = rp.x;
        rippleData[j * 4 + 1] = rp.y;
        rippleData[j * 4 + 2] = now - rp.t0;
        rippleData[j * 4 + 3] = rp.amp;
      }

      var isMoving = speed > 0.5 || Math.hypot(tx - px, ty - py) > 0.5;
      var hasRipples = ripples.length > 0;
      var isPressing = pressAge < 1.2;
      var isWobbling = wobble > 0.005 || Math.abs(wobbleVel) > 0.005;

      uploadPageTexture();

      // Render WebGL
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.uniform2f(uResLoc, canvas.width, canvas.height);
      gl.uniform1f(uTimeLoc, time);
      gl.uniform1f(uDprLoc, DPR);
      var currentRadius = LENS_RADIUS * DPR * (1.0 + hover * 0.15);
      gl.uniform4f(uLensLoc, px, py, currentRadius, press);
      gl.uniform4f(uMotionLoc, dirX, dirY, stretch, wobble);
      gl.uniform1f(uHoverLoc, hover);
      gl.uniform1i(uRippleCountLoc, ripples.length);
      gl.uniform4fv(uRipplesLoc, rippleData);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (!isMoving && !hasRipples && !isPressing && !isWobbling && now - lastMove > 1.5) {
        isRunning = false;
        return;
      }

      raf = requestAnimationFrame(frame);
    }

    function wakeUp() {
      if (isRunning) return;
      isRunning = true;
      prev = performance.now() / 1000;
      raf = requestAnimationFrame(frame);
    }

    wakeUp();
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { passive: true });
})();
