// Lo poco que usa src/server/app/markdown.ts de jsdom (viene con @blocknote/server-util,
// sin tipos propios instalados).
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string);
    window: Window & typeof globalThis;
  }
}
