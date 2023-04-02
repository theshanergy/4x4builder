import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './components/App'
import * as serviceWorker from './serviceWorker'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)

// Register service worker for offline / install.
serviceWorker.register()
