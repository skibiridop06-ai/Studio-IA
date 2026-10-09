/**
 * Preview dos efeitos na GPU (SkSL). Dados e export FFmpeg ficam em effectsData.ts.
 *
 * Um único shader com `kind` como seletor: compila uma vez e troca só uniforms.
 * Efeitos animados (tremor, zoom na batida, flash) leem `time` — o relógio do
 * vídeo — e usam exatamente a mesma matemática das expressões do FFmpeg.
 */
import { Skia } from '@shopify/react-native-skia';
import { FX_INDEX, type Effect } from './effectsData';
export * from './effectsData';

export const FX_SKSL = `
uniform shader image;
uniform float2 resolution;
uniform float kind;
uniform float amount;
uniform float p2;
uniform float time;
uniform float grain;
uniform float letterbox;
uniform float3 stop0;
uniform float3 stop1;
uniform float3 stop2;

float hash(float2 p) { return fract(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453); }
float luma(half3 c) { return dot(float3(c), float3(0.299, 0.587, 0.114)); }
half3 px(float2 p) { return image.eval(p).rgb; }

half4 fx(float2 xy) {
  float2 R = resolution;
  float2 C = R * 0.5;
  if (kind < 0.5) return image.eval(xy);
  if (kind < 1.5) { // rgbsplit
    half4 c = image.eval(xy);
    c.r = image.eval(xy + float2(-amount, 0)).r;
    c.b = image.eval(xy + float2(amount, 0)).b;
    return c;
  }
  if (kind < 2.5) { // vhs
    half4 c = image.eval(xy);
    c.r = image.eval(xy + float2(-amount, 0)).r;
    c.b = image.eval(xy + float2(amount, 0)).b;
    float line = mod(floor(xy.y), 3.0) < 1.0 ? 0.75 : 1.0;
    float n = (hash(xy + time) - 0.5) * 0.10;
    return half4(c.rgb * line + n, c.a);
  }
  if (kind < 3.5) { // pixelate
    return image.eval(floor(xy / amount) * amount + amount * 0.5);
  }
  if (kind < 4.5) { // posterize
    half4 c = image.eval(xy);
    float s = 256.0 / amount;
    return half4(floor(c.rgb * 255.0 / s) * s / 255.0, c.a);
  }
  if (kind < 5.5) { half4 c = image.eval(xy); return half4(1.0 - c.rgb, c.a); } // invert
  if (kind < 6.5) { return image.eval(float2(xy.x > C.x ? R.x - xy.x : xy.x, xy.y)); } // mirror
  if (kind < 7.5) { // scanlines
    half4 c = image.eval(xy);
    return half4(c.rgb * (mod(floor(xy.y), 3.0) < 1.0 ? (1.0 - amount) : 1.0), c.a);
  }
  if (kind < 8.5) { // shake: = scale(W+4a) + crop(2a + a·sin)
    float2 d = float2(2.0 * amount + amount * sin(37.0 * p2 * time), 2.0 * amount + amount * cos(29.0 * p2 * time));
    return image.eval((xy + d) * R / (R + 4.0 * amount));
  }
  if (kind < 9.5) { // zoom na batida
    float s = 1.0 + amount * abs(sin(time * 3.14159265 * p2));
    return image.eval(C + (xy - C) / s);
  }
  if (kind < 10.5) { // zoom lento
    float s = min(1.5, 1.0 + amount * time);
    return image.eval(C + (xy - C) / s);
  }
  if (kind < 11.5) { // flash / piscar
    half4 c = image.eval(xy);
    float on = mod(time, p2) < 0.08 ? 1.0 : 0.0;
    return half4(c.rgb + amount * on, c.a);
  }
  if (kind < 12.5) { // olho de peixe (mesma fórmula do lenscorrection)
    float2 d = xy - C;
    float r2 = dot(d, d) * 4.0 / dot(R, R);
    return image.eval(C + d * (1.0 + amount * r2 + p2 * r2 * r2));
  }
  if (kind < 14.5) { // contorno (sobel) / desenho
    float tl = luma(px(xy + float2(-1, -1))), t = luma(px(xy + float2(0, -1))), tr = luma(px(xy + float2(1, -1)));
    float l = luma(px(xy + float2(-1, 0))), r = luma(px(xy + float2(1, 0)));
    float bl = luma(px(xy + float2(-1, 1))), b = luma(px(xy + float2(0, 1))), br = luma(px(xy + float2(1, 1)));
    float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
    float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
    float m = smoothstep(0.12, 0.35, sqrt(gx * gx + gy * gy));
    return kind < 13.5 ? half4(half3(m), 1.0) : half4(half3(1.0 - m), 1.0);
  }
  if (kind < 16.5) { // relevo / nitidez (convolução 3x3)
    half3 s;
    if (kind < 15.5) {
      s = -2.0 * px(xy + float2(-1, -1)) - px(xy + float2(0, -1)) - px(xy + float2(-1, 0))
          + px(xy) + px(xy + float2(1, 0)) + px(xy + float2(0, 1)) + 2.0 * px(xy + float2(1, 1));
    } else {
      s = 5.0 * px(xy) - px(xy + float2(0, -1)) - px(xy + float2(-1, 0)) - px(xy + float2(1, 0)) - px(xy + float2(0, 1));
    }
    return half4(clamp(s, 0.0, 1.0), 1.0);
  }
  if (kind < 17.5) { // bloom: desfoque em anel + mistura "screen"
    half3 base = px(xy);
    half3 acc = half3(0);
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5235988;
      float2 o = float2(cos(a), sin(a));
      acc += px(xy + o * amount) + px(xy + o * amount * 0.5);
    }
    acc /= 24.0;
    return half4(1.0 - (1.0 - base) * (1.0 - acc), 1.0);
  }
  if (kind < 18.5) { // caleidoscópio
    return image.eval(float2(xy.x > C.x ? R.x - xy.x : xy.x, xy.y > C.y ? R.y - xy.y : xy.y));
  }
  if (kind < 19.5) { return image.eval(float2(xy.x, xy.y > C.y ? R.y - xy.y : xy.y)); } // espelho vertical
  // mapa de gradiente (3 cores)
  half4 c = image.eval(xy);
  float y = luma(c.rgb);
  float3 g = y < 0.5 ? mix(stop0, stop1, y * 2.0) : mix(stop1, stop2, (y - 0.5) * 2.0);
  return half4(half3(g), c.a);
}

half4 main(float2 xy) {
  half4 c = fx(xy);
  if (grain > 0.0) c.rgb += (hash(xy + fract(time) * 97.0) - 0.5) * grain * 2.0;
  if (letterbox > 0.5) {
    float bh = resolution.y * 0.11;
    if (xy.y < bh || xy.y > resolution.y - bh) c = half4(0, 0, 0, 1);
  }
  return c;
}
`;

export const FX_SHADER = Skia.RuntimeEffect.Make(FX_SKSL)!;

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

/** Uniforms do shader. `time` em segundos (relógio do vídeo). */
export const fxUniforms = (e: Effect, w: number, h: number, time = 0) => ({
  resolution: [w, h],
  kind: FX_INDEX[e.fx],
  amount: e.amount,
  p2: e.p2,
  time,
  grain: e.grain,
  letterbox: e.letterbox ? 1 : 0,
  stop0: rgb(e.stops[0]),
  stop1: rgb(e.stops[1]),
  stop2: rgb(e.stops[2]),
});

/** O efeito precisa do shader (algo além de cor/desfoque/vinheta)? */
export const needsShader = (e: Effect) => e.fx !== 'none' || e.grain > 0 || e.letterbox;
