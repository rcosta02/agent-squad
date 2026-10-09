// One entry per release worth announcing. Only the running version's entry is ever shown, once.
import kbEditor from './img/kb-editor.png'
import kbLinks from './img/kb-links.png'
import kbSearch from './img/kb-search.png'
import kbWrite from './img/kb-write.png'
import chat from './img/chat.png'

export type ReleaseNote = {
  version: string
  headline: string
  tagline: string
  hero: string // image url
  features: { title: string; text: string; image?: string }[]
  also?: string[]
}

export const NOTES: ReleaseNote[] = [
  {
    version: '0.2.0',
    headline: 'Your knowledge base, reimagined',
    tagline: 'The shared memory of your squad now reads and writes like Obsidian. Same fonts, same feel, zero setup.',
    hero: kbEditor,
    features: [
      {
        title: 'Write in live preview',
        text: 'Markdown that renders as you type. Headings, lists, checkboxes, tables and code look finished while the syntax stays one keystroke away.',
        image: kbWrite
      },
      {
        title: 'Links that know each other',
        text: 'Type [[ to link any page. Every page shows who mentions it, and renaming a page updates every link in the vault.',
        image: kbLinks
      },
      {
        title: 'Find anything instantly',
        text: '⌘O jumps to any page by name. ⌘⇧F searches every word in the vault. ⌘N starts a fresh page right where you are.',
        image: kbSearch
      },
      {
        title: 'Your agents keep up',
        text: 'Agents now link pages the same way you do, and their edits appear in your editor the moment they land. Every change is committed to git, nothing is ever lost.',
        image: chat
      }
    ],
    also: ['Long-running commands run in the background and show their progress in the chat.', 'Check for updates any time from your Profile.', 'Connected MCP servers no longer show as pending.']
  }
]

