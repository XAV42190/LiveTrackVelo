// 1. IMPORTATION DE FIREBASE DEPUIS LE CDN (Version moderne v10)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getDatabase, ref, set, onValue, off } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-database.js";

// === CONFIGURATION FIREBASE ===
// Remplacez par vos clés issues de la console Firebase
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

// Variables globales
let rideId = "";
let firebaseListener = null;
let phoneGpsWatchId = null;

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
        // Mode Cycliste
        definirNouvelleSession();
    }
}

function definirNouvelleSession() {
    const rawName = document.getElementById('username').value.trim();
    const cleanName = rawName.replace(/\s+/g, '_') || "Cycliste";
    const timestamp = Date.now();
    
    rideId = `${cleanName}_${timestamp}`;
    
    resetCarte();
    ecouterFirebase();
    
    document.getElementById('status').innerText = "Prêt. Cliquez sur 'Démarrer le LiveTrack'.";
}

function resetCarte() {
    if (marker) {
        map.removeLayer(marker);
        marker = null;
    }
    path.setLatLngs([]);
}

function ecouterFirebase() {
    if (firebaseListener) {
        off(ref(db, `rides/${rideId}`));
    }

    // Écoute en temps réel des coordonnées stockées
    firebaseListener = onValue(ref(db, `rides/${rideId}`), (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const { lat, lng } = data;
            const coords = [lat, lng];
            
            if (!marker) {
                marker = L.marker(coords).addTo(map);
                map.setView(coords, 16);
            } else {
                marker.setLatLng(coords);
            }
            path.addLatLng(coords);
        }
    });
}

// --- SUIVI GPS DU TELEPHONE ---

const btnStart = document.getElementById('btn-start');
const statusText = document.getElementById('status');

btnStart.addEventListener('click', async () => {
    if ("geolocation" in navigator) {
        statusText.innerText = "Recherche du signal GPS du téléphone...";
        
        // Maintien de l'écran allumé
        if ('wakeLock' in navigator) {
            try { await navigator.wakeLock.request('screen'); } catch (e) {}
        }

        // Écoute continue de la position avec haute précision
        phoneGpsWatchId = navigator.geolocation.watchPosition((position) => {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;
            
            if (latitude && longitude) {
                statusText.innerText = `📡 LiveTrack Actif : ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
                
                // Envoi vers Firebase
                set(ref(db, `rides/${rideId}`), {
                    lat: latitude,
                    lng: longitude,
                    timestamp: Date.now()
                }).catch(err => console.error("Erreur Firebase : ", err));
            }
        }, (error) => {
            console.error("Erreur GPS Téléphone : ", error);
            statusText.innerText = "Erreur : Veuillez autoriser la géolocalisation sur votre téléphone.";
        }, {
            enableHighAccuracy: true, // Force l'utilisation de la puce GPS
            maximumAge: 0,
            timeout: 10000
        });

        btnStart.style.display = 'none';

    } else {
        alert("La géolocalisation n'est pas supportée par votre téléphone.");
    }
});

// Action du bouton "Nouvelle Sortie"
document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm("Voulez-vous clôturer cette sortie et en démarrer une nouvelle ?")) {
        if (phoneGpsWatchId) {
            navigator.geolocation.clearWatch(phoneGpsWatchId);
        }
        btnStart.style.display = 'inline-block';
        definirNouvelleSession();
        
        const shareUrl = `${window.location.origin}${window.location.pathname}?ride=${rideId}`;
        alert("Lien de suivi pour vos proches :\n\n" + shareUrl);
    }
});

// Enregistrement du Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.error(err));
}

// Initialisation au chargement
initialiserSession();
