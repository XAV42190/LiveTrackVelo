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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Variables de gestion de session
let rideId = "";
let firebaseListener = null;

// Initialisation de la carte Leaflet
const map = L.map('map').setView([46.2276, 2.2137], 6); // Centré sur la France
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

let marker = null;
let path = L.polyline([], { color: '#10b981', weight: 5 }).addTo(map);

// --- GESTION DES SESSIONS DYNAMIQUES ---

function initialiserSession() {
    // Vérifie si un proche ouvre un lien de partage (ex: ?ride=Thomas_171589139)
    const urlParams = new URLSearchParams(window.location.search);
    const sessionDemandee = urlParams.get('ride');

    if (sessionDemandee) {
        rideId = sessionDemandee;
        // Mode Spectateur : On masque le bandeau de contrôle du cycliste
        document.getElementById('header').style.display = 'none'; 
        ecouterFirebase();
    } else {
        // Mode Cycliste : On crée une session locale par défaut
        definirNouvelleSession();
    }
}

function definirNouvelleSession() {
    const rawName = document.getElementById('username').value.trim();
    const cleanName = rawName.replace(/\s+/g, '_') || "Cycliste";
    const timestamp = Date.now();
    
    // Génération de l'ID unique de session
    rideId = `${cleanName}_${timestamp}`;
    
    // Nettoyer la carte et basculer sur la nouvelle écoute
    resetCarte();
    ecouterFirebase();
    
    document.getElementById('status').innerText = "Prêt. En attente de connexion au compteur...";
}

function resetCarte() {
    if (marker) {
        map.removeLayer(marker);
        marker = null;
    }
    path.setLatLngs([]);
}

function ecouterFirebase() {
    // On nettoie l'écouteur précédent si existant
    if (firebaseListener) {
        off(ref(db, `rides/${rideId}`));
    }

    // Écoute en temps réel de la position stockée
    firebaseListener = onValue(ref(db, `rides/${rideId}`), (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const { lat, lng } = data;
            const coords = [lat, lng];
            
            if (!marker) {
                marker = L.marker(coords).addTo(map);
                map.setView(coords, 16); // Centre et zoom sur le cycliste au premier point
            } else {
                marker.setLatLng(coords);
            }
            path.addLatLng(coords);
        }
    });
}

// --- CONNEXION BLUETOOTH COMPTEUR GPS ---

const btnConnect = document.getElementById('btn-connect');
const statusText = document.getElementById('status');

btnConnect.addEventListener('click', async () => {
    try {
        statusText.innerText = "Recherche de votre compteur GPS (BLE)...";
        
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [
                '00001819-0000-1000-8000-00805f9b34fb', // Service de Localisation et Navigation
                'cycling_speed_and_cadence'
            ]
        });

        statusText.innerText = `Connexion à ${device.name}...`;
        const server = await device.gatt.connect();
        
        statusText.innerText = "Configuration des flux de navigation...";
        
        // Utilisation des UUIDs complets officiels sur 128 bits (Requis pour Garmin)
        const service = await server.getPrimaryService('00001819-0000-1000-8000-00805f9b34fb'); 
        const characteristic = await service.getCharacteristic('00002a67-0000-1000-8000-00805f9b34fb'); // Location and Speed

        // Lancement de l'écoute des notifications du compteur
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', handleGpsData);
        
        statusText.innerText = `Connecté à ${device.name} ! Activez le GPS et faites 'START'`;
        btnConnect.style.display = 'none';

        // Maintien de l'écran allumé si l'application reste visible
        if ('wakeLock' in navigator) {
            await navigator.wakeLock.request('screen');
        }

    } catch (error) {
        console.error(error);
        statusText.innerText = "Erreur de connexion : " + error.message;
    }
});

// --- DECODAGE DES DONNEES GPS DU COMPTEUR ---

function handleGpsData(event) {
    const value = event.target.value;
    
    // Lecture des champs Latitude (octets 2-5) et Longitude (octets 6-9) au format Int32 standard BLE
    const latRaw = value.getInt32(2, true); 
    const lngRaw = value.getInt32(6, true);
    
    // Conversion des dix-millionièmes de degrés en degrés décimaux
    const latitude = latRaw / 10000000;
    const longitude = lngRaw / 10000000;

    // Validation et envoi des données
    if (latitude && longitude && latitude !== 0 && longitude !== 0) {
        statusText.innerText = `📡 GPS OK : ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        
        // Pousse la coordonnée dans Firebase
        set(ref(db, `rides/${rideId}`), {
            lat: latitude,
            lng: longitude,
            timestamp: Date.now()
        }).catch(err => console.error("Erreur Firebase : ", err));
    } else {
        statusText.innerText = "Compteur connecté | En attente d'un signal GPS valide à l'extérieur...";
    }
}

// Action de réinitialisation de sortie
document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm("Voulez-vous clôturer cette sortie et en démarrer une nouvelle ?")) {
        definirNouvelleSession();
        const shareUrl = `${window.location.origin}${window.location.pathname}?ride=${rideId}`;
        alert("Envoyez ce lien à vos proches pour qu'ils vous suivent :\n\n" + shareUrl);
    }
});

// Enregistrement du Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.error(err));
}

// Initialisation globale au chargement de la page
initialiserSession();