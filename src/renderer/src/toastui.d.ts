// Minimal typings for the bits of @toast-ui/editor we use (its own types are not exported via package "exports").
declare module '@toast-ui/editor' {
  export default class Editor {
    constructor(opts: Record<string, unknown>)
    getMarkdown(): string
    setMarkdown(md: string, cursorToEnd?: boolean): void
    on(event: string, cb: () => void): void
    destroy(): void
  }
}
declare module '@toast-ui/editor/dist/toastui-editor.css'
declare module '@toast-ui/editor/dist/theme/toastui-editor-dark.css'
