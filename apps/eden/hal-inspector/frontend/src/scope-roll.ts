import type { ScopeCaptureDelta } from "@linuxcnc-node/types";
import type { ScopeRollFrame } from "../../shared/protocol";

export interface RollAppendResult {
  reset: boolean;
  start: number;
  samples: number;
  channels: Array<Float64Array | null>;
  previous: Array<number | null>;
}

export class ScopeRollBuffer {
  capacity = 0;
  length = 0;
  head = 0;
  sequence = 0;
  samplePeriodNs = 0;
  generation = -1;
  channels: Array<Float64Array | null> = [];

  clear(): void {
    this.capacity = 0;
    this.length = 0;
    this.head = 0;
    this.sequence = 0;
    this.samplePeriodNs = 0;
    this.generation = -1;
    this.channels = [];
  }

  apply(frame: ScopeRollFrame): RollAppendResult {
    const { batch } = frame;
    const reset =
      batch.reset ||
      frame.generation !== this.generation ||
      batch.capacity !== this.capacity ||
      batch.samplePeriodNs !== this.samplePeriodNs ||
      batch.sequence !== this.sequence + batch.samples;
    if (reset) this.reset(frame.generation, batch);
    const start = this.head;
    const count = Math.min(batch.samples, this.capacity);
    const sourceOffset = batch.samples - count;
    const previous: Array<number | null> = Array(batch.channels.length).fill(
      null,
    );
    for (let channel = 0; channel < batch.channels.length; channel++) {
      const source = batch.channels[channel];
      if (!source) continue;
      let target = this.channels[channel];
      if (!target) {
        target = new Float64Array(this.capacity);
        this.channels[channel] = target;
      }
      previous[channel] = this.length
        ? target[(start - 1 + this.capacity) % this.capacity]
        : source[sourceOffset];
      for (let sample = 0; sample < count; sample++)
        target[(start + sample) % this.capacity] =
          source[sourceOffset + sample];
    }
    this.head = (start + count) % this.capacity;
    this.length = Math.min(this.capacity, this.length + count);
    this.sequence = batch.sequence;
    return {
      reset,
      start,
      samples: count,
      channels: batch.channels.map((channel) =>
        channel ? channel.subarray(sourceOffset) : null,
      ),
      previous,
    };
  }

  valueAt(channel: number, time: number, phase: number): number | null {
    const values = this.channels[channel];
    if (!values || !this.length || !this.samplePeriodNs) return null;
    const fromLatest = Math.round(-time / (this.samplePeriodNs / 1e9) - phase);
    if (fromLatest < 0 || fromLatest >= this.length) return null;
    const latest = (this.head - 1 + this.capacity) % this.capacity;
    return values[(latest - fromLatest + this.capacity) % this.capacity];
  }

  private reset(generation: number, batch: ScopeCaptureDelta): void {
    this.capacity = Math.max(1, batch.capacity);
    this.length = 0;
    this.head = 0;
    this.sequence = batch.sequence - batch.samples;
    this.samplePeriodNs = batch.samplePeriodNs;
    this.generation = generation;
    this.channels = batch.channels.map((channel) =>
      channel ? new Float64Array(this.capacity) : null,
    );
  }
}

interface RollLine {
  channel: number;
  type: string | null;
  buffer: WebGLBuffer;
}

export interface RollLineTransform {
  scale: number;
  offset: number;
  color: readonly [number, number, number, number];
}

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in float a_value;
uniform int u_start;
uniform int u_count;
uniform int u_capacity;
uniform float u_phase;
uniform bool u_step;
uniform float u_y_scale;
uniform float u_y_offset;
uniform vec2 u_x_transform;
void main() {
  float denominator = float(max(1, u_capacity - 1));
  float logical = u_step
    ? floor(float(gl_VertexID - u_start) / 2.0)
    : float(gl_VertexID - u_start);
  float x = 1.0 + 2.0 * (logical - float(u_count - 1) - u_phase) / denominator;
  x = x * u_x_transform.x + u_x_transform.y;
  gl_Position = vec4(x, a_value * u_y_scale + u_y_offset, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 outColor;
void main() { outColor = u_color; }`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create roll shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message =
      gl.getShaderInfoLog(shader) || "Unable to compile roll shader";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

export class ScopeRollRenderer {
  private readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private lines: RollLine[] = [];
  private capacity = 0;
  private readonly uniforms: Record<string, WebGLUniformLocation | null> = {};

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error("Unable to create roll program");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message =
        gl.getProgramInfoLog(program) || "Unable to link roll program";
      gl.deleteProgram(program);
      throw new Error(message);
    }
    this.program = program;
    for (const name of [
      "u_start",
      "u_count",
      "u_capacity",
      "u_phase",
      "u_step",
      "u_y_scale",
      "u_y_offset",
      "u_color",
      "u_x_transform",
    ])
      this.uniforms[name] = gl.getUniformLocation(program, name);
  }

  configure(
    capacity: number,
    channels: Array<{ channel: number; type: string | null }>,
  ): void {
    this.lines.forEach((line) => {
      this.gl.deleteBuffer(line.buffer);
    });
    this.lines = [];
    this.capacity = capacity;
    for (const channel of channels) {
      const buffer = this.gl.createBuffer();
      if (!buffer) throw new Error("Unable to allocate roll buffer");
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
      this.gl.bufferData(
        this.gl.ARRAY_BUFFER,
        capacity *
          (channel.type === "bit" ? 4 : 2) *
          Float32Array.BYTES_PER_ELEMENT,
        this.gl.DYNAMIC_DRAW,
      );
      this.lines.push({ ...channel, buffer });
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
  }

  append(result: RollAppendResult): void {
    if (!result.samples || !this.capacity) return;
    for (const line of this.lines) {
      const source = result.channels[line.channel];
      if (!source) continue;
      const pointsPerSample = line.type === "bit" ? 2 : 1;
      let values: Float32Array;
      if (pointsPerSample === 2) {
        values = new Float32Array(source.length * 2);
        let previous = result.previous[line.channel] ?? source[0];
        for (let index = 0; index < source.length; index++) {
          values[index * 2] = previous;
          values[index * 2 + 1] = source[index];
          previous = source[index];
        }
      } else values = Float32Array.from(source);
      const bufferCapacity = this.capacity * pointsPerSample;
      const start = result.start * pointsPerSample;
      this.write(line.buffer, start, values, bufferCapacity * 2);
      this.write(
        line.buffer,
        start + bufferCapacity,
        values,
        bufferCapacity * 2,
      );
      const overflow = start + values.length - bufferCapacity;
      if (overflow > 0) {
        const wrapped = values.subarray(values.length - overflow);
        this.write(line.buffer, 0, wrapped, bufferCapacity * 2);
        this.write(line.buffer, bufferCapacity, wrapped, bufferCapacity * 2);
      }
    }
  }

  sync(source: ScopeRollBuffer): void {
    if (source.capacity !== this.capacity) return;
    for (const line of this.lines) {
      const channel = source.channels[line.channel];
      if (!channel) continue;
      const pointsPerSample = line.type === "bit" ? 2 : 1;
      const values = new Float32Array(this.capacity * pointsPerSample * 2);
      for (let slot = 0; slot < this.capacity; slot++) {
        if (pointsPerSample === 2) {
          const first = source.length === source.capacity ? source.head : 0;
          values[slot * 2] =
            slot === first
              ? channel[slot]
              : channel[(slot - 1 + this.capacity) % this.capacity];
          values[slot * 2 + 1] = channel[slot];
          values[(slot + this.capacity) * 2] = values[slot * 2];
          values[(slot + this.capacity) * 2 + 1] = values[slot * 2 + 1];
        } else {
          values[slot] = channel[slot];
          values[slot + this.capacity] = channel[slot];
        }
      }
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, line.buffer);
      this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, values);
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
  }

  draw(
    head: number,
    count: number,
    phase: number,
    transforms: Map<number, RollLineTransform>,
    xTransform: readonly [number, number],
  ): void {
    if (!this.program || count < 2) return;
    const full = count === this.capacity;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform1i(this.uniforms.u_count, count);
    gl.uniform1i(this.uniforms.u_capacity, this.capacity);
    gl.uniform1f(this.uniforms.u_phase, phase);
    gl.uniform2f(this.uniforms.u_x_transform, xTransform[0], xTransform[1]);
    for (const line of this.lines) {
      const transform = transforms.get(line.channel);
      if (!transform) continue;
      const pointsPerSample = line.type === "bit" ? 2 : 1;
      const start = (full ? head : 0) * pointsPerSample;
      gl.uniform1i(this.uniforms.u_start, start);
      gl.uniform1i(this.uniforms.u_step, pointsPerSample === 2 ? 1 : 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, line.buffer);
      gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);
      gl.uniform1f(this.uniforms.u_y_scale, transform.scale);
      gl.uniform1f(this.uniforms.u_y_offset, transform.offset);
      gl.uniform4fv(this.uniforms.u_color, transform.color);
      gl.drawArrays(gl.LINE_STRIP, start, count * pointsPerSample);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  cleanup(): void {
    this.lines.forEach((line) => {
      this.gl.deleteBuffer(line.buffer);
    });
    this.lines = [];
    if (this.program) this.gl.deleteProgram(this.program);
    this.program = null;
  }

  private write(
    buffer: WebGLBuffer,
    start: number,
    values: Float32Array,
    bufferLength: number,
  ): void {
    const available = bufferLength - start;
    if (available <= 0 || !values.length) return;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferSubData(
      this.gl.ARRAY_BUFFER,
      start * Float32Array.BYTES_PER_ELEMENT,
      values.subarray(0, available),
    );
  }
}
