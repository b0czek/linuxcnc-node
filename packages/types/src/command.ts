export type { LinuxCncCommand, LinuxCncCommandOf } from "./generated/commands";

/** Completion point requested from the LinuxCNC command queue. */
export type CommandWaitPolicy = "accepted" | "completed";
