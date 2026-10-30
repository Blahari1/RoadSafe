import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";

const DEFAULT_POSITION = [12.9716, 77.5946];

function MapClickHandler({ onLocationSelect }) {
  useMapEvents({
    click(event) {
      onLocationSelect([event.latlng.lat, event.latlng.lng]);
    },
  });

  return null;
}

// Recenters the map whenever the selected position changes
// (for example after the user taps "Use my current location").
function MapRecenter({ position }) {
  const map = useMap();
  const lat = position?.[0];
  const lng = position?.[1];

  useEffect(() => {
    if (lat != null && lng != null) {
      map.setView([lat, lng], map.getZoom());
    }
  }, [map, lat, lng]);

  return null;
}

export default function LocationMap({
  position,
  onLocationSelect,
  label = "Selected breakdown location",
}) {
  const mapCenter = position || DEFAULT_POSITION;

  const markerPosition = mapCenter;

  return (
    <div className="w-full overflow-hidden rounded-xl border border-gray-200">
      <MapContainer
        center={mapCenter}
        zoom={13}
        scrollWheelZoom={true}
        style={{ height: "350px", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapClickHandler onLocationSelect={onLocationSelect} />
        <MapRecenter position={position} />

        <Marker position={markerPosition} key={markerPosition.join(",")}>
          <Popup>{label}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
