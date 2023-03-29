import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import * as serviceWorker from './serviceWorker'
import { database } from './services/Firebase'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App database={database} />
    </React.StrictMode>
)

// Register service worker for offline / install.
serviceWorker.register()
