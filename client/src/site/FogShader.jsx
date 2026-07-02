import { useEffect, useRef } from 'react';

// Процедурный туман: маленький WebGL-шейдер с fbm-noise, очень медленно течёт.
// Рендерится в НИЗКОМ разрешении (туман размытый — незаметно) и с троттлингом ~30fps —
// дёшево для GPU. Отдельный слой за 3D-сценой (Site.jsx включает его только на десктопе).
const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
const FRAG = `
precision mediump float;
uniform vec2 u_res; uniform float u_t;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.02; a *= 0.5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 q = uv * vec2(u_res.x / u_res.y, 1.0) * 2.4;
  float t = u_t * 0.012;                                  // очень медленное течение
  float n = fbm(q + vec2(t, t * 0.5) + fbm(q * 0.5 - t * 0.25));
  float m = smoothstep(0.32, 0.95, n);
  vec3 col = mix(vec3(0.40, 0.58, 0.86), vec3(0.72, 0.84, 1.0), m);
  gl_FragColor = vec4(col, m * 0.16);
}`;

export default function FogShader() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    let gl;
    try { gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false }); } catch { return; }
    if (!gl) return;

    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;   // шейдер не собрался — тихо выходим
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);  // fullscreen triangle
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uT = gl.getUniformLocation(prog, 'u_t');

    const SCALE = 0.4;   // низкое разрешение — туман размытый, рендер дешёвый
    const resize = () => {
      canvas.width = Math.max(2, Math.floor(window.innerWidth * SCALE));
      canvas.height = Math.max(2, Math.floor(window.innerHeight * SCALE));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0, last = 0;
    const loop = (ts) => {
      raf = requestAnimationFrame(loop);
      if (ts - last < 33) return;    // ~30 fps — туман медленный, чаще не нужно
      last = ts;
      gl.uniform1f(uT, ts * 0.001);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const onVis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf) raf = requestAnimationFrame(loop); };
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
    };
  }, []);
  return <canvas ref={ref} className="fog-shader" aria-hidden="true" />;
}
