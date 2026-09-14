import { app } from 'electron'
import updater from 'electron-updater'

const { autoUpdater } = updater

/**
 * Silent forced updates from GitHub Releases (repo from package.json "repository").
 * Downloads in the background; installs when the user quits, so the next launch is the new version.
 */
export function startUpdater() {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('error', (e) => console.error('[updater]', e.message))
  const check = () => autoUpdater.checkForUpdates().catch(() => {})
  check()
  setInterval(check, 60 * 60 * 1000) // ponytail: hourly poll is plenty; no dialog, quit + reopen applies it
}
