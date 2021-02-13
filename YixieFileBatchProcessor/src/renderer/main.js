import Vue from 'vue'
import axios from 'axios'

import ElementUI from 'element-ui'
import '../../static/css/element-variables.scss'
Vue.use(ElementUI)

const { ipcRenderer } = require('electron')
const { shell, dialog } = require('electron').remote
const fs = require('fs')
const path = require('path')
const NodeID3 = require('node-id3')

if (!process.env.IS_WEB) Vue.use(require('vue-electron'))
Vue.http = Vue.prototype.$http = axios
Vue.config.productionTip = false
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

ipcRenderer.on('renderer-set-reply', function (event, args) {
  new Vue({
    el: '#title',
    data: {
      config: args.config,
    }
  })
  let app = new Vue({
    el: '#app',
    data: {
      config: args.config,
      modules: [
        {
          label: '文件名批处理',
          icon: 'el-icon-folder-opened',
        },
        {
          label: 'mp3信息修改',
          icon: 'el-icon-headset',
        },
        {
          label: '使用说明',
          icon: 'el-icon-warning-outline',
        },
      ],
      activeModuleIndex: 0,
      activeModuleLabel: '',
      selectedDirectory: '',
      filterCheckList: ['使用过滤', '区分大小写', '使用正则'],
      filterCheckedList: [],
      useFilter: false,
      caseSensitive: false,
      useRegExp: false,
      filterExp: '',
      files: [],
      fileObjects: [],
      selectedFiles: [],
      renameObject: {
        oldExp: '',
        newExp: '',
      },
      renameFileObjects: [],
      renameFileObjectsVisible: false,
      errorData: [],
      errorVisible: false,
      songInfoExp: '',
      singerSepExp: '',
      album: '',
      trackNumber: null,
      albumCoverPath: '',
    },
    computed: {
      useRename: function () {
        return !this.fileObjects.every(fo => !fo.preview)
      },
      canRename: function () {
        return this.selectedFiles.length > 0 && this.renameObject && this.renameObject.oldExp && this.renameObject.newExp
      },
      canModify: function () {
        return this.selectedFiles.length > 0 && this.songInfoExp && this.singerSepExp
      },
    },
    methods: {
      isValidFileName: function (file) {
        return !Boolean(new RegExp('[\\\\/:*?\"<>|]').test(file))
      },
      checkAndUpdate: function (fail, operation, update=true) {
        if (fail.length === 0) {
          this.$message({
            message: `${operation}成功`,
            type: 'success',
            duration: 1000,
          })
        } else {
          this.$message({
            message: `出现未知错误，${operation}失败`,
            type: 'error',
            duration: 1500,
          })
          setTimeout(() => {
            this.errorData = fail.map(file => ({ file: file }))
            this.errorVisible = true
          }, 1500)
        }
        if (update)
          this.reloadFiles(null, false)
      },
      moduleChanged: function (index) {
        this.activeModuleIndex = parseInt(index)
        this.reloadFiles(null, false)
      },
      selectDirectory: function () {
        dialog.showOpenDialog({
          properties: ['openDirectory']
        }, (files) => {
          if (files && files.length) {
            this.useFilter = false
            this.selectedDirectory = files[0]
            this.reloadFiles(null, false)
          }
        })
      },
      clickUseFilter: function () {
        this.useFilter = !this.useFilter
        if (!this.useFilter) {
          this.fileObjects = this.files.map(file => ({ file: file, isDirectory: false }))
          this.getType()
        }
      },
      clickCaseSensitive: function () {
        this.caseSensitive = !this.caseSensitive
        if (this.caseSensitive && this.useRegExp)
          this.useRegExp = false
      },
      clickUseRegExp: function () {
        this.useRegExp = !this.useRegExp
        if (this.useRegExp && this.caseSensitive)
          this.caseSensitive = false
      },
      filterCheckedListChanged: function (checkedList) {
        if (checkedList.length > 0 && this.filterCheckedList.indexOf('使用过滤') < 0) {
          this.filterCheckedList.push('使用过滤')
        }
        if (this.filterCheckedList.indexOf('区分大小写') >= 0 && this.filterCheckedList.indexOf('使用正则') >= 0) {
          this.filterCheckedList.splice(this.filterCheckedList.indexOf('区分大小写'), 1)
        }
      },
      handleFilter: function () {
        if (this.filterExp.length === 0) {
          this.fileObjects = []
        } else {
          if (this.useRegExp) {
            if (this.filterExp.length === 0) {
              this.$message({
                message: '正则表达式不能为空',
                type: 'error',
                duration: 1000,
              })
              this.fileObjects = []
            } else {
              try {
                let re = new RegExp(this.filterExp)
                this.fileObjects = this.files.filter(file => re.exec(file)).map(file => ({ file: file, isDirectory: false }))
                this.getType()
              } catch (err) {
                this.$message({
                  message: '正则表达式不合法',
                  type: 'error',
                  duration: 1000,
                })
                this.fileObjects = []
              }
            }
          } else if (this.caseSensitive) {
            this.fileObjects = this.files.filter(file => file.includes(this.filterExp)).map(file => ({ file: file, isDirectory: false }))
            this.getType()
          } else {
            let filterExp = this.filterExp.toLowerCase()
            this.fileObjects = this.files.filter(file => file.toLowerCase().includes(filterExp)).map(file => ({ file: file, isDirectory: false }))
            this.getType()
          }
        }
      },
      selectedFilesChanged: function (selection) {
        this.selectedFiles = selection.map(item => item.file)
        this.clearRenameObject()
        if (this.activeModuleIndex === 1 && this.selectedFiles.length === 1) {
          let fp = path.join(this.selectedDirectory, this.selectedFiles[0])
          let tags = NodeID3.read(fp)
          this.album = tags.album
          this.trackNumber = tags.trackNumber
        }
      },
      getType: function () {
        this.fileObjects.forEach(fo => {
          fs.stat(path.join(this.selectedDirectory, fo.file), (err, stats) => {
            fo.isDirectory = Boolean(!err && stats.isDirectory())
          })
        })
      },
      clearRenameObject: function () {
        this.renameFileObjects = []
      },
      renameFilesPreview: function (event, visible=true) {
        try {
          let oldRegExp = new RegExp(this.renameObject.oldExp, 'g')
          let newRegExp = this.renameObject.newExp
          if (!this.isValidFileName(newRegExp)) {
            this.$message({
              message: '文件名不能包含特殊字符',
              type: 'error',
              duration: 1000,
            })
            return
          }
          this.renameFileObjects = this.selectedFiles.map(file => ({
            oldFile: file,
            newFile: file.replace(oldRegExp, newRegExp),
          }))
          this.renameFileObjectsVisible = visible
        } catch (err) {
          this.$message({
            message: '正则表达式不合法',
            type: 'error',
            duration: 1000,
          })
        }
      },
      renameFiles: function (event) {
        if (!this.renameFileObjects || !this.renameFileObjects.length) {
          this.renameFilesPreview(null, false)
          this.$message({
            message: '请先预览结果，防止误操作',
            type: 'warning',
            duration: 1500,
          })
          setTimeout(() => {
            this.renameFilesPreview(null, true)
          }, 1500)
          return
        }
        this.$confirm('是否重命名以上文件, 操作不可撤销', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        }).then(() => {
          try {
            let dir = this.selectedDirectory
            let renameStats = { success: [], fail: [] }
            this.renameFileObjects.forEach(obj => {
              let ofp = path.join(dir, obj.oldFile)
              let nfp = path.join(dir, obj.newFile)
              if (fs.existsSync(ofp)) {
                if (ofp !== nfp) {
                  try {
                    fs.renameSync(ofp, nfp)
                    renameStats.success.push(obj.oldFile)
                  } catch (err) {
                    renameStats.fail.push(obj.oldFile)
                  }
                } else {
                  renameStats.success.push(obj.oldFile)
                }
              } else {
                renameStats.fail.push(obj.oldFile)
              }
            })
            this.checkAndUpdate(renameStats.fail, '重命名文件')
          } catch (err) {
            console.log(err)
            this.$message({
              message: '出现未知错误，重命名文件失败',
              type: 'error',
              duration: 1000,
            })
          }
        })
      },
      reloadFiles: function (event, showDialog=true) {
        this.fileObjects = []
        fs.readdir(this.selectedDirectory, (err, files) => {
          if (err) {
            if (showDialog) {
              this.$message({
                message: '出现未知错误，刷新失败',
                type: 'error',
                duration: 1000,
              })
            }
          } else {
            try {
              this.files = []
              if (this.activeModuleIndex === 0) {
                this.files = files
                this.fileObjects = this.files.map(file => ({ file: file, isDirectory: false }))
                this.getType()
              } else if (this.activeModuleIndex === 1) {
                this.files = files.filter(file => fs.statSync(path.join(this.selectedDirectory, file)).isFile() && (path.extname(file).toLowerCase() === '.mp3'))
                this.fileObjects = this.files.map(file => ({ file: file, isDirectory: false }))
              }
              this.fileObjects = this.files.map(file => ({ file: file, isDirectory: false }))
              if (showDialog) {
                this.$message({
                  message: '刷新成功',
                  type: 'success',
                  duration: 1000,
                })
              }
            } catch (err) {
              if (showDialog) {
                this.$message({
                  message: '出现未知错误，刷新失败',
                  type: 'error',
                  duration: 1000,
                })
              }
            }
          }
        })
      },
      copyFiles: function () {
        let copyStats = { success: [], fail: [] }
        let copyFn = (src, dst, file) => {
          let _src = path.join(src, file)
          let _dst = path.join(dst, file)
          if (fs.existsSync(_src) && fs.existsSync(dst)) {
            if (fs.statSync(_src).isDirectory()) {
              fs.readdirSync(_src).forEach(f => {
                fs.mkdirSync(_dst)
                copyFn(_src, _dst, f)
              })
            } else {
              let rs = fs.createReadStream(_src)
              let ws = fs.createWriteStream(_dst)
              rs.pipe(ws)
            }
            copyStats.success.push(file)
          } else {
            copyStats.fail.push(file)
          }
        }
        dialog.showOpenDialog({
          properties: ['openDirectory']
        }, (files) => {
          if (files && files.length) {
            let src = this.selectedDirectory
            let dst = files[0]
            if (src !== dst) {
              this.selectedFiles.forEach(file => copyFn(src, dst, file))
              this.checkAndUpdate(copyStats.fail, '复制文件')
            } else {
              this.$message({
                message: '不支持复制到同一文件夹',
                type: 'warning',
                duration: 1000,
              })
            }
          }
        })
      },
      moveFiles: function () {
        dialog.showOpenDialog({
          properties: ['openDirectory']
        }, (files) => {
          if (files && files.length) {
            let newDir = files[0]
            if (this.selectedDirectory !== newDir) {
              fs.stat(newDir, (err, stats) => {
                if (err) {
                  this.$message({
                    message: '出现未知错误，移动失败',
                    type: 'error',
                    duration: 1000,
                  })
                } else {
                  let dir = this.selectedDirectory
                  let moveStats = { success: [], fail: [] }
                  this.selectedFiles.forEach(file => {
                    let ofp = path.join(dir, file)
                    let nfp = path.join(newDir, file)
                    if (fs.existsSync(ofp)) {
                      fs.renameSync(ofp, nfp)
                      moveStats.success.push(file)
                    } else {
                      moveStats.fail.push(file)
                    }
                  })
                  this.checkAndUpdate(moveStats.fail, '移动文件')
                }
              })
            } else {
              this.$message({
                message: '不支持移动到同一文件夹',
                type: 'warning',
                duration: 1000,
              })
            }
          }
        })
      },
      removeFiles: function () {
        let removeStats = { success: [], fail: [] }
        let removeFn = (file) => {
          if (fs.existsSync(file)) {
            if (fs.statSync(file).isDirectory()) {
              fs.readdirSync(file).forEach(f => removeFn(path.join(file, f)))
              fs.rmdirSync(file)
            } else {
              fs.unlinkSync(file)
            }
            removeStats.success.push(file)
          } else {
            removeStats.fail.push(file)
          }
        }
        this.$confirm('是否删除以上文件, 操作不可撤销', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        }).then(() => {
          this.selectedFiles.forEach(file => removeFn(path.join(this.selectedDirectory, file)))
          this.checkAndUpdate(removeStats.fail, '删除文件')
        })
      },
      modifyFiles: function (event, visible=true) {
        let unique = (str, substr) => {
          let firstIndex = str.indexOf(substr)
          let lastIndex = str.lastIndexOf(substr)
          return firstIndex >= 0 && lastIndex >= 0 && firstIndex === lastIndex
        }
        if (!unique(this.songInfoExp, '$a') || !unique(this.songInfoExp, '$t')) {
          this.$message({
            message: '表达式必须有且仅有一个 $a 和 $t',
            type: 'error',
            duration: 1500,
          })
        } else {
          try {
            let re = new RegExp(this.songInfoExp.replace(/\.[mM][pP]3/g, '\\.[mM][pP]3').replace('$a', '(.+?)').replace('$t', '(.+?)'))
            let singerFirst = Boolean(this.songInfoExp.indexOf('$a') <= this.songInfoExp.indexOf('$t'))
            let modifyInfoStats = { success: [], fail: [] }
            this.selectedFiles.forEach(file => {
              let match = re.exec(file)
              let [artist, title] = singerFirst ? [match[1], match[2]] : [match[2], match[1]]
              if (artist && title) {
                let fp = path.join(this.selectedDirectory, file)
                let artists = artist.split(this.singerSepExp)
                // let tags = NodeID3.read(fp)
                // console.log(tags)
                let success = NodeID3.update({
                  title: title,
                  artist: artists.join('/'),
                }, fp)
                if (success) {
                  modifyInfoStats.success.push(file)
                } else {
                  modifyInfoStats.fail.push(file)
                }
              } else {
                modifyInfoStats.fail.push(file)
              }
            })
            this.checkAndUpdate(modifyInfoStats.fail, '修改歌曲信息')
          } catch (err) {
            this.$message({
              message: '正则表达式不合法',
              type: 'error',
              duration: 1000,
            })
          }
        }
      },
      trackNumberChanged: function (value) {
        value = value.replace(/[^0-9]/g, '') || ''
        if (parseInt(value) <= 0)
          value = ''
        this.trackNumber = value.replace(/^0+/, '')
      },
      modifyAlbum: function () {
        let modifyAlbumStats = { success: [], fail: [] }
        this.selectedFiles.forEach(file => {
          try {
            let fp = path.join(this.selectedDirectory, file)
            let success = NodeID3.update({
              album: this.album,
            }, fp)
            if (success) {
              modifyAlbumStats.success.push(file)
            } else {
              modifyAlbumStats.fail.push(file)
            }
          } catch (err) {
            console.log(err)
            modifyAlbumStats.fail.push(file)
          }
        })
        this.checkAndUpdate(modifyAlbumStats.fail, '修改专辑名称')
      },
      modifyTrackNumber: function () {
        let modifyTrackNumberStats = { success: [], fail: [] }
        this.selectedFiles.forEach(file => {
          try {
            let fp = path.join(this.selectedDirectory, file)
            let success = NodeID3.update({
              trackNumber: this.trackNumber,
            }, fp)
            if (success) {
              modifyTrackNumberStats.success.push(file)
            } else {
              modifyTrackNumberStats.fail.push(file)
            }
          } catch (err) {
            modifyTrackNumberStats.fail.push(file)
          }
        })
        this.checkAndUpdate(modifyTrackNumberStats.fail, '修改曲目编号')
      },
      modifyAlbumCover: function () {
        dialog.showOpenDialog({
          filters: [{ name: 'Image', extensions: ['png'] }],
          properties: ['openFile'],
        }, (files) => {
          if (files && files.length) {
            let modifyAlbumCoverStats = { success: [], fail: [] }
            this.albumCoverPath = files[0]
            this.selectedFiles.forEach(file => {
              try {
                let fp = path.join(this.selectedDirectory, file)
                let success = NodeID3.update({
                  image: this.albumCoverPath,
                }, fp)
                if (success) {
                  modifyAlbumCoverStats.success.push(file)
                } else {
                  modifyAlbumCoverStats.fail.push(file)
                }
              } catch (err) {
                modifyAlbumCoverStats.fail.push(file)
              }
            })
            this.checkAndUpdate(modifyAlbumCoverStats.fail, '修改专辑封面')
          }
        })
      },
      saveAlbumCover: function () {
        let fp = path.join(this.selectedDirectory, this.selectedFiles[0])
        let tags = NodeID3.read(fp)
        if (tags && tags.image && tags.image.imageBuffer && tags.image.imageBuffer.length) {
          let blob = new Blob([new Uint8Array(tags.image.imageBuffer)], { type: `image/${tags.image.mime}` })
          let a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = `album cover.${tags.image.mime}`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
        } else {
          this.$message({
            message: '此歌曲无法获取专辑封面',
            type: 'warning',
            duration: 1000,
          })
        }
      },
      openGitHub: function (event) {
        event.preventDefault()
        shell.openExternal(this.config.github)
      },
      show: function (data) {
        console.log(JSON.stringify(data, null, '\t'))
      },
    },
    created: function () {
      this.activeModuleLabel = this.modules[this.activeModuleIndex].label
      this.reloadFiles(null, false)
    },
  })
  window.app = app
  ipcRenderer.send('vue-init')
})

ipcRenderer.send('renderer-set')
