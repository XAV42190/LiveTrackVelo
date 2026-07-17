// 1. IMPORTATION DE FIREBASE DEPUIS LE CDN (Version moderne v10)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBE-6F7c2rF-f5DQDv3D9Wiu9l1eiNbY0s",
  authDomain: "suivisortievelo.firebaseapp.com",
  projectId: "suivisortievelo",
  storageBucket: "suivisortievelo.firebasestorage.app",
  messagingSenderId: "286724342837",
  appId: "1:286724342837:web:89c3838de2393123f31d7c",
  measurementId: "G-PQ9MQX0DQ5"
};

// Initialisation de Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ID unique de votre trajet. Vous pouvez le changer pour créer différentes sessions.
const rideId = "ma_sortie_velo_1"; 

// 2. Initialisation de la carte Leaflet
const map = L.map('map').setView([46.2276, 2.2137], 6); // Centré sur la France
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

let marker = null;
let path = L.polyline([], { color: '#10b981', weight: 5 }).addTo(map);

// 3. Écoute en temps réel de la base de données (Pour l'affichage sur la carte)
// Dès qu'une nouvelle coordonnée est envoyée à Firebase, la carte se met à jour
onValue(ref(db, `rides/${rideId}`), (snapshot) => {
    const data = snapshot.val();
    if (data) {
        const { lat, lng } = data;
        const coords = [lat, lng];
        
        if (!marker) {
            marker = L.marker(coords).addTo(map);
            map.setView(coords, 16); // Zoom sur le cycliste au démarrage
        } else {
            marker.setLatLng(coords);
        }
        path.addLatLng(coords);
    }
});

// 4. Gestion de la PWA et du Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(() => console.log("Service Worker OK"))
        .catch(err => console.error(err));
}

// 5. Connexion Bluetooth (Pour le cycliste)
const btnConnect = document.getElementById('btn-connect');
const statusText = document.getElementById('status');

btnConnect.addEventListener('click', async () => {
    try {
        statusText.innerText = "Recherche de votre compteur...";
        
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [
                '00001819-0000-1000-8000-00805f9b34fb', // Service de navigation standard
                'cycling_speed_and_cadence'
            ]
        });

        statusText.innerText = `Connexion à ${device.name}...`;
        const server = await device.gatt.connect();
        
        // Connexion au flux GPS
        const service = await server.getPrimaryService('location_and_navigation');
        const characteristic = await service.getCharacteristic(0x2A67);

        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', handleGpsData);
        
        statusText.innerText = `Connecté à ${device.name} ! Le suivi est actif.`;
        btnConnect.style.display = 'none';

        if ('wakeLock' in navigator) {
            await navigator.wakeLock.request('screen');
        }

    } catch (error) {
        console.error(error);
        statusText.innerText = "Erreur de connexion : " + error.message;
    }
});

// 6. Extraction des données GPS Bluetooth
function handleGpsData(event) {
    const value = event.target.value;
    
    try {
        // Lecture de la latitude (octets 2 à 5) et longitude (octets 6 à 9) selon la norme BLE
        const latRaw = value.getInt32(2, true); 
        const lngRaw = value.getInt32(6, true);
        
        const latitude = latRaw / 10000000;
        const longitude = lngRaw / 10000000;

        // Écriture du diagnostic sur l'écran du téléphone pour vos tests :
        document.getElementById('status').innerText = `GPS reçu : ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

        if (latitude && longitude && latitude !== 0) {
            envoyerAuServeur(latitude, longitude);
        }
    } catch (err) {
        document.getElementById('status').innerText = "Erreur lecture GPS : " + err.message;
    }
}

// 7. Envoi direct vers Firebase Realtime Database
function envoyerAuServeur(lat, lng) {
    set(ref(db, `rides/${rideId}`), {
        lat: lat,
        lng: lng,
        timestamp: Date.now()
    })
    .then(() => console.log("Position envoyée à Firebase !"))
    .catch(err => console.error("Erreur d'envoi Firebase : ", err));
}