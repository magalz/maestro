export const mode: "sealed-task-fixture" = "sealed-task-fixture";
export function apply(ctx: { provide(key: string, value: unknown): void }) { ctx.provide("externalClientActivated", mode); }
