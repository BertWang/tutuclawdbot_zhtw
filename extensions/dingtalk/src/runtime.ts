/**
 * DingTalk runtime singleton
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dingtalkRuntime: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setDingtalkRuntime(runtime: any): void {
  dingtalkRuntime = runtime;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDingtalkRuntime(): any {
  if (!dingtalkRuntime) {
    throw new Error("DingTalk runtime not initialized");
  }
  return dingtalkRuntime;
}
