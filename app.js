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

// Variables de gestion de session et de GPS
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
        // Mode Spectateur : On masque le bandeau de contrôle
        document.getElementById('header').style.display = 'none'; 
        ecouterFirebase();
    } else {
        // Mode Cycliste : Création de la session par défaut
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
    
    document.getElementById('status').innerText = "Prêt. Connectez votre compteur pour démarrer.";
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

    // Écoute en temps réel de la position stockée sur la carte
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

// --- CONNEXION BLUETOOTH & GESTION GPS HYBRIDE ---

const btnConnect = document.getElementById('btn-connect');
const statusText = document.getElementById('status');

btnConnect.addEventListener('click', async () => {
    try {
        statusText.innerText = "Recherche de votre compteur GPS (BLE)...";
        
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [
                '00001819-0000-1000-8000-00805f9b34fb', // Localisation standard
                '00001816-0000-1000-8000-00805f9b34fb'  // Vitesse/Cadence standard (Geoid, Magene, etc.)
            ]
        });

        statusText.innerText = `Connexion à ${device.name}...`;
        const server = await device.gatt.connect();
        
        statusText.innerText = "Recherche des fonctionnalités du compteur...";
        
        // 1. TENTATIVE ACTIVATION FLUX CADENCE/VITESSE (Pour Geoid CC600 et semblables)
        try {
            const serviceCsc = await server.getPrimaryService('00001816-0000-1000-8000-00805f9b34fb');
            const characteristicCsc = await serviceCsc.getCharacteristic('00002a5b-0000-1000-8000-00805f9b34fb');
            await characteristicCsc.startNotifications();
            console.log("Canal de vitesse/cadence activé.");
        } catch (e) {
            console.log("Service CSC non disponible.");
        }

        // 2. TENTATIVE ACTIVATION FLUX GPS DU COMPTEUR
        try {
            const serviceGps = await server.getPrimaryService('00001819-0000-1000-8000-00805f9b34fb'); 
            const characteristicGps = await serviceGps.getCharacteristic('00002a67-0000-1000-8000-00805f9b34fb');
            await characteristicGps.startNotifications();
            characteristicGps.addEventListener('characteristicvaluechanged', handleGpsDataCompteur);
            console.log("Flux GPS standard du compteur activé.");
        } catch (e) {
            console.log("Ce compteur ne partage pas son GPS en Bluetooth (ex: Geoid).");
        }

        // 3. ACTIVATION AUTOMATIQUE DU GPS DE SECOURS (Téléphone)
        if (document.getElementById('use-phone-gps').checked) {
            activerGpsSecoursTelephone();
        } else {
            statusText.innerText = `Connecté à ${device.name} ! Démarrer l'activité.`;
        }

        btnConnect.style.display = 'none';

        if ('wakeLock' in navigator) {
            await navigator.wakeLock.request('screen');
        }

    } catch (error) {
        console.error(error);
        statusText.innerText = "Erreur de connexion : " + error.message;
    }
});

// Décodage si le compteur envoie son GPS en direct
function handleGpsDataCompteur(event) {
    const value = event.target.value;
    const latRaw = value.getInt32(2, true); 
    const lngRaw = value.getInt32(6, true);
    
    const latitude = latRaw / 10000000;
    const longitude = lngRaw / 10000000;

    if (latitude && longitude && latitude !== 0 && longitude !== 0) {
        statusText.innerText = `📡 GPS Compteur OK : ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        envoyerAElementFirebase(latitude, longitude);
    }
}

// Fonction de captation du GPS du téléphone pour les compteurs Geoid/Magene
function activerGpsSecoursTelephone() {
    if ("geolocation" in navigator) {
        statusText.innerText = "Compteur connecté + LiveTrack actif !";
        
        phoneGpsWatchId = navigator.geolocation.watchPosition((position) => {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;
            
            if (latitude && longitude) {
                statusText.innerText = `📡 LiveTrack Actif : ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
                envoyerAElementFirebase(latitude, longitude);
            }
        }, (error) => {
            console.error("Erreur GPS Téléphone : ", error);
            statusText.innerText = "Erreur : Veuillez autoriser le GPS sur votre téléphone.";
        }, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000
        });
    }
}

// Fonction unique d'envoi vers Firebase
function envoyerAElementFirebase(lat, lng) {
    set(ref(db, `rides/${rideId}`), {
        lat: lat,
        lng: lng,
        timestamp: Date.now()
    }).catch(err => console.error("Erreur Firebase : ", err));
}

// Action sur le bouton "Nouvelle Sortie"
document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm("Voulez-vous clôturer cette sortie et en démarrer une nouvelle ?")) {
        if (phoneGpsWatchId) {
            navigator.geolocation.clearWatch(phoneGpsWatchId);
        }
        definirNouvelleSession();
        const shareUrl = `${window.location.origin}${window.location.pathname}?ride=${rideId}`;
        alert("Lien de suivi pour vos proches :\n\n" + shareUrl);
    }
});

// Enregistrement du Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.error(err));
}

// Initialisation globale au chargement de la page
initialiserSession();