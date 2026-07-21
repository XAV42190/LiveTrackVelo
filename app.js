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
// Initialisation de Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const locationRef = database.ref('livetrack/currentLocation');

// ==========================================
// 2. INITIALISATION DE LA CARTE LEAFLET
// ==========================================
// Coordonnées par défaut (France / Paris) au premier chargement
const map = L.map('map').setView([46.603354, 1.888334], 6);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

let marker = null;
let polyline = L.polyline([], { color: '#007bff', weight: 4 }).addTo(map);
let watchId = null;

// ==========================================
// 3. FONCTIONS DE GÉOLOCALISATION & SUIVI
// ==========================================

function startTracking() {
    if (!navigator.geolocation) {
        alert("La géolocalisation n'est pas supportée par votre appareil.");
        return;
    }

    // Gestion visuelle des boutons
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    
    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
    stopBtn.disabled = false;
    stopBtn.style.opacity = '1';

    // Démarrage du capteur GPS mobile
    watchId = navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // Update local
            updateMap(lat, lng);

            // Update Firebase pour la diffusion en direct
            sendLocationToFirebase(lat, lng);
        },
        (error) => {
            console.error("Erreur GPS :", error.message);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 5000
        }
    );
}

function stopTracking() {
    if (watchId !== null) {
        // Arrêt de la lecture du GPS (préserve la batterie et stoppe la mise à jour)
        navigator.geolocation.clearWatch(watchId);
        watchId = null;

        // Gestion visuelle des boutons
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
        stopBtn.disabled = true;
        stopBtn.style.opacity = '0.5';

        showToast("Suivi arrêté. Le tracé reste affiché.");
    }
}

// Mise à jour de la carte (marqueur + ligne du parcours)
function updateMap(lat, lng) {
    const newPos = [lat, lng];

    if (!marker) {
        marker = L.marker(newPos).addTo(map);
        map.setView(newPos, 15);
    } else {
        marker.setLatLng(newPos);
    }

    // Ajoute le point actuel à la ligne de parcours sans l'effacer
    polyline.addLatLng(newPos);
}

// Envoi de la position dans la base Firebase
function sendLocationToFirebase(lat, lng) {
    locationRef.set({
        latitude: lat,
        longitude: lng,
        timestamp: Date.now()
    });
}

// ==========================================
// 4. ÉCOUTE DE FIREBASE (MODE SPECTATEUR)
// ==========================================
// Si quelqu'un ouvre l'application via le lien partagé, la carte se met à jour en direct
locationRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data && data.latitude && data.longitude) {
        // Met à jour la carte pour la personne qui consulte le lien
        if (watchId === null) { 
            updateMap(data.latitude, data.longitude);
        }
    }
});

// ==========================================
// 5. FONCTIONS DE PARTAGE & NOTIFICATIONS
// ==========================================

function shareTrackingLink() {
    const shareData = {
        title: 'Mon LiveTrack Vélo 🚴‍♂️',
        text: 'Suivez ma position en direct sur la carte !',
        url: window.location.href
    };

    // 1. Menu de partage natif (sur smartphone Android / iOS)
    if (navigator.share) {
        navigator.share(shareData).catch(() => {});
    } else {
        // 2. Fallback rapide pour ordinateur (Copie dans le presse-papier)
        navigator.clipboard.writeText(window.location.href).then(() => {
            showToast("Lien copié dans le presse-papier !");
        }).catch(err => {
            alert("Erreur de copie : " + err);
        });
    }
}

// Bulle d'information visuelle
function showToast(message) {
    const toast = document.getElementById("toast");
    toast.innerText = message;
    toast.style.display = "block";
    setTimeout(() => {
        toast.style.display = "none";
    }, 3000);
}
