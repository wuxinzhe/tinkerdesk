import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'

// 全局设计变量
import './styles/variables.css'

// HarmonyOS Sans 字体
import './styles/fonts.css'

// 代码高亮主题
import 'highlight.js/styles/github.css'

// Naive UI
import naive from 'naive-ui'
import { naiveThemeOverrides } from './styles/naive-theme'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(naive, { themeOverrides: naiveThemeOverrides } as never)

app.mount('#app')
