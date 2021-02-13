'use strict'

import { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut } from 'electron'
const fs = require('fs')
const path = require('path')
const Store = require('electron-store')

const store = new Store()

if (process.env.NODE_ENV !== 'development') {
  global.__static = path.join(__dirname, '/static').replace(/\\/g, '\\\\')
}

let mainWindow, tray
let isOpenDevtools = false
let debug = true
let logs = ''
const winURL = process.env.NODE_ENV === 'development' ? `http://localhost:9080` : `file://${__dirname}/index.html`

function log (msg, report=false, exit=false) {
  if (!report) {
    logs += '' + msg + '\n'
  } else {
    if (debug) fs.writeFile(path.join(app.getPath('desktop'), 'report.log'), logs, 'utf-8', function () {})
    if (exit) process.exit(1)
  }
}

function init () {
  log('at init')
  let res = {}
  let [oldThemeColor, newThemeColor] = ['', '']
  let [elementUIScss, frameCss] = ['', '']
  let scssPath = path.join(__static, 'css/element-variables.scss')
  let cssPath = path.join(__static, 'css/frame.css')
  res.scssPath = scssPath
  log('\tscssPath = ' + JSON.stringify(scssPath))
  log('\tcssPath = ' + JSON.stringify(cssPath))
  if (!store.get('config')) {
    store.set('config', {
      "name": "采昔便签",
      "author": "kalila-cc",
      "email": "3071927804@qq.com",
      "github": "https://github.com/kalila-cc/HOME",
      "icon": "icons/icon.ico",
      "debug": false,
      "settings": {
        "autoOpen": false,
        "firstLogin": true,
        "hide": true,
        "mode": "list",
        "themeColor": "#41b883"
      },
      "size": {
        "list": {
          "width": 340,
          "height": 660
        },
        "table": {
          "width": 660,
          "height": 600
        }
      },
      "tags": [
        {
          "children": [
            {
              "color": "#e9e9eb",
              "fontColor": "#808080",
              "label": "默认",
              "type": "default"
            }
          ],
          "icon": "el-icon-s-grid",
          "label": "综合",
          "type": "default"
        },
        {
          "children": [
            {
              "color": "#e9e9eb",
              "fontColor": "#808080",
              "label": "默认",
              "type": "default"
            },
            {
              "color": "#fef0f0",
              "fontColor": "#808080",
              "label": "作业",
              "type": "default"
            },
            {
              "color": "#fdf6ec",
              "fontColor": "#808080",
              "label": "测验",
              "type": "default"
            },
            {
              "color": "#ecf5ff",
              "fontColor": "#808080",
              "label": "PRE",
              "type": "default"
            },
            {
              "color": "#f0f9eb",
              "fontColor": "#808080",
              "label": "考试",
              "type": "default"
            }
          ],
          "icon": "el-icon-s-management",
          "label": "学习",
          "type": "default"
        },
        {
          "children": [
            {
              "color": "#e9e9eb",
              "fontColor": "#808080",
              "label": "默认",
              "type": "default"
            },
            {
              "color": "#e8f9d6",
              "fontColor": "#808080",
              "label": "代码",
              "type": "external"
            }
          ],
          "icon": "el-icon-s-cooperation",
          "label": "工作",
          "type": "default"
        },
        {
          "children": [
            {
              "color": "#e9e9eb",
              "fontColor": "#808080",
              "label": "默认",
              "type": "default"
            },
            {
              "color": "#e4e8c1",
              "fontColor": "#808080",
              "label": "出行",
              "type": "external"
            }
          ],
          "icon": "el-icon-s-flag",
          "label": "生活",
          "type": "default"
        },
        {
          "children": [
            {
              "color": "#e9e9eb",
              "fontColor": "#808080",
              "label": "默认",
              "type": "default"
            }
          ],
          "icon": "el-icon-s-order",
          "label": "其他",
          "type": "default"
        }
      ],
      "activeCategory": "综合",
      "emegencyLevel": [
        "#ffffff",
        "#41b883",
        "#e6a23c",
        "#f56c6c"
      ]
    })
    store.set('data', [])
    app.setLoginItemSettings({
      openAtLogin: false,
      openAsHidden: false,
    })
  }
  res.config = store.get('config')
  debug = res.config.debug
  newThemeColor = res.config.settings.themeColor
  fs.readFile(scssPath, 'utf8', readData)
  function readData () {
    log('at readData')
    res.data = store.get('data')
    createWindow(res)
  }
  function readScssFn (err, scss) {
    log('at readScssFn')
    if (err && mainWindow) {
      log('\treadScssFn error')
      mainWindow.close()
      app.quit()
    } else {
      log('\treadScssFn ok')
      try {
        if (!scss) {
          scss = `
          $--color-primary: #41b883;
          $--font-path: '~element-ui/lib/theme-chalk/fonts';
          @import "~element-ui/packages/theme-chalk/src/index";
          `
          elementUIScss = scss
          fs.writeFile(scssPath, elementUIScss, 'utf8', writeScssFn)
        } else {
          oldThemeColor = scss.match(/#\w{6}/)[0]
          try {
            if (oldThemeColor !== newThemeColor) {
              log('\toldThemeColor !== newThemeColor')
              elementUIScss = scss.replace(new RegExp(oldThemeColor, 'g'), newThemeColor)
              fs.writeFile(scssPath, elementUIScss, 'utf8', writeScssFn)
            } else {
              log('\toldThemeColor === newThemeColor')
              readData()
            }
          } catch (e) {
            log('code: 22')
            log(scss)
            log(e)
            log(null, true)
          }
        }
      } catch (e) {
        log('code: 21')
        log(scss)
        log(e)
        log(null, true)
      }
    }
  }
  function writeScssFn (err) {
    log('at writeScssFn')
    if (err && mainWindow) {
      log('\twriteScssFn error')
      mainWindow.close()
      app.quit()
    } else {
      log('\twriteScssFn ok')
      fs.readFile(scssPath, 'utf8', (readScssErr, scss) => {
        if (readScssErr) log('\tread scss error')
        else log('\tread scss ok, content of scss:\n\t' + scss)
      })
      fs.readFile(cssPath, 'utf8', readCssFn)
    }
  }
  function readCssFn (err, css) {
    log('at readCssFn')
    if (err && mainWindow) {
      mainWindow.close()
      app.quit()
    } else {
      try {
        frameCss = css.replace(new RegExp(oldThemeColor, 'g'), newThemeColor)
      fs.writeFile(cssPath, frameCss, 'utf8', writeCssFn)
      } catch (e) {
        log('code: 41')
        log(css)
        log(e)
        log(null, true, true)
      }
    }
  }
  function writeCssFn (err) {
    log('at writeCssFn')
    if (err && mainWindow) {
      mainWindow.close()
      app.quit()
    } else {
      readData()
    }
  }
}

function bindMainWindowEvent (size) {
  log('at bindMainWindowEvent')
  mainWindow.on('closed', function (event) {
    mainWindow = null
  })
  mainWindow.on('blur', function (event) {
    event.sender.send('blur-reply')
  })
  mainWindow.once('ready-to-show', function () {
    ipcMain.on('vue-init', function () {
      mainWindow.show()
    })
  })
  ipcMain.on('data-init', function (event, args) {
    let config = store.get('config')
    if (!config) {
      event.sender.send('data-init-reply', { code: 1 })
    } else {
      if (!config.settings) {
        event.sender.send('data-init-reply', { code: 2 })
      } else {
        config.settings.firstLogin = false
        store.set('config.settings', config.settings)
        store.set('data', args.data)
        event.sender.send('data-init-reply', { code: 0 })
      }
    }
  })
  ipcMain.on('window-operation', function (event, args) {
    if (args.type === 'pin') {
      mainWindow.setAlwaysOnTop(args.pin)
    } else if (args.type === 'min') {
      mainWindow.minimize()
    } else if (args.type === 'close') {
      if (args.hide) {
        mainWindow.hide()
        event.preventDefault()
      } else {
        mainWindow.close()
      }
    } else if (args.type === 'fix') {
      let bounds = mainWindow.getContentBounds()
      if (args.firstFix) {
        mainWindow.setPosition(800, 0)
      } else if (args.fold) {
        bounds.height = 39
        bounds.y = -35
        mainWindow.setBounds(bounds)
        mainWindow.setSkipTaskbar(true)
      } else if (args.unfold) {
        bounds.height = size.list.height
        bounds.y = 0
        mainWindow.setBounds(bounds)
        mainWindow.setSkipTaskbar(false)
        mainWindow.focus()
      } else {
        mainWindow.setPosition(bounds.x, 0)
      }
    }
  })
  ipcMain.on('save-data', function (event, args) {
    let data = JSON.parse(JSON.stringify(args.data))
    data.forEach(item => delete item.expanded)
    store.set('data', data)
    event.sender.send('save-data-reply', { code: 0, type: args.type })
  })
  ipcMain.on('save-config-settings', function (event, args) {
    let settings = store.get('config.settings')
    if (!settings) {
      event.sender.send('save-config-settings-reply', { code: 1, args: args })
    } else {
      settings = args.data
      store.set('config.settings', settings)
      if (args.changed.autoOpen) {
        app.setLoginItemSettings({
          openAtLogin: args.data.autoOpen,
          openAsHidden: args.data.autoOpen,
        })
      }
      if (args.changed.mode) {
        let { width, height } = size[args.data.mode]
        mainWindow.setResizable(true)
        mainWindow.setSize(width, height)
        mainWindow.setResizable(false)
        mainWindow.center()
      }
      event.sender.send('save-config-settings-reply', { code: 0, args: args })
    }
  })
  ipcMain.on('save-config-style', function (event, args) {
    let config = store.get('config')
    if (!config) {
      event.sender.send('save-config-style-reply', {
        code: 1,
        init: Boolean(args.init),
        deleteTag: Boolean(args.deleteTag),
        addTag: Boolean(args.addTag),
      })
    } else {
      if (!config.settings) {
        event.sender.send('save-config-style-reply', {
          code: 2,
          init: Boolean(args.init),
          deleteTag: Boolean(args.deleteTag),
          addTag: Boolean(args.addTag),
        })
      } else {
        if (args.changed.theme) config.settings.themeColor = args.data.theme
        if (args.changed.tags) config.tags = args.data.tags
        store.set('config', config)
        event.sender.send('save-config-style-reply', {
          code: 0,
          init: Boolean(args.init),
          deleteTag: Boolean(args.deleteTag),
          addTag: Boolean(args.addTag),
        })
      }
    }
  })
  ipcMain.on('save-config-active-category', function (event, args) {
    let config = store.get('config')
    if (!config) {
      event.sender.send('save-config-active-category-reply', { code: 1, args: args })
    } else {
      config.activeCategory = args.data
      store.set('config', config)
      event.sender.send('save-config-active-category-reply', { code: 0, args: args })
    }
  })
}

function setSystemInformationMenu (appName, iconPath) {
  log('at setSystemInformationMenu')
  tray = new Tray(iconPath)
  const contextMenu = Menu.buildFromTemplate([{
    label: '退出程序',
    click: function () {
      mainWindow.close()
    }
  }])
  tray.setToolTip(appName)
  tray.setContextMenu(contextMenu)
  tray.on('click', function () {
    let bounds = mainWindow.getContentBounds()
    if (mainWindow.isVisible()) {
      if (bounds.y < 0) {
        mainWindow.webContents.send('window-need-unfold')
      } else {
        mainWindow.hide()
      }
    } else {
      mainWindow.show()
    }
  })
}

function createWindow (res) {
  log('at createWindow')
  let { config } = res
  let { settings, size } = config
  let { width, height } = size[settings.mode]
  let iconPath = path.join(__static, config.icon)
  debug = config.debug
  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    frame: false,
    icon: iconPath,
    show: false,
    maximizable: false,
    resizable: false,
    fullscreenable: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      devTools: debug,
      nodeIntegration: true,
      webSecurity: false,
    }
  })
  mainWindow.webContents.closeDevTools()
  mainWindow.loadURL(winURL)
  if (debug) {
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
  setSystemInformationMenu(config.name, iconPath)
  bindMainWindowEvent(size)
  ipcMain.on('renderer-set', function (event, args) {
    event.sender.send('renderer-set-reply', res)
    log(null, true)
  })
}

app.on('ready', init)

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
