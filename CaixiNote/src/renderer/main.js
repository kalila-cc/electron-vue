import Vue from 'vue'
import axios from 'axios'

import ElementUI from 'element-ui'
import html2canvas from 'html2canvas'

const { ipcRenderer } = require('electron')
const { shell } = require('electron').remote

import '../../static/css/element-variables.scss'
Vue.use(ElementUI)

if (!process.env.IS_WEB) Vue.use(require('vue-electron'))
Vue.http = Vue.prototype.$http = axios
Vue.config.productionTip = false
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

ipcRenderer.on('renderer-set-reply', function (loadedEvent, res) {
  let { config } = res
  new Vue({
    el: '#title',
    data: {
      appName: config.name,
    }
  })
  let appElement = new Vue({
    el: '#app',
    data: {
      debug: config.debug,
      appName: config.name,
      iconPath: config.icon,
      github: config.github,
      aboutMessages: [],
      listWidth: config.size.list.width,
      bubbleMessage: '',
      bubbleMessageIconColor: '',
      bubbleMessageVisible: false,
      pagePin: false,
      pageFixed: false,
      pageHidden: false,
      emegencyLevel: Array.from(config.emegencyLevel),
      activeCategory: config.activeCategory,
      rawTodoList: [],
      todoList: Array.from(res.data),
      editVisible: false,
      editTagDialogVisible: false,
      rawEditItem: {},
      tags: JSON.parse(JSON.stringify(config.tags)),
      expanded: {},
      styleVisible: false,
      rawStyle: {},
      calendar: new Date(),
      calendarVisible: false,
      settings: Object.assign({}, config.settings),
      rawSettings: {},
      settingsVisible: false,
      takingScreenShot: false
    },
    computed: {
      calendarData: function () {
        let todayFmt = this.datetimeFormat(new Date()).match(/\d{4}-\d{2}-\d{2}/)[0]
        let firstSunday = this.calendar
        firstSunday = new Date(`${firstSunday.getFullYear()}-${firstSunday.getMonth() + 1}-1`)
        let firstDay = firstSunday.getTime()
        while (firstSunday.getDay() !== 0) firstSunday = new Date(firstSunday.getTime() - 86400 * 1000)
        firstSunday = firstSunday.getTime()
        let lastSaturday = this.getNextMonthFirstDay(this.calendar)
        lastSaturday = new Date(lastSaturday.getTime() - 86400 * 1000)
        let lastDay = lastSaturday.getTime()
        lastSaturday = new Date(`${lastSaturday.getFullYear()}-${lastSaturday.getMonth() + 1}-${lastSaturday.getDate()}`)
        while (lastSaturday.getDay() !== 6) lastSaturday = new Date(lastSaturday.getTime() + 86400 * 1000)
        lastSaturday = lastSaturday.getTime()
        let data = []
        let todoListFmt = this.todoList.map(item => item.deadline.match(/\d{4}-\d{2}-\d{2}/)[0])
        for (let ts = firstSunday; ts <= lastSaturday; ts += 86400 * 1000) {
          let d = new Date(ts)
          if (ts < firstDay) d.type = 'prev'
          else if (ts > lastDay) d.type = 'next'
          else d.type = 'curr'
          let fmt = this.datetimeFormat(d).match(/\d{4}-\d{2}-\d{2}/)[0]
          if (fmt === todayFmt) d.today = true
          d.tasks = []
          todoListFmt.forEach((item, index) => {
            if (item === fmt) {
              d.tasks.push(this.todoList[index])
            }
          })
          data.push(d)
        }
        return data
      },
      activeTodoList: function () {
        if (this.activeCategory === '综合') { return this.todoList }
        return this.todoList.filter(item => item.category === this.activeCategory)
      },
      finishedTodoList: function () {
        let list = this.activeTodoList
        let now = new Date()
        return list.filter(item => item.finished || (new Date(item.deadline)) <= now)
      },
      inDayTodoList: function () {
        let list = this.activeTodoList
        let startLine = new Date()
        let deadline = this.getDeadline('day')
        return list.filter(item => {
          let itemDeadline = new Date(item.deadline)
          return !item.finished && startLine <= itemDeadline && itemDeadline < deadline
        })
      },
      inWeekTodoList: function () {
        let list = this.activeTodoList
        let startLine = this.getDeadline('day')
        let deadline = this.getDeadline('week')
        return list.filter(item => {
          let itemDeadline = new Date(item.deadline)
          return !item.finished && startLine <= itemDeadline && itemDeadline < deadline
        })
      },
      laterTodoList: function () {
        let list = this.activeTodoList
        let startLine = this.getDeadline('week')
        return list.filter(item => {
          let itemDeadline = new Date(item.deadline)
          return !item.finished && startLine < itemDeadline
        })
      },
      treeTodoList: function () {
        let finishedTodoList = this.finishedTodoList
        let inDayTodoList = this.inDayTodoList
        if (inDayTodoList.length === 0) { this.expanded[this.activeCategory]['今天内'] = false }
        let inWeekTodoList = this.inWeekTodoList
        if (inWeekTodoList.length === 0) { this.expanded[this.activeCategory]['一周内'] = false }
        let laterTodoList = this.laterTodoList
        if (laterTodoList.length === 0) { this.expanded[this.activeCategory]['更久'] = false }
        let treeTodoList = [
          {
            label: '已完成/已失效',
            todoList: finishedTodoList,
            color: '#909399'
          },
          {
            label: '今天内',
            todoList: inDayTodoList,
            color: '#f56c6c'
          },
          {
            label: '一周内',
            todoList: inWeekTodoList,
            color: '#e6a23c'
          },
          {
            label: '更久',
            todoList: laterTodoList,
            color: '#409eff'
          }
        ]
        return treeTodoList
      },
      progressPercentage: function () {
        let now = new Date()
        let effectiveItems = this.todoList.filter(item => now < new Date(item.deadline))
        let finishedItems = effectiveItems.filter(item => item.finished)
        return Math.ceil(100 * finishedItems.length / effectiveItems.length)
      },
      progressColor: function () {
        let percentage = this.progressPercentage
        if (percentage < 50) return '#ff4949'
        else if (percentage < 75) return '#e6a23c'
        else if (percentage < 100) return '#67c23a'
        return '#20a0ff'
      }
    },
    methods: {
      // 新用户数据初始化
      setDefaultTodoList: function () {
        let ts = Date.now()
        let todoList = [
          // 前天
          {
            'category': '学习',
            'deadline': this.datetimeFormat(new Date(ts - 2 * 86400 * 1000)),
            'emegencyLevel': 1,
            'finished': true,
            'id': ts - 2 * 86400 * 1000,
            'note': '完成的任务在这里，这个任务已经完成啦😆！完成的任务会被『划掉』噢',
            'tag': '作业',
            'title': '前天的任务'
          },
          // 昨天
          {
            'category': '学习',
            'deadline': this.datetimeFormat(new Date(ts - 1 * 86400 * 1000 + 3600 * 1000)),
            'emegencyLevel': 2,
            'finished': false,
            'id': ts - 1 * 86400 * 1000 + 3600 * 1000,
            'note': '过期未完成的任务在这里😕，过期的任务会变灰。',
            'tag': '测验',
            'title': '昨天的任务'
          },
          // 今天
          {
            'category': '学习',
            'deadline': this.datetimeFormat(new Date(ts + 10 * 60 * 1000)),
            'emegencyLevel': 2,
            'finished': false,
            'id': ts + 10 * 60 * 1000,
            'note': '当天的任务要记得尽快解决噢🌈！',
            'tag': '测验',
            'title': '欢迎使用『采昔便签』🤪'
          },
          // 明天
          {
            'category': '学习',
            'deadline': this.datetimeFormat(new Date(ts + 86400 * 1000)),
            'emegencyLevel': 3,
            'finished': false,
            'id': ts + 86400 * 1000,
            'note': '一周内的任务也是比较紧急的呢 ~ ，注意到了吗，这是一个高优先级的任务。(PS: 有相似的任务可以在操作中找到『复制』复制一份，然后以其为基础进行编辑👍)',
            'tag': 'PRE',
            'title': '明天的任务🙄'
          },
          // 后天
          {
            'category': '学习',
            'deadline': this.datetimeFormat(new Date(ts + 2 * 86400 * 1000)),
            'emegencyLevel': 1,
            'finished': false,
            'id': ts + 2 * 86400 * 1000,
            'note': '悄悄告诉你，任务的标签是可以自定义的噢✌️（甚至背景色和字体色都可以自定义），另外在右下角的『设置』还可以修改便签的显示模式😏。',
            'tag': '默认',
            'title': '后天的任务'
          },
          // 八天后
          {
            'category': '学习',
            'deadline': this.datetimeFormat(new Date(ts + 8 * 86400 * 1000)),
            'emegencyLevel': 2,
            'finished': false,
            'id': ts + 8 * 86400 * 1000,
            'note': '试试编辑✍🏻一下这条任务吧（列表模式下点击右上角可展开操作按钮）！',
            'tag': '默认',
            'title': '一周 彳主 后的任务 1 🧦'
          },
          // 九天后
          {
            'category': '学习',
            'deadline': this.datetimeFormat(new Date(ts + 9 * 86400 * 1000)),
            'emegencyLevel': 3,
            'finished': false,
            'id': ts + 9 * 86400 * 1000,
            'note': '试试把这条任务标为完成，然后删掉这条任务~',
            'tag': '默认',
            'title': '🙏🏻一周往后的任务 2'
          },
          // 十二天后
          {
            'category': '工作',
            'deadline': this.datetimeFormat(new Date(ts + 12 * 86400 * 1000)),
            'emegencyLevel': 1,
            'finished': true,
            'id': ts + 12 * 86400 * 1000,
            'note': '任务提前完成也会被『划掉』但不会👋🏻变灰，这个任务和其他的是属于不同的分类，可以在顶部进行分类的切换。',
            'tag': '默认',
            'title': '⛅️很久以后的任务1'
          },
          // 十三天后
          {
            'category': '学习',
            'deadline': this.datetimeFormat(new Date(ts + 13 * 86400 * 1000)),
            'emegencyLevel': 3,
            'finished': false,
            'id': ts + 13 * 86400 * 1000,
            'note': '右下角的『导出』可以导出便签长图（列表模式下），『日历』还可以查看任务月视图，右上角的『置顶』可以将程序置于屏幕顶层，『固定』可以让程序收起在屏幕顶部（列表模式下）。最后，别漏了回到列表顶部，展开『已完成/已失效』看看~',
            'tag': '测验',
            'title': '很久以后的🌏任务2'
          }
        ]
        this.todoList = todoList
      },
      // 发送信息
      sendBubbleMessage: function (options) {
        let cmap = {
          'info': '#909399',
          'warning': '#e6a23c',
          'error': '#f56c6c',
          'success': '#67c23a'
        }
        this.bubbleMessageVisible = false
        this.bubbleMessage = options.message
        this.bubbleMessageIconColor = cmap[options.type]
        this.bubbleMessageVisible = true
        let that = this
        setTimeout(function () {
          that.bubbleMessageVisible = false
        }, options.duration)
      },
      getCategoryIndex: function (category) {
        return this.tags.map(item => item.label).indexOf(category)
      },
      getCategoryTags: function (category) {
        let categoryIndex = this.tags.map(item => item.label).indexOf(category)
        if (categoryIndex >= 0 && this.tags[categoryIndex].children) { return this.tags[categoryIndex].children }
        return []
      },
      getTagIndex: function (category, tag) {
        let categoryIndex = this.tags.map(item => item.label).indexOf(category)
        let tagIndex = this.tags[categoryIndex].children.map(item => item.label).indexOf(tag)
        return tagIndex
      },
      getCategoryTagIndex: function (category, tag) {
        let categoryIndex = this.tags.map(item => item.label).indexOf(category)
        let tagIndex = this.tags[categoryIndex].children.map(item => item.label).indexOf(tag)
        return [categoryIndex, tagIndex]
      },
      // 获得相邻月份的第一天
      getNextMonthFirstDay: function (date, skip = 1) {
        let year = date.getFullYear()
        let month = date.getMonth() + 1
        if (skip > 0) {
          month++
          if (month > 12) {
            month = 1
            year++
          }
        } else if (skip < 0) {
          month--
          if (month <= 0) {
            month = 12
            year--
          }
        }
        let fmt = `${year}-${month}-1`
        return new Date(fmt)
      },
      // 处理跳过月份事件
      handleSkipMonth: function (skip) {
        this.calendar = this.getNextMonthFirstDay(this.calendar, skip)
      },
      // 处理操作窗口事件
      handleMinWindow: function () {
        ipcRenderer.send('window-operation', { type: 'min' })
      },
      handlePinWindow: function () {
        if (!this.pageFixed) {
          this.pagePin = !this.pagePin
          ipcRenderer.send('window-operation', { type: 'pin', pin: this.pagePin })
          this.sendBubbleMessage({
            message: this.pagePin ? '已置顶' : '已取消置顶',
            type: 'info',
            duration: 1000
          })
        } else {
          this.sendBubbleMessage({
            message: '固定模式下不能取消置顶',
            type: 'warning',
            duration: 1000
          })
        }
      },
      handleCloseWindow: function () {
        ipcRenderer.send('window-operation', { type: 'close', hide: this.settings.hide })
      },
      handleFixWindow: function () {
        this.pageFixed = !this.pageFixed
        if (this.pageFixed) {
          if (!this.pagePin) {
            this.pagePin = true
            ipcRenderer.send('window-operation', { type: 'pin', pin: true })
          }
          ipcRenderer.send('window-operation', { type: 'fix', firstFix: true })
        }
      },
      // 处理标签颜色事件
      handleTagColor: function (category, tag, type) {
        let [categoryIndex, tagIndex] = this.getCategoryTagIndex(category, tag)
        if (type === 'get') {
          return this.tags[categoryIndex].children[tagIndex].color
        } else if (type === 'get-font') {
          return this.tags[categoryIndex].children[tagIndex].fontColor
        } else if (type === 'set') {
          function getRandomLightColor (range = 64) {
            let f = () => (Math.floor(Math.random() * range) + (256 - range)).toString(16)
            let [r, g, b] = [f(), f(), f()]
            let rgb = `#${r}${g}${b}`
            return rgb
          }
          let randomLightColor = getRandomLightColor()
          this.tags[categoryIndex].children.push({
            label: tag,
            color: randomLightColor,
            fontColor: '#808080',
            type: 'external'
          })
          return randomLightColor
        } else if (type === 'exists') {
          return tagIndex >= 0
        }
      },
      // 判断是否完成表格填写
      isEditFormComplete: function (editItem) {
        if (!editItem.category) {
          return {
            message: '请选择分类',
            type: 'warning',
            duration: 1000
          }
        } else if (!editItem.deadline) {
          return {
            message: '请选择日期时间',
            type: 'warning',
            duration: 1000
          }
        } else if (!editItem.emegencyLevel) {
          return {
            message: '请选择优先级',
            type: 'warning',
            duration: 1000
          }
        } else if (!editItem.tag) {
          return {
            message: '请选择标签',
            type: 'warning',
            duration: 1000
          }
        } else if (!editItem.title) {
          return {
            message: '请输入标题',
            type: 'warning',
            duration: 1000
          }
        }
        return {
          message: '修改成功',
          type: 'success',
          duration: 1000
        }
      },
      // 格式化日期时间
      datetimeFormat: function (datetime, brief = false) {
        if (brief) {
          let str = datetime.slice(0, datetime.length - 3)
          let now = new Date()
          let dt = new Date(datetime)
          if (dt.getFullYear() === now.getFullYear()) { str = str.slice(str.indexOf('-') + 1) }
          return str
        } else {
          let pre = (num) => num < 10 ? `0${num}` : `${num}`
          let date = `${pre(datetime.getFullYear())}-${pre(datetime.getMonth() + 1)}-${pre(datetime.getDate())}`
          let time = `${pre(datetime.getHours())}:${pre(datetime.getMinutes())}:${pre(datetime.getSeconds())}`
          return `${date} ${time}`
        }
      },
      // 处理转换事件
      handleToggleTab: function (tab) {
        if (this.activeCategory !== tab) {
          ipcRenderer.send('save-config-active-category', { data: tab })
        }
      },
      handleToggleActiveCategory: function (category) {
        if (category !== this.activeCategory) {
          this.activeCategory = category
          ipcRenderer.send('save-config-active-category', { data: this.activeCategory })
        }
      },
      // 列表排序
      sortTodoList: function (list) {
        list.sort((a, b) => {
          let pa = new Date(a.deadline).getTime()
          let pb = new Date(b.deadline).getTime()
          if (pa > pb) return 1
          else if (pa < pb) return -1
          return 0
        })
      },
      // 通过 id 寻找列表元素索引
      findIndexById: function (list, _id) {
        return list.map(item => item.id).indexOf(_id)
      },
      // 获取不同到期时间下对应的 deadline
      getDeadline: function (type) {
        let delay = null
        if (type === 'day') { delay = 1000 * 86400 } else if (type === 'week') { delay = 1000 * 86400 * 7 } else { return delay }
        let now = new Date()
        let today = new Date(`${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`).getTime()
        let deadline = new Date(today + delay)
        return deadline
      },
      // 获取 deadline 类型
      getDeadlineType: function (editItem) {
        if (editItem.finished) return '已完成/已失效'
        let deadline = new Date(editItem.deadline)
        let now = new Date()
        let day = this.getDeadline('day')
        let week = this.getDeadline('week')
        if (deadline <= now) return '已完成/已失效'
        if (deadline <= day) return '今天内'
        if (deadline <= week) return '一周内'
        return '更久'
      },
      // 处理保存事件
      handleEditSave: function () {
        let res = this.isEditFormComplete(this.rawEditItem)
        let isEditItem = Boolean(this.rawEditItem.id)
        if (res.type === 'success') {
          if (isEditItem) {
            let index = this.findIndexById(this.todoList, this.rawEditItem.id)
            this.rawEditItem.note = this.rawEditItem.note || ''
            this.rawEditItem.deadline = this.datetimeFormat(this.rawEditItem.deadline)
            let deadlineIsChanged = Boolean(this.rawEditItem.deadline !== this.todoList[index].deadline)
            if (!this.handleTagColor(this.rawEditItem.category, this.rawEditItem.tag, 'exists')) { this.handleTagColor(this.rawEditItem.category, this.rawEditItem.tag, 'set') }
            this.rawTodoList = Array.from(this.todoList)
            this.rawTodoList.splice(index, 1, this.rawEditItem)
            if (deadlineIsChanged) { this.sortTodoList(this.rawTodoList) }
            ipcRenderer.send('save-data', {
              data: this.rawTodoList,
              type: 'edit'
            })
          } else {
            if (!this.handleTagColor(this.rawEditItem.category, this.rawEditItem.tag, 'exists')) { this.handleTagColor(this.rawEditItem.category, this.rawEditItem.tag, 'set') }
            this.rawEditItem.id = Date.now()
            this.rawEditItem.note = this.rawEditItem.note || ''
            this.rawEditItem.deadline = this.datetimeFormat(this.rawEditItem.deadline)
            this.rawTodoList = Array.from(this.todoList)
            this.rawTodoList.push(this.rawEditItem)
            this.sortTodoList(this.rawTodoList)
            ipcRenderer.send('save-data', {
              data: this.rawTodoList,
              type: 'add'
            })
          }
        } else {
          this.sendBubbleMessage(res)
        }
      },
      handleEditTagSave: function (category, tag) {
        let categoryIndex = this.getCategoryIndex(category)
        this.rawStyle = { tags: JSON.parse(JSON.stringify(this.tags)) }
        this.rawStyle.tags[categoryIndex].push({
          label: tag,
          color: this.getRandomLightColor(),
          fontColor: '#808080',
          type: 'default'
        })
        ipcRenderer.on('save-config-style', {
          changed: { tags: true },
          data: { tags: tags },
          addTag: true
        })
      },
      handleStyleSave: function () {
        let changed = {
          theme: false && (this.rawStyle.theme !== this.settings.themeColor),
          tags: false
        }
        for (let categoryIndex = 0; categoryIndex < this.tags.length; categoryIndex++) {
          let children = this.tags[categoryIndex].children
          for (let tagIndex = 0; tagIndex < children.length; tagIndex++) {
            if (children[tagIndex].color !== this.rawStyle.tags[categoryIndex].children[tagIndex].color) {
              changed.tags = true
              break
            }
            if (children[tagIndex].fontColor !== this.rawStyle.tags[categoryIndex].children[tagIndex].fontColor) {
              changed.tags = true
              break
            }
          }
        }
        if (changed.theme || changed.tags) {
          let args = {
            changed: changed,
            data: {
              theme: this.rawStyle.theme,
              tags: this.rawStyle.tags
            }
          }
          ipcRenderer.send('save-config-style', args)
        } else {
          this.sendBubbleMessage({
            message: '样式未做任何修改',
            type: 'info',
            duration: 1000
          })
          this.styleVisible = false
        }
      },
      handleSettingsSave: function () {
        let changed = {
          hide: Boolean(this.settings.hide !== this.rawSettings.hide),
          mode: Boolean(this.settings.mode !== this.rawSettings.mode),
          autoOpen: Boolean(this.settings.autoOpen !== this.rawSettings.autoOpen)
        }
        if (!Object.values(changed).every(item => !item)) {
          ipcRenderer.send('save-config-settings', {
            data: this.rawSettings,
            changed: changed
          })
        } else {
          this.rawSettings = {}
          this.settingsVisible = false
          this.sendBubbleMessage({
            message: '设置未做任何修改',
            type: 'info',
            duration: 1000
          })
        }
      },
      // 获取失效类名
      getOverdueClassName: function ({row, rowIndex}) {
        return (new Date(row.deadline) <= new Date()) ? 'overdue' : ''
      },
      // 处理鼠标移入事件 (实际上需要点击)
      handleHiddenBarMouseEnter: function () {
        ipcRenderer.send('window-operation', { type: 'fix', unfold: true })
        this.pageHidden = false
      },
      // 处理删除非备选标签事件
      handleDeleteExternalTag: function () {
        let category = this.rawEditItem.category
        let categoryIndex = this.getCategoryIndex(category)
        let labels = this.todoList.filter(item => item.category === category).map(item => item.tag)
        this.tags[categoryIndex].children = this.tags[categoryIndex].children.filter(tagEntry => tagEntry.type !== 'external' || labels.includes(tagEntry.label))
        this.rawStyle = { tags: this.tags }
        ipcRenderer.send('save-config-style', {
          changed: { tags: true },
          data: { tags: this.tags },
          deleteTag: true
        })
      },
      // 处理图标点击事件
      handleClickEdit: function (_id) {
        let index = this.findIndexById(this.todoList, _id)
        this.rawEditItem = Object.assign({}, this.todoList[index])
        this.rawEditItem.deadline = new Date(this.rawEditItem.deadline)
        this.editVisible = true
      },
      handleClickAdd: function () {
        this.rawEditItem = {}
        this.rawEditItem.id = 0
        this.editVisible = true
      },
      handleClickCopy: function (_id) {
        let index = this.findIndexById(this.todoList, _id)
        let copiedItem = Object.assign({}, this.todoList[index])
        copiedItem.id = Date.now()
        copiedItem.expanded = false
        this.rawTodoList = Array.from(this.todoList)
        this.rawTodoList.splice(index + 1, 0, copiedItem)
        ipcRenderer.send('save-data', { data: this.rawTodoList, type: 'copy' })
      },
      handleClickMark: function (_id) {
        let index = this.findIndexById(this.todoList, _id)
        let copiedItem = Object.assign({}, this.todoList[index])
        copiedItem.finished = !copiedItem.finished
        copiedItem.expanded = false
        this.rawTodoList = Array.from(this.todoList)
        this.rawTodoList.splice(index, 1, copiedItem)
        ipcRenderer.send('save-data', { data: this.rawTodoList, type: 'mark' })
      },
      handleClickDelete: function (_id) {
        let index = this.findIndexById(this.todoList, _id)
        this.rawTodoList = Array.from(this.todoList)
        this.rawTodoList.splice(index, 1)
        ipcRenderer.send('save-data', { data: this.rawTodoList, type: 'delete' })
      },
      handleClickCamera: function () {
        // 展开所有
        for (let key in this.expanded[this.activeCategory]) { this.expanded[this.activeCategory][key] = true }
        this.todoList.forEach(item => item.expanded = true)
        // 隐藏部分元素
        this.takingScreenShot = true
        this.sendBubbleMessage({
          message: `请稍等，正在生成『${this.appName}』`,
          type: 'info',
          duration: 1000
        })
        // 等待 2s 生成 canvas
        setTimeout(() => {
          html2canvas(document.querySelector('.main-content')).then(canvas => {
            let a = document.createElement('a')
            a.href = canvas.toDataURL('image/png', 1.0)
            a.download = `${this.appName}.png`
            a.target = '_blank'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            // 恢复被隐藏的元素
            this.takingScreenShot = false
          })
        }, 2000)
      },
      handleClickStyle: function () {
        this.rawStyle = {
          theme: this.settings.themeColor,
          tags: JSON.parse(JSON.stringify(this.tags)),
          selected: {
            category: this.tags[0].label,
            tag: this.tags[0].children[0].label,
            color: this.handleTagColor(this.tags[0].label, this.tags[0].children[0].label, 'get'),
            fontColor: this.handleTagColor(this.tags[0].label, this.tags[0].children[0].label, 'get-font')
          }
        }
        this.styleVisible = true
      },
      handleClickCalendar: function () {
        this.calendar = new Date()
        this.calendarVisible = true
      },
      handleClickSettings: function () {
        this.settingsVisible = true
        this.rawSettings = Object.assign({}, this.settings)
      },
      handleClickGitHub: function (event) {
        event.preventDefault()
        shell.openExternal(this.github)
      },
      handleClickTest: function () {
        // todo
      },
      // 处理变化事件
      handleEditCategoryChange: function (value) {
        this.rawEditItem = Object.assign({}, this.rawEditItem, { tag: '' })
      },
      handleEditTagChange: function (tag) {
        if (this.getTagIndex(this.rawEditItem.category, tag) < 0) { this.editTagDialogVisible = true }
      },
      handleCategoryChange: function (category) {
        let tagEntry = this.getCategoryTags(category)[0]
        this.rawStyle.selected.tag = tagEntry.label
        this.rawStyle.selected.color = this.handleTagColor(category, tagEntry.label, 'get')
        this.rawStyle.selected.fontColor = this.handleTagColor(category, tagEntry.label, 'get-font')
      },
      handleTagChange: function (tag) {
        this.rawStyle.selected.color = this.handleTagColor(this.rawStyle.selected.category, tag, 'get')
        this.rawStyle.selected.fontColor = this.handleTagColor(this.rawStyle.selected.category, tag, 'get-font')
      },
      handleColorChange: function (color) {
        let [categoryIndex, tagIndex] = this.getCategoryTagIndex(this.rawStyle.selected.category, this.rawStyle.selected.tag)
        this.rawStyle.tags[categoryIndex].children[tagIndex].color = color
      },
      handleFontColorChange: function (fontColor) {
        let [categoryIndex, tagIndex] = this.getCategoryTagIndex(this.rawStyle.selected.category, this.rawStyle.selected.tag)
        this.rawStyle.tags[categoryIndex].children[tagIndex].fontColor = fontColor
      },
      // 处理展开事件
      handleLabelExpand: function (label) {
        this.expanded[this.activeCategory][label] = !this.expanded[this.activeCategory][label]
      },
      handleActivityExpand: function (_id) {
        let index = this.findIndexById(this.todoList, _id)
        this.todoList[index].expanded = !this.todoList[index].expanded
        this.todoList.splice(index, 1, this.todoList[index])
      },
      // 处理抽屉关闭事件
      handleEditDrawerClose: function () {
        this.editVisible = false
      },
      handleStyleDrawerClose: function () {
        this.styleVisible = false
      },
      handleSettingsDrawerClose: function () {
        this.settingsVisible = false
      },
      handleCalendarDrawerClose: function () {
        this.calendarVisible = false
      },
      // 预处理数据
      handlePreprocessData: function () {
        // 补充颜色
        let tagsIsChanged = false
        this.todoList.forEach(activity => {
          if (!this.handleTagColor(activity.category, activity.tag, 'exists')) {
            this.handleTagColor(activity.category, activity.tag, 'set')
            tagsIsChanged = true
          }
        })
        if (tagsIsChanged) {
          ipcRenderer.send('save-config-style', {
            changed: { tags: true },
            data: { tags: this.tags },
            init: true
          })
        }
      }
    },
    created: function () {
      if (config.settings.firstLogin) {
        this.setDefaultTodoList()
        ipcRenderer.send('data-init', { data: this.todoList })
      }
      this.todoList.forEach(item => item.expanded = false)
      let expanded = {}
      this.tags.forEach(item => {
        expanded[item.label] = (function () {
          return {
            '已完成/已失效': false,
            '今天内': true,
            '一周内': true,
            '更久': true
          }
        })()
      })
      this.expanded = Object.assign({}, expanded)
      this.sortTodoList(this.todoList)
      this.aboutMessages = [
        `你好😋，欢迎使用『${this.appName}』！`,
        `『${this.appName}』是一款免费的桌面便签，它的诞生，源于市面上难以找到美观好用，并且自由度高的免费桌面便签应用。`,
        `为了解决这个问题，作者开始尝试自学许多前端的知识，对程序的每一个细节精心打磨，经过多日的构思、编写、修改和打包，最终成就了『${this.appName}』。`,
        `希望『${this.appName}』能够在你不断前进的路上为你提供方便。`
      ]
      this.handlePreprocessData()
    }
  })
  ipcRenderer.on('data-init-reply', function (event, args) {
    if (args.code !== 0) {
      appElement.sendBubbleMessage({
        message: '程序出现未知问题 (code: 1.1)',
        type: 'error',
        duration: 1000
      })
    }
  })
  // 2
  ipcRenderer.on('blur-reply', function (event, args) {
    if (appElement.pageFixed && !appElement.pageHidden) {
      appElement.pageHidden = true
      ipcRenderer.send('window-operation', { type: 'fix', fold: true })
    }
  })
  // 3
  ipcRenderer.on('window-need-unfold', function (event, args) {
    appElement.pageHidden = false
    ipcRenderer.send('window-operation', { type: 'fix', unfold: true })
  })
  // 4
  ipcRenderer.on('save-data-reply', function (event, args) {
    let typeMaps = {
      'add': '添加',
      'edit': '编辑',
      'copy': '复制',
      'mark': '标记',
      'delete': '删除'
    }
    if (args.code === 0) {
      // 成功
      appElement.todoList = appElement.rawTodoList
      if (['add', 'edit'].includes(args.type)) {
        // 展开项目容器
        let deadlineType = appElement.getDeadlineType(appElement.rawEditItem)
        appElement.expanded[appElement.rawEditItem.category][deadlineType] = true
        appElement.expanded['综合'][deadlineType] = true
        appElement.editVisible = false
      }
      appElement.sendBubbleMessage({
        message: typeMaps[args.type] + '成功',
        type: 'success',
        duration: 1000
      })
    } else {
      // 失败
      appElement.sendBubbleMessage({
        message: typeMaps[args.type] + '失败',
        type: 'error',
        duration: 1000
      })
    }
    appElement.rawTodoList = []
  })
  // 5
  ipcRenderer.on('save-config-settings-reply', function (event, args) {
    if (args.code === 0) {
      if (args.args.changed.mode && appElement.rawSettings.mode === 'table') {
        appElement.pageFixed = false
        appElement.pageHidden = false
      }
      appElement.settings = appElement.rawSettings
      appElement.rawSettings = {}
      appElement.settingsVisible = false
      appElement.sendBubbleMessage({
        message: '设置保存成功',
        type: 'success',
        duration: 1000
      })
    } else {
      appElement.sendBubbleMessage({
        message: '设置保存失败',
        type: 'error',
        duration: 1000
      })
    }
  })
  // 6
  ipcRenderer.on('save-config-style-reply', function (event, args) {
    if (args.code === 0) {
      if (!args.init && !args.addTag && !args.deleteTag) {
        // 找到被修改的项
        for (let categoryIndex = 0; categoryIndex < appElement.rawStyle.tags.length; categoryIndex++) {
          let children = appElement.rawStyle.tags[categoryIndex].children
          for (let tagIndex = 0; tagIndex < children.length; tagIndex++) {
            if (children[tagIndex].color !== appElement.tags[categoryIndex].children[tagIndex].color) {
              appElement.tags[categoryIndex].children[tagIndex].color = children[tagIndex].color
            }
            if (children[tagIndex].fontColor !== appElement.tags[categoryIndex].children[tagIndex].fontColor) {
              appElement.tags[categoryIndex].children[tagIndex].fontColor = children[tagIndex].fontColor
            }
          }
        }
        appElement.styleVisible = false
        appElement.sendBubbleMessage({
          message: '样式修改成功',
          type: 'success',
          duration: 1000
        })
      } else if (args.addTag) {
        let categoryIndex = appElement.getCategoryIndex(appElement.rawEditItem.category)
        let categoryTags = appElement.rawStyle.tags[categoryIndex].children
        let newTag = Object.assign({}, categoryTags[categoryTags.length - 1])
        appElement.tags[categoryIndex].push(newTag)
        appElement.editTagDialogVisible = false
        appElement.sendBubbleMessage({
          message: '添加标签成功',
          type: 'success',
          duration: 1000
        })
      } else if (args.deleteTag) {
        appElement.sendBubbleMessage({
          message: '清除标签成功',
          type: 'success',
          duration: 1000
        })
      }
    } else {
      if (args.init) {
        appElement.sendBubbleMessage({
          message: '程序出现未知问题 (code: 6.1)',
          type: 'error',
          duration: 1000
        })
      } else if (args.addTag) {
        appElement.editTagDialogVisible = false
        appElement.sendBubbleMessage({
          message: '添加标签失败',
          type: 'error',
          duration: 1000
        })
      } else if (args.deleteTag) {
        appElement.sendBubbleMessage({
          message: '清除标签失败',
          type: 'error',
          duration: 1000
        })
      } else {
        appElement.styleVisible = false
        appElement.sendBubbleMessage({
          message: '样式保存失败',
          type: 'error',
          duration: 1000
        })
      }
    }
  })
  // 7
  ipcRenderer.on('save-config-active-category-reply', function (event, args) {
    if (args.code !== 0) {
      appElement.sendBubbleMessage({
        message: '程序出现未知问题 (code: 7.1)',
        type: 'error',
        duration: 1000
      })
    }
  })
  ipcRenderer.send('vue-init')
})

ipcRenderer.send('renderer-set')
