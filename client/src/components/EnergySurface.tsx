import { useEffect, useRef } from "react";
import styles from "./EnergySurface.module.css";
import { useTheme } from "../lib/theme";

const vertex = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragment = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uVel;
  uniform vec2 uResolution;
  varying vec2 vUv;

  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float a = hash(i), b = hash(i + vec2(1.0,0.0)), c = hash(i + vec2(0.0,1.0)), d = hash(i + vec2(1.0,1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
  }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for(int i=0;i<4;i++){ v += a*noise(p); p *= 2.0; a *= 0.5; } return v; }

  void main(){
    vec2 uv = vUv;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 p = uv; p.x *= aspect;

    // Scroll velocity nudges the drift SPEED only. It never touches brightness, so a fast
    // scroll can no longer flash the layer.
    float t = uTime * (0.05 + uVel * 0.18);
    vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3 - t)));
    float f = fbm(p + 1.7 * q + vec2(t * 0.5, -t * 0.3));
    float bands = smoothstep(0.34, 0.78, f);
    vec3 lime = vec3(0.80, 1.0, 0.0);
    vec3 col = lime * bands;
    float mask = smoothstep(1.15, 0.15, distance(uv, vec2(0.80, 0.86)));
    float a = bands * mask * (0.18 + 0.04 * uVel);

    // Interleaved Gradient Noise (Jimenez): a zero-mean +/- 0.5 LSB dither that breaks up
    // 8-bit banding under the screen blend, with no visible texture.
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float d = (ign - 0.5) / 255.0;
    col += d;
    a = clamp(a + d, 0.0, 1.0);
    gl_FragColor = vec4(col, a);
  }
`;

export default function EnergySurface() {
  const host = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    // The shader is a dark-brand artifact. Under the paper "Drafting Table" theme the hero
    // is still, so we never spin up WebGL there (and tear it down when toggling to it).
    if (theme === "drafting") return;
    const el = host.current;
    if (!el || typeof window === "undefined") return;

    let disposed = false;
    const cleanups: Array<() => void> = [];

    // Raw, clamped scroll-velocity target. The render loop chases this with damping; the
    // scroll handler never jams the live value, so a single fast scroll can't punch a spike.
    let velTarget = 0;
    let lastY = window.scrollY;
    let lastT = performance.now();
    const onScroll = () => {
      const now = performance.now();
      const dy = Math.abs(window.scrollY - lastY);
      const dtMs = Math.max(16, now - lastT);
      velTarget = Math.min(1.0, (dy / dtMs) * 6);
      lastY = window.scrollY;
      lastT = now;
    };

    const start = async () => {
      if (disposed) return;
      let mod;
      try {
        mod = await import("ogl");
      } catch {
        return; // bundle/network issue: CSS fallback stays
      }
      if (disposed) return;
      const { Renderer, Program, Mesh, Triangle } = mod;

      let gl: import("ogl").OGLRenderingContext | undefined;
      try {
        const dpr = Math.min(1.5, Math.floor((window.devicePixelRatio || 1) * 2) / 2);
        const renderer = new Renderer({ alpha: true, dpr, powerPreference: "low-power" });
        gl = renderer.gl;
        gl.clearColor(0, 0, 0, 0);
        const canvas = gl.canvas as HTMLCanvasElement;
        canvas.className = styles.canvas;
        el.appendChild(canvas);

        const program = new Program(gl, {
          vertex,
          fragment,
          uniforms: { uTime: { value: 0 }, uVel: { value: 0 }, uResolution: { value: [1, 1] } },
        });
        const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

        const resize = () => {
          const r = el.getBoundingClientRect();
          renderer.setSize(r.width, r.height);
          program.uniforms.uResolution.value = [gl!.drawingBufferWidth, gl!.drawingBufferHeight];
        };
        resize();
        window.addEventListener("resize", resize);
        cleanups.push(() => window.removeEventListener("resize", resize));

        let raf = 0;
        let running = false;
        // Accumulate animation time from per-frame deltas, not the absolute rAF clock.
        // Pausing (IntersectionObserver / hidden tab) freezes time; resuming continues from
        // where it left off, so the field never teleports or flashes.
        let elapsed = 0;
        let lastFrame = 0;
        const loop = (now: number) => {
          if (lastFrame === 0) lastFrame = now;
          const dt = Math.min(0.05, (now - lastFrame) * 0.001); // clamp resume/jank slip
          lastFrame = now;
          elapsed += dt;
          program.uniforms.uTime.value = elapsed % 1000.0; // wrap: keep hash() in a stable range

          // frame-rate-independent exponential damping (same feel at 60 or 120 Hz)
          velTarget *= Math.exp(-3.0 * dt);
          const u = program.uniforms.uVel.value as number;
          program.uniforms.uVel.value = u + (velTarget - u) * (1 - Math.exp(-6.0 * dt));

          renderer.render({ scene: mesh });
          raf = requestAnimationFrame(loop);
        };
        const play = () => { if (!running) { running = true; lastFrame = 0; raf = requestAnimationFrame(loop); } };
        const pause = () => { if (running) { running = false; cancelAnimationFrame(raf); } };

        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const startMotion = () => {
          if (mq.matches) {
            renderer.render({ scene: mesh }); // one static frame, no loop
            return;
          }
          window.addEventListener("scroll", onScroll, { passive: true });
          cleanups.push(() => window.removeEventListener("scroll", onScroll));
          play();
        };
        startMotion();

        const onMotionPref = () => {
          if (mq.matches) { pause(); renderer.render({ scene: mesh }); }
          else play();
        };
        mq.addEventListener("change", onMotionPref);
        cleanups.push(() => mq.removeEventListener("change", onMotionPref));

        const io = new IntersectionObserver(
          ([e]) => (e.isIntersecting && !mq.matches ? play() : pause()),
          { threshold: 0 },
        );
        io.observe(el);
        const onVis = () => (document.hidden ? pause() : (!mq.matches && play()));
        document.addEventListener("visibilitychange", onVis);

        cleanups.push(() => {
          pause();
          io.disconnect();
          document.removeEventListener("visibilitychange", onVis);
          gl!.getExtension("WEBGL_lose_context")?.loseContext();
          canvas.remove();
        });
      } catch {
        if (gl) gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
    };

    // Defer until the browser is idle (after LCP). Reduced motion is handled inside start().
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const handle = ric ? ric(start, { timeout: 1600 }) : window.setTimeout(start, 900);

    return () => {
      disposed = true;
      if (ric) (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(handle as number);
      else window.clearTimeout(handle as number);
      cleanups.forEach((c) => c());
    };
  }, [theme]);

  return (
    <div className={styles.surface} aria-hidden="true">
      <div ref={host} className={styles.canvasHost} />
      <div className={styles.glow} />
      <div className={styles.grid} />
      <div className={styles.draftMark} />
    </div>
  );
}
