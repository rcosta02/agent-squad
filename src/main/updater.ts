import { app, dialog } from 'electron'
import updater from 'electron-updater'

const { autoUpdater } = updater

/**
 * Silent auto-updates from GitHub Releases (repo from package.json "repository").
 * Downloads in the background, then offers a restart; declined updates still install on the next quit.
 */
export function startUpdater() {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('error', (e) => console.error('[updater]', e.message))
  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Update ready',
      message: `Agent Squad ${info.version} is ready to install.`,
      detail: 'Restart now to start using the latest version, or keep working and it installs when you quit.',
      buttons: ['Restart', 'Later'],
      defaultId: 0,
      cancelId: 1
    })
    if (response === 0) autoUpdater.quitAndInstall()
  })
  const check = () => autoUpdater.checkForUpdates().catch(() => {})
  check()
  setInterval(check, 60 * 60 * 1000) // ponytail: hourly poll is plenty
}
