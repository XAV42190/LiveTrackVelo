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

// Initialisation sécurisée
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
const locationRef = database.ref('livetrack/currentLocation');

// ==========================================
// 2. INITIALISATION CARTE LEAFLET
// ==========================================
// Centré par défaut sur la France
const map = L.map('map').setView([46.603354, 1.888334], 6);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

let marker = null;
let polyline = L.polyline([], { color: '#007bff', weight: 5, opacity: 0.8 }).addTo(map);
let watchId = null;

// Fix pour forcer l'affichage complet des tuiles de la carte
setTimeout(() => { map.invalidateSize(); }, 500);

// ==========================================
// 3. SUIVI GPS & BOUTONS
// ==========================================

function startTracking() {
    if (!navigator.geolocation) {
        alert("GPS non supporté par votre appareil.");
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

            updateMap(lat, lng);
            sendLocationToFirebase(lat, lng);
        },
        (error) => {
            console.error("Erreur GPS :", error.message);
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
    locationRef.set({
        latitude: lat,
        longitude: lng,
        timestamp: Date.now()
    });
}

// ==========================================
// 4. RÉCEPTION DU SIGNAL (MODE SPECTATEUR)
// ==========================================
locationRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data && data.latitude && data.longitude) {
        // Met à jour la carte pour les proches qui observent
        if (watchId === null) { 
            updateMap(data.latitude, data.longitude);
        }
    }
});

// ==========================================
// 5. PARTAGE DU LIEN
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
            alert("Erreur lors de la copie du lien.");
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
