import React from 'react'
import ReactDOM from 'react-dom'
import App from './components/App'
import * as serviceWorker from './serviceWorker'
import { database } from './services/Firebase'
import ReactGA from 'react-ga'

// Google Analytics.
ReactGA.initialize('UA-2733360-16')

// Log initial pageview.
ReactGA.pageview(window.location.pathname)

// Log errors.
if (typeof window.onerror === 'object') {
  window.onerror = (error, url, line) => {
    ReactGA.exception({
      description: line + ': ' + error,
    })
  }
}

ReactDOM.render(
  <React.StrictMode>
    <App database={database} analytics={ReactGA} />
  </React.StrictMode>,
  document.getElementById('root')
)

// Register service worker for offline / install.
serviceWorker.register()
