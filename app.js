// ==========================================
// 1. INITIALISATION CARTE LEAFLET
// ==========================================
let map, marker, polyline;
let watchId = null;

// Initialisation au chargement de la page
window.addEventListener('DOMContentLoaded', () => {
    // Crée la carte Leaflet (Centrée sur la France par défaut)
    map = L.map('map').setView([46.603354, 1.888334], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    polyline = L.polyline([], { color: '#007bff', weight: 5, opacity: 0.8 }).addTo(map);

    // Correction d'affichage si l'écran redimensionne
    setTimeout(() => { map.invalidateSize(); }, 300);
});

// ==========================================
// 2. INITIALISATION SÉCURISÉE FIREBASE
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
        locationRef = database.ref('livetrack/currentLocation');

        // Mode spectateur (Écoute Firebase)
        locationRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && data.latitude && data.longitude && watchId === null) { 
                updateMap(data.latitude, data.longitude);
            }
        });
    }
} catch (e) {
    console.warn("Firebase non initialisé ou clés absentes. Mode GPS local actif uniquement.", e);
}

// ==========================================
// 3. CONTRÔLE DU GPS & DES BOUTONS
// ==========================================

function startTracking() {
    if (!navigator.geolocation) {
        alert("La géolocalisation n'est pas supportée par votre navigateur.");
        return;
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

            // Update carte localement
            updateMap(lat, lng);

            // Update Firebase si configuré
            sendLocationToFirebase(lat, lng);
        },
        (error) => {
            alert("Erreur d'accès au GPS : " + error.message);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 0,
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

        showToast("Suivi arrêté. Le tracé est conservé.");
    }
}

function updateMap(lat, lng) {
    if (!map) return;
    const newPos = [lat, lng];

    if (!marker) {
        marker = L.marker(newPos).addTo(map);
        map.setView(newPos, 16);
    } else {
        marker.setLatLng(newPos);
    }

    polyline.addLatLng(newPos);
}

function sendLocationToFirebase(lat, lng) {
    if (locationRef) {
        locationRef.set({
            latitude: lat,
            longitude: lng,
            timestamp: Date.now()
        });
    }
}

// ==========================================
// 4. PARTAGE ET NOTIFICATIONS
// ==========================================

function shareTrackingLink() {
    const shareData = {
        title: 'Mon LiveTrack Vélo 🚴‍♂️',
        text: 'Suivez mon parcours en direct !',
        url: window.location.href
    };

    if (navigator.share) {
        navigator.share(shareData).catch(() => {});
    } else {
        navigator.clipboard.writeText(window.location.href).then(() => {
            showToast("Lien copié dans le presse-papier !");
        }).catch(() => {
            alert("Impossible de copier le lien automatiquement.");
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
