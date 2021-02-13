'use strict'

import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron'
const path = require('path')
const fs = require('fs')

if (process.env.NODE_ENV !== 'development') {
  global.__static = path.join(__dirname, '/static').replace(/\\/g, '\\\\')
}

let mainWindow
let isOpenDevtools = false
const winURL = process.env.NODE_ENV === 'development' ? `http://localhost:9080` : `file://${__dirname}/index.html`

function createWindow () {
  let configPath = path.join(__static, 'config.json')
  fs.readFile(configPath, 'utf8', function (err, config) {
    if (err || !config) {
    } else {
      config = JSON.parse(config)
      mainWindow = new BrowserWindow({
        minWidth: config.size.width,
        maxWidth: config.size.width,
        minHeight: config.size.height,
        maxHeight: config.size.height,
        useContentSize: true,
        icon: path.join(__static, config.iconPath),
        show: false,
        maximizable: false,
        backgroundColor: '#ffffff',
        webPreferences: {
          devTools: config.debug,
          nodeIntegration: true,
          webSecurity: false,
        }
      })
      mainWindow.webContents.closeDevTools()
      mainWindow.loadURL(winURL)
      mainWindow.setMenu(null)
      if (config.debug) {
        globalShortcut.register('Ctrl+Q', function () {
          if (isOpenDevtools) {
            mainWindow.webContents.closeDevTools()
            isOpenDevtools = false
          } else {
            mainWindow.webContents.openDevTools({ mode: 'detach' })
            isOpenDevtools = true
          }
        })
      }
      mainWindow.show()
      mainWindow.webContents.send('renderer-set-reply', { config: config })
      ipcMain.on('renderer-set', function (event, args) {
        event.sender.send('renderer-set-reply', { config: config })
        ipcMain.on('vue-init', function (event, args) {
          mainWindow.show()
        })
      })
    }
  })
}

app.on('ready', createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    init()
  }
})
