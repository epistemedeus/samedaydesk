import { useEffect, useRef } from "react";
import styles from "./EnergySurface.module.css";
import { prefersReducedMotion } from "../motion/gsap";

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
    float t = uTime * (0.05 + uVel * 0.30);
    vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3 - t)));
    float f = fbm(p + 1.7 * q + vec2(t * 0.5, -t * 0.3));
    float bands = smoothstep(0.34, 0.78, f);
    vec3 lime = vec3(0.80, 1.0, 0.0);
    vec3 col = lime * bands;
    float mask = smoothstep(1.15, 0.15, distance(uv, vec2(0.80, 0.86)));
    float a = bands * mask * (0.16 + 0.30 * uVel);
    gl_FragColor = vec4(col, a);
  }
`;

export default function EnergySurface() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const el = host.current;
    if (!el || typeof window === "undefined") return;

    let disposed = false;
    const cleanups: Array<() => void> = [];
    let vel = 0;
    let lastY = window.scrollY;
    let lastT = performance.now();

    const onScroll = () => {
      const now = performance.now();
      const dy = Math.abs(window.scrollY - lastY);
      const dt = Math.max(16, now - lastT);
      vel = Math.min(1.4, Math.max(vel, (dy / dt) * 7));
      lastY = window.scrollY;
      lastT = now;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    cleanups.push(() => window.removeEventListener("scroll", onScroll));

    const start = async () => {
      if (disposed) return;
      let mod;
      try {
        mod = await import("ogl");
      } catch {
        return; // bundle/network issue → CSS fallback stays
      }
      if (disposed) return;
      const { Renderer, Program, Mesh, Triangle } = mod;

      let gl: import("ogl").OGLRenderingContext | undefined;
      try {
        const renderer = new Renderer({
          alpha: true,
          dpr: Math.min(1.5, window.devicePixelRatio || 1),
          powerPreference: "low-power",
        });
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
        const loop = (t: number) => {
          program.uniforms.uTime.value = t * 0.001;
          const u = program.uniforms.uVel.value as number;
          program.uniforms.uVel.value = u + (vel - u) * 0.06;
          vel *= 0.92;
          renderer.render({ scene: mesh });
          raf = requestAnimationFrame(loop);
        };
        const play = () => { if (!running) { running = true; raf = requestAnimationFrame(loop); } };
        const pause = () => { if (running) { running = false; cancelAnimationFrame(raf); } };

        const io = new IntersectionObserver(([e]) => (e.isIntersecting ? play() : pause()), { threshold: 0 });
        io.observe(el);
        const onVis = () => (document.hidden ? pause() : play());
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

    // Defer until the browser is idle (after LCP).
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const handle = ric ? ric(start, { timeout: 1600 }) : window.setTimeout(start, 900);

    return () => {
      disposed = true;
      if (ric) (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(handle as number);
      else window.clearTimeout(handle as number);
      cleanups.forEach((c) => c());
    };
  }, []);

  return (
    <div className={styles.surface} aria-hidden="true">
      <div ref={host} className={styles.canvasHost} />
      <div className={styles.glow} />
      <div className={styles.grid} />
    </div>
  );
}
