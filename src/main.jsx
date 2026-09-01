import React from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted so the terminal renders identically on conference wifi, or none.
// The screen's canvas painter measures with these metrics — see terminal/theme.js.
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(<App />)
