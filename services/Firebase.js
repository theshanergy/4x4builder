import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const config = {
    apiKey: 'AIzaSyCKr3INNC3yRuwnJbkUOcA7Bhv6N5_EYaY',
    authDomain: 'x4configurator.firebaseapp.com',
    databaseURL: 'https://x4configurator.firebaseio.com',
    projectId: 'x4configurator',
    storageBucket: '',
    messagingSenderId: 737407290004,
}

const app = initializeApp(config)

export const database = getDatabase(app)
