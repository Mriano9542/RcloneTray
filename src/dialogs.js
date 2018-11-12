'use strict'

const path = require('path')
const { shell, app, BrowserWindow, Menu, dialog } = require('electron')
const electronContextMenu = require('electron-context-menu')
const isDev = require('electron-is-dev')

/**
 * Dialog names that should be opened with single instances
 * @type {{}}
 * @private
 */
const dialogsSingletoneInstances = {}

/**
 * Simple factory for the dialogs
 * @param {string} dialogName
 * @param {{}} options
 * @param {{}} props
 * @returns {BrowserWindow}
 * @private
 */
const createNewDialog = function (dialogName, options, props) {
  // Use $singleId options property with special meaning of not allowing,
  // dialog to have multiple instances.
  let singleId = options && options.hasOwnProperty('$singleId')
  if (singleId) {
    delete options['$singleId']
    singleId = dialogName + '/' + singleId.toString()
    if (dialogsSingletoneInstances.hasOwnProperty(singleId) && dialogsSingletoneInstances[singleId]) {
      dialogsSingletoneInstances[singleId].focus()
      return dialogsSingletoneInstances[singleId]
    }
  }

  // Dialog options.
  options = Object.assign({
    maximizable: false,
    minimizable: true,
    resizable: false,
    fullscreenable: false,
    useContentSize: true,
    show: false,
    backgroundColor: process.platform === 'win32' ? '#ffffff' : '#ececec',
    zoomToPageWidth: true,
    autoHideMenuBar: true,
    webPreferences: {
      backgroundThrottling: false,
      preload: path.join(__dirname, 'dialogs-preload.js'),
      devTools: isDev,
      defaultEncoding: 'UTF-8',
      nodeIntegration: false,
      sandbox: true
    }
  }, options)

  // Instantinate the window.
  let theDialog = new BrowserWindow(options)
  if (process.platform === 'darwin') {
    app.dock.show()
  }

  // Assign $props that we will use in RenderUtils.getProps() as window properties (params) on load time.
  theDialog.$props = props || {}

  theDialog.on('ready-to-show', theDialog.show)
  theDialog.on('show', app.focus)

  // and load the index.html of the app.
  theDialog.loadFile(path.join(__dirname, 'ui', 'dialogs', dialogName + '.html'))

  // Emitted when the window is closed.
  theDialog.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    theDialog = null

    if (singleId) {
      delete dialogsSingletoneInstances[singleId]
    }

    if (process.platform === 'darwin' && BrowserWindow.getAllWindows().length < 1) {
      app.dock.hide()
    }
  })

  theDialog.webContents.on('new-window', function (event, url) {
    event.preventDefault()
    shell.openExternal(url)
  })

  if (singleId) {
    dialogsSingletoneInstances[singleId] = theDialog
  }

  return theDialog
}

/**
 * Show About dialog
 */
const about = function () {
  createNewDialog('About', {
    $singleId: 1,
    title: 'About',
    width: 320,
    height: 296,
    minimizable: false,
    alwaysOnTop: true,
    acceptFirstMouse: true,

    // Make the window sexy.
    vibrancy: 'appearance-based',
    titleBarStyle: 'hidden',
    backgroundColor: null
  })
}

/**
 * Show Preferences dialog
 */
const preferences = function () {
  createNewDialog('Preferences', {
    $singleId: 1,
    width: 460,
    height: 296
  })
}

/**
 * Show new Bookmark dialog
 */
const addBookmark = function () {
  createNewDialog('AddBookmark', {
    $singleId: 1,
    width: 600,
    height: 460
  })
}

/**
 * Show edit Bookmark dialog
 */
const editBookmark = function () {
  createNewDialog('EditBookmark', {
    $singleId: this.$name,
    width: 600,
    height: 460
  }, this)
}

/**
 * Show edit Bookmark dialog
 */
const rcloneInstaller = function () {
  let dialog = createNewDialog('RcloneInstaller', {
    $singleId: 1,
    width: 250,
    height: 250,
    minimizable: true,
    closable: false,
    acceptFirstMouse: true,

    // Make the window sexy.
    vibrancy: 'appearance-based',
    titleBarStyle: 'hiddenInset',
    backgroundColor: null
  }, this)

  dialog.setInstallProgress = function (value, message) {
    dialog.$props = {
      progress: value,
      message: message
    }
    dialog.setProgressBar(value)
  }

  return dialog
}

/**
 * Multi Instance error
 */
const errorMultiInstance = function () {
  // @TODO consider switch to notification (baloon),
  //       the problem is that Notifications are available after app is ready
  // dialog.showErrorBox('Cannot start', 'RcloneTray is already started and cannot be started twice.')
  // (new Notification({ body: 'RcloneTray is already started and cannot be started twice.' })).show()
}

/**
 * Show the Uncaught Exception dialog
 * @param {Error} detail
 * @returns {boolean} Should exit
 */
const uncaughtException = function (detail) {
  if (app.isReady()) {
    // When error happen when app is ready then seems to be happen on late stage,
    // and user should decide to ignore or to exit (because could have active transfers)
    let choice = dialog.showMessageBox(null, {
      type: 'warning',
      buttons: ['Quit RcloneTray', 'Ignore'],
      title: 'Error',
      message: 'Unexpected runtime error.',
      detail: (detail || '').toString()
    })
    app.focus()
    return choice === 0
  } else {
    // This message will be shown on very early stage before most of the app is loaded.
    console.error(detail)
    dialog.showErrorBox('Error', 'Unexpected runtime error. RcloneTray cannot starts.')
    app.focus()
    return true
  }
}

/**
 * Show confirm exit dialog.
 * @returns {boolean}
 */
const confirmExit = function () {
  let choice = dialog.showMessageBox(null, {
    type: 'warning',
    buttons: ['Yes', 'No'],
    title: 'Quit RcloneTray',
    message: 'Are you sure you want to quit? There is active processes that will be terminated.'
  })
  return choice === 0
}

/**
 * Show missing Rclone action dialog
 * @returns {Number}
 */
const missingRcloneAction = function () {
  let choice = dialog.showMessageBox(null, {
    type: 'warning',
    buttons: ['Automatic Install', 'Rclone Homepage', 'Quit'],
    title: 'Error',
    message: 'Seems that Rclone is not installed (or cannot be found) on your system.\n\nYou need to install Rclne to your system, or to automatic install locally for this application only?\n'
  })
  app.focus()
  return choice
};

/**
 * Initialize module
 */
(function () {
  // Build the global menu
  // @see https://electronjs.org/docs/api/menu#examples
  let template = [
    {
      label: 'Edit',
      submenu: [
        { role: 'redo' },
        { role: 'undo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteandmatchstyle' },
        { role: 'delete' },
        { role: 'selectall' }
      ]
    }]

  template.push({
    role: 'window',
    submenu: [
      { role: 'minimize' },
      { role: 'close' }
    ]
  })

  if (process.platform === 'darwin') {
    // First "Application" menu on macOS
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'quit' }
      ]
    })

    // Edit menu
    template[1].submenu.push(
      { type: 'separator' },
      {
        label: 'Speech',
        submenu: [
          { role: 'startspeaking' },
          { role: 'stopspeaking' }
        ]
      }
    )

    // Window menu
    template[2].submenu = [
      { role: 'close' },
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' }
    ]
  }

  if (isDev) {
    template.push({
      label: 'Debug',
      submenu: [
        { role: 'reload' },
        { role: 'forcereload' },
        { role: 'toggledevtools' }
      ]
    })
  }

  // Set the global menu, as it is part of the dialogs.
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  // Enable context menus.
  electronContextMenu({
    showCopyImageAddress: false,
    showSaveImageAs: false,
    showInspectElement: isDev
  })
})()

// Module object.
module.exports = {
  about,
  editBookmark,
  addBookmark,
  preferences,
  errorMultiInstance,
  uncaughtException,
  confirmExit,
  missingRcloneAction,
  rcloneInstaller
}
