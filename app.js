// ==========================================
// 1. INITIALISATION CARTE LEAFLET
// ==========================================
let map, marker, polyline;
let watchId = null;
let pathCoordinates = []; // Stocke le tracé localement

// Session unique pour le partage
let sessionId = localStorage.getItem('livetrack_session_id');
if (!sessionId) {
    sessionId = 'session_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('livetrack_session_id', sessionId);
}

// Détection du mode spectateur (?session=... dans l'URL)
const urlParams = new URLSearchParams(window.location.search);
const sharedSessionId = urlParams.get('session');
const isViewer = Boolean(sharedSessionId);
const activeSessionId = isViewer ? sharedSessionId : sessionId;

window.addEventListener('DOMContentLoaded', () => {
    // Si spectateur : on masque la barre de boutons
    if (isViewer) {
        const controls = document.querySelector('.controls');
        if (controls) controls.style.display = 'none';
    }

    // Initialisation de la carte
    map = L.map('map').setView([46.603354, 1.888334], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    polyline = L.polyline([], { color: '#007bff', weight: 5, opacity: 0.8 }).addTo(map);

    setTimeout(() => { map.invalidateSize(); }, 300);
});

// ==========================================
// 2. INITIALISATION FIREBASE & SYNCHRO
// ==========================================
let database = null;
let locationRef = null;

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

try {
    if (typeof firebase !== 'undefined' && firebaseConfig.databaseURL !== "VOS_VRAIES_INFOS_FIREBASE") {
        firebase.initializeApp(firebaseConfig);
        database = firebase.database();
        
        // Référence vers la session en cours
        locationRef = database.ref('livetrack/sessions/' + activeSessionId);

        // RÉCEPTION EN TEMPS RÉEL (Surtout pour le spectateur)
        locationRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && isViewer) {
                // 1. Mise à jour du tracé complet
                if (data.path && Array.isArray(data.path)) {
                    polyline.setLatLngs(data.path);
                }
                
                // 2. Mise à jour de la position courante du marqueur
                if (data.currentLocation) {
                    const lat = data.currentLocation.latitude;
                    const lng = data.currentLocation.longitude;
                    updateMarker(lat, lng);
                }
            }
        });
    }
} catch (e) {
    console.warn("Firebase non initialisé.", e);
}

// ==========================================
// 3. CONTRÔLE GPS (POUR LE CYCLISTE)
// ==========================================

function startTracking() {
    if (!navigator.geolocation) {
        alert("GPS non supporté par ce téléphone.");
        return;
    }

    // Réinitialisation locale du tracé
    pathCoordinates = [];
    if (polyline) polyline.setLatLngs([]);
    if (marker) {
        map.removeLayer(marker);
        marker = null;
    }

    // Effacement des données de l'ancienne session dans Firebase
    if (locationRef) {
        locationRef.remove();
    }

    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    
    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
    stopBtn.disabled = false;
    stopBtn.style.opacity = '1';

    watchId = navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // Mettre à jour l'affichage du cycliste
            const newPos = [lat, lng];
            pathCoordinates.push(newPos);
            
            polyline.setLatLngs(pathCoordinates);
            updateMarker(lat, lng);

            // Envoyer à Firebase pour les proches
            sendToFirebase(lat, lng);
        },
        (error) => {
            alert("Erreur GPS : " + error.message);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 3000,
            timeout: 10000
        }
    );
}

function stopTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;

        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
        stopBtn.disabled = true;
        stopBtn.style.opacity = '0.5';

        showToast("Suivi arrêté.");
    }
}

function updateMarker(lat, lng) {
    const newPos = [lat, lng];
    if (!marker) {
        marker = L.marker(newPos).addTo(map);
        map.setView(newPos, 16);
    } else {
        marker.setLatLng(newPos);
    }
}

function sendToFirebase(lat, lng) {
    if (locationRef) {
        locationRef.set({
            currentLocation: {
                latitude: lat,
                longitude: lng,
                timestamp: Date.now()
            },
            path: pathCoordinates
        });
    }
}

// ==========================================
// 4. FONCTION DE PARTAGE
// ==========================================

function shareTrackingLink() {
    const shareUrl = window.location.origin + window.location.pathname + '?session=' + sessionId;

    const shareData = {
        title: 'Mon LiveTrack Vélo 🚴‍♂️',
        text: 'Suivez mon parcours en direct !',
        url: shareUrl
    };

    if (navigator.share) {
        navigator.share(shareData).catch(() => {});
    } else {
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast("Lien invité copié !");
        }).catch(() => {
            alert("Erreur de copie du lien.");
        });
    }
}

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.innerText = message;
    toast.style.display = "block";
    setTimeout(() => {
        toast.style.display = "none";
    }, 3000);
}
