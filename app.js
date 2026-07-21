// ==========================================
// 1. INITIALISATION CARTE LEAFLET
// ==========================================
let map, marker, polyline;
let watchId = null;
let pathCoordinates = []; // Contient [[lat, lng], [lat, lng], ...]

// Gestion de la session
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
    // Si spectateur : masquer les commandes
    if (isViewer) {
        const controls = document.querySelector('.controls');
        if (controls) controls.style.display = 'none';
        
        // Petit message pour confirmer qu'on est en mode invité
        showToast("Mode spectateur actif");
    }

    // Initialisation carte
    map = L.map('map').setView([46.603354, 1.888334], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    polyline = L.polyline([], { color: '#007bff', weight: 6, opacity: 0.9 }).addTo(map);

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
        
        // Écoute spécifique de la session
        locationRef = database.ref('livetrack/sessions/' + activeSessionId);

        // RÉCEPTION TEMPS RÉEL
        locationRef.on('value', (snapshot) => {
            const data = snapshot.val();
            
            if (data) {
                console.log("Données Firebase reçues :", data);

                // Reconstitution du tracé
                if (data.path) {
                    // Si Firebase a converti le tableau en objet, on le ré-insère sous forme de tableau
                    const rawPath = Array.isArray(data.path) ? data.path : Object.values(data.path);
                    
                    // Conversion sécurisée pour Leaflet [lat, lng]
                    const formattedPath = rawPath.map(point => {
                        if (Array.isArray(point)) return point; // Déjà [lat, lng]
                        if (point.latitude && point.longitude) return [point.latitude, point.longitude]; // Format objet
                        if (point.lat && point.lng) return [point.lat, point.lng];
                        return null;
                    }).filter(p => p !== null);

                    if (formattedPath.length > 0) {
                        polyline.setLatLngs(formattedPath);
                    }
                }
                
                // Position actuelle + Recentrage de la carte
                if (data.currentLocation) {
                    const lat = Number(data.currentLocation.latitude);
                    const lng = Number(data.currentLocation.longitude);
                    
                    if (!isNaN(lat) && !isNaN(lng)) {
                        updateMarkerAndCenter(lat, lng);
                    }
                }
            }
        }, (error) => {
            console.error("Erreur de lecture Firebase :", error);
            alert("Erreur Firebase (Droits de lecture) : " + error.message);
        });
    }
} catch (e) {
    console.error("Erreur Firebase Init :", e);
}

// ==========================================
// 3. CONTRÔLE GPS & ENVOI (CYCLISTE)
// ==========================================

function startTracking() {
    if (!navigator.geolocation) {
        alert("GPS non supporté.");
        return;
    }

    // Réinitialisation
    pathCoordinates = [];
    if (polyline) polyline.setLatLngs([]);
    if (marker) {
        map.removeLayer(marker);
        marker = null;
    }

    if (locationRef) {
        locationRef.remove(); // Nettoie la session précédente sur Firebase
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

            const newPoint = [lat, lng];
            pathCoordinates.push(newPoint);
            
            // Mise à jour locale du cycliste
            polyline.setLatLngs(pathCoordinates);
            updateMarkerAndCenter(lat, lng);

            // Envoi à Firebase
            sendToFirebase(lat, lng);
        },
        (error) => {
            alert("Erreur GPS : " + error.message);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 2000,
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

function updateMarkerAndCenter(lat, lng) {
    const pos = [lat, lng];
    if (!marker) {
        marker = L.marker(pos).addTo(map);
        map.setView(pos, 16);
    } else {
        marker.setLatLng(pos);
        // Si c'est l'invité, la carte suit le mouvement automatiquement
        if (isViewer) {
            map.panTo(pos);
        }
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
// 4. PARTAGE ET UTILS
// ==========================================

function shareTrackingLink() {
    const shareUrl = window.location.origin + window.location.pathname + '?session=' + sessionId;

    const shareData = {
        title: 'Suivi vélo en direct 🚴‍♂️',
        text: 'Suis ma position et mon tracé en direct !',
        url: shareUrl
    };

    if (navigator.share) {
        navigator.share(shareData).catch(() => {});
    } else {
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast("Lien copié dans le presse-papier !");
        }).catch(() => {
            alert("Erreur lors de la copie.");
        });
    }
}

function showToast(message) {
    const toast = document.getElementById("toast");
    if (toast) {
        toast.innerText = message;
        toast.style.display = "block";
        setTimeout(() => { toast.style.display = "none"; }, 3000);
    }
}
