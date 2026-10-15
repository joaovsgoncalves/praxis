import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import { prefetchRoute } from '@/lib/routePrefetch'
import { hasSessionHint } from '@/lib/sessionHint'
import '@/index.css'

// Começa a baixar a tela certa junto com a checagem de sessão, não depois dela.
const path = window.location.pathname
if (hasSessionHint()) {
  prefetchRoute('layout')
  prefetchRoute(path)
} else if (path === '/') {
  prefetchRoute('landing')
} else if (path === '/entrar') {
  prefetchRoute('login')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
