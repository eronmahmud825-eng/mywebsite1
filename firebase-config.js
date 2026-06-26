// firebase-config.js

const firebaseConfig = {
  apiKey: "AIzaSyAcirrvSgPgb4zBkSMJg8G0WIqQdqqtOsM",
  authDomain: "consulate-d6691.firebaseapp.com",
  projectId: "consulate-d6691",
  storageBucket: "consulate-d6691.firebasestorage.app",
  messagingSenderId: "459011165720",
  appId: "1:459011165720:web:40d50df68038219f49fd6d",
  measurementId: "G-E5SQ8LW47N"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
