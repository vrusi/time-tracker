import { createApp } from 'vue'
import { createPinia } from 'pinia'
import roughness from 'roughness'
import 'roughness/dist/style.css'
import App from './App.vue'
import './style.css'
import './assets/shared.css'

const app = createApp(App)
app.use(createPinia())
app.use(roughness)
app.mount('#app')
