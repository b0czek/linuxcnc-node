// Original file: proto/linuxcnc/v1/common.proto

import type { Position as _linuxcnc_v1_Position, Position__Output as _linuxcnc_v1_Position__Output } from '../../linuxcnc/v1/Position';

export interface ToolEntry {
  'toolNo'?: (number);
  'pocketNo'?: (number);
  'offset'?: (_linuxcnc_v1_Position | null);
  'wearOffset'?: (_linuxcnc_v1_Position | null);
  'diameter'?: (number | string);
  'frontAngle'?: (number | string);
  'backAngle'?: (number | string);
  'orientation'?: (number);
  'comment'?: (string);
  '_pocketNo'?: "pocketNo";
  '_diameter'?: "diameter";
  '_frontAngle'?: "frontAngle";
  '_backAngle'?: "backAngle";
  '_orientation'?: "orientation";
  '_comment'?: "comment";
}

export interface ToolEntry__Output {
  'toolNo'?: (number);
  'pocketNo'?: (number);
  'offset'?: (_linuxcnc_v1_Position__Output);
  'wearOffset'?: (_linuxcnc_v1_Position__Output);
  'diameter'?: (number);
  'frontAngle'?: (number);
  'backAngle'?: (number);
  'orientation'?: (number);
  'comment'?: (string);
  '_pocketNo'?: "pocketNo";
  '_diameter'?: "diameter";
  '_frontAngle'?: "frontAngle";
  '_backAngle'?: "backAngle";
  '_orientation'?: "orientation";
  '_comment'?: "comment";
}
